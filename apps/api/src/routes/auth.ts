import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { User, IUser } from '../models/User';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../services/mailer';
import { loadApiEnv } from '@services/config/src/env';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  // Optional role for bootstrapping admins; defaults to 'user'
  role: z.enum(['admin', 'user']).default('user').optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  // Check if an email exists (useful for client-side validation flows)
  app.post('/auth/check-email', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email } = parsed.data;
    const exists = await User.exists({ email });
    return reply.send({ exists: !!exists });
  });

  app.post('/auth/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, name, password, role = 'user' } = parsed.data as any;

    const exists = await User.findOne({ email }).lean();
    if (exists) return reply.code(409).send({ error: 'Email already registered' });

    const passwordHash = await argon2.hash(password);
    // Generate unique username from name or email local part
    const base = (name || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
    let username = base;
    let i = 0;
    while (await User.exists({ username })) {
      i += 1;
      username = `${base}-${i}`;
    }
    const user = await User.create({ username, email, name, role, passwordHash });

    const payload = { sub: user._id.toString(), role: user.role } as const;
    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign(payload, { expiresIn: '30d' });

    return reply.send({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      tokens: { accessToken, refreshToken },
    });
  });

  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const user = await User.findOne({ email });
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    if (!user.passwordHash) return reply.code(401).send({ error: 'Invalid credentials' });
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    const payload = { sub: user._id.toString(), role: user.role } as const;
    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign(payload, { expiresIn: '30d' });

    return reply.send({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      tokens: { accessToken, refreshToken },
    });
  });

  app.post('/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = req.headers.authorization?.split(' ')[1];
      if (!auth) return reply.code(401).send({ error: 'Missing token' });
      const payload = app.jwt.verify(auth) as { sub: string; role?: string };
      const accessToken = app.jwt.sign({ sub: payload.sub, role: payload.role }, { expiresIn: '15m' });
      return reply.send({ accessToken });
    } catch (e) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });

  app.get('/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      // Prefer userId from authGuard (supports both header and cookie-based sessions)
      const userIdFromGuard = (req as any).userId as string | undefined;
      let userId = userIdFromGuard;

      if (!userId) {
        const auth = req.headers.authorization?.split(' ')[1];
        if (!auth) return reply.code(401).send({ error: 'Missing token' });
        const payload = app.jwt.verify(auth) as { sub: string };
        userId = payload.sub;
      }

      const user = await User.findById(userId).lean<IUser | null>();
      if (!user) return reply.code(404).send({ error: 'Not found' });
      return reply.send({ id: user._id.toString(), email: user.email, name: user.name, role: user.role });
    } catch (e) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Update current user (basic profile)
  app.patch('/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({ name: z.string().min(1).max(100).optional() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return reply.code(401).send({ error: 'Missing token' });
    const jwtPayload = app.jwt.verify(auth) as { sub: string };

    const update: Partial<IUser> = {} as any;
    if (parsed.data.name !== undefined) (update as any).name = parsed.data.name;

    const user = await User.findByIdAndUpdate(jwtPayload.sub, { $set: update }, { new: true }).lean<IUser | null>();
    if (!user) return reply.code(404).send({ error: 'Not found' });
    return reply.send({ id: user._id.toString(), email: user.email, name: user.name, role: user.role });
  });
  // Delete the current user's account
  app.delete('/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = req.headers.authorization?.split(' ')[1];
      if (!auth) return reply.code(401).send({ error: 'Missing token' });
      const payload = app.jwt.verify(auth) as { sub: string };

      const user = await User.findById(payload.sub);
      if (!user) return reply.code(404).send({ error: 'Not found' });

      await User.deleteOne({ _id: user._id });

      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Request password reset
  app.post('/auth/forgot-password', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email } = parsed.data;

    const user = await User.findOne({ email });
    if (!user) {
      // Do not reveal existence
      return reply.send({ ok: true });
    }

    // Rate limit: enforce cooldown between reset requests (e.g., 5 minutes)
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const nowMs = Date.now();
    const lastRequested = (user as any).resetPasswordRequestedAt ? new Date((user as any).resetPasswordRequestedAt).getTime() : 0;
    if (lastRequested && nowMs - lastRequested < COOLDOWN_MS) {
      // Within cooldown window; do not send another email but respond success
      return reply.send({ ok: true });
    }

    // Generate token and store hashed with expiry
    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await User.findByIdAndUpdate(user._id, { $set: { resetPasswordTokenHash: tokenHash, resetPasswordExpires: expires, resetPasswordRequestedAt: new Date() } });

    const env = loadApiEnv();
    const base = env.WEB_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${base}/account/reset-password?token=${tokenRaw}`;

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    } catch (e) {
      req.log?.error({ err: e }, 'Failed to send reset email');
      // Best effort; do not leak error details to client
    }

    return reply.send({ ok: true });
  });

  // Reset password
  app.post('/auth/reset-password', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({ token: z.string().min(10), password: z.string().min(8) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { token, password } = parsed.data;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const user = await User.findOne({ resetPasswordTokenHash: tokenHash, resetPasswordExpires: { $gt: now } });
    if (!user) return reply.code(400).send({ error: 'Invalid or expired token' });

    const passwordHash = await argon2.hash(password);
    // Clear reset fields and bump sessionVersion to invalidate existing sessions
    await User.findByIdAndUpdate(user._id, { $set: { passwordHash }, $unset: { resetPasswordTokenHash: 1, resetPasswordExpires: 1 }, $inc: { sessionVersion: 1 } });

    return reply.send({ ok: true });
  });
}
