import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { User, type IUser } from '../models/User';
import { loadApiEnv } from '@services/config/src/env';

function setAuthCookie(reply: FastifyReply, token: string, isProd: boolean) {
  // In production we need SameSite=None and Secure for cross-site usage (e.g. different domains)
  // In local development (http://localhost), many browsers reject SameSite=None without Secure,
  // so we prefer Lax which still works across different ports on the same site.
  const sameSite: 'lax' | 'strict' | 'none' = isProd ? 'none' : 'lax';
  reply.setCookie('userToken', token, {
    httpOnly: true,
    secure: isProd, // true in prod (requires HTTPS), false on localhost
    sameSite,
    path: '/',
    maxAge: 60 * 60, // seconds
  });
}

export async function registerUserRoutes(app: FastifyInstance) {
  const env = loadApiEnv();
  const isProd = env.NODE_ENV === 'production';

  const googleClientId = env.GOOGLE_CLIENT_ID;
  const oauthClient = googleClientId ? new OAuth2Client(googleClientId) : null;

  // POST /api/users/login/google
  app.post('/api/users/login/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({ idToken: z.string().min(1) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!googleClientId || !oauthClient) return reply.code(500).send({ error: 'Google auth not configured' });

    const { idToken } = parsed.data;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken, audience: googleClientId });
      const payload = ticket.getPayload();
      if (!payload) return reply.code(401).send({ error: 'Invalid Google token' });

      const googleId = payload.sub!;
      const email = (payload.email || '').toLowerCase();
      const emailVerified = payload.email_verified === true;
      const name = payload.name || email?.split('@')[0] || 'User';
      const picture = payload.picture || undefined;

      if (!emailVerified || !email) return reply.code(401).send({ error: 'Unverified Google account' });

      // find by googleId or email
      let user = await User.findOne({ $or: [{ googleId }, { email }] });
      const isNewUser = !user;
      if (!user) {
        // create username unique slug from name/email local part
        const base = (name || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
        let username = base;
        let i = 0;
        // ensure uniqueness
        while (await User.exists({ username })) {
          i += 1;
          username = `${base}-${i}`;
        }
        user = await User.create({ username, email, name, role: 'user', googleId, avatar: picture });
      } else {
        const update: Partial<IUser> = {} as any;
        if (!user.googleId) (update as any).googleId = googleId;
        if (picture) (update as any).avatar = picture;
        if (Object.keys(update).length) user = await User.findByIdAndUpdate(user._id, { $set: update }, { new: true });
      }

      // bump sessionVersion
      user = await User.findByIdAndUpdate(user!._id, { $inc: { sessionVersion: 1 } }, { new: true });

      // sign JWT and set cookie
      const payloadJwt = { userId: user!._id.toString(), email: user!.email, role: user!.role, sessionVersion: user!.sessionVersion } as const;
      const token = app.jwt.sign(payloadJwt, { expiresIn: '1h' });
      setAuthCookie(reply, token, isProd);

      return reply.send({ message: 'Login successful', isNewUser });
    } catch (e) {
      (req as any).log?.error?.({ err: e }, 'Google login failed');
      return reply.code(401).send({ error: 'Invalid Google token' });
    }
  });

  // GET /api/users/me
  app.get('/api/users/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.cookies as any)?.userToken as string | undefined;
    if (!token) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      const decoded = app.jwt.verify(token) as { userId: string; sessionVersion: number } & { email: string; role: string };
      const user = await User.findById(decoded.userId).lean<IUser | null>();
      if (!user) return reply.code(401).send({ error: 'Invalid session' });
      if (user.sessionVersion !== decoded.sessionVersion) return reply.code(401).send({ error: 'Session expired' });
      return reply.send({ id: user._id.toString(), email: user.email, name: user.name, role: user.role });
    } catch (e) {
      return reply.code(401).send({ error: 'Invalid session' });
    }
  });

  // POST /api/users/logout -> clear cookie
  app.post('/api/users/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    const sameSite: 'lax' | 'strict' | 'none' = isProd ? 'none' : 'lax';
    reply.clearCookie('userToken', { path: '/', sameSite, secure: isProd });
    return reply.send({ ok: true });
  });

  // POST /api/users/logout/all -> bump sessionVersion and clear cookie
  app.post('/api/users/logout/all', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.cookies as any)?.userToken as string | undefined;
    if (token) {
      try {
        const decoded = app.jwt.verify(token) as { userId: string };
        await User.findByIdAndUpdate(decoded.userId, { $inc: { sessionVersion: 1 } });
      } catch {
        // ignore
      }
    }
    const sameSite: 'lax' | 'strict' | 'none' = isProd ? 'none' : 'lax';
    reply.clearCookie('userToken', { path: '/', sameSite, secure: isProd });
    return reply.send({ ok: true });
  });
}
