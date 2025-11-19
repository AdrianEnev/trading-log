import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

function maybeStartAsterDexSync(app: FastifyInstance, req: FastifyRequest) {
  const syncService = app.asterDexSync;
  if (!syncService) return;
  if (!req.userId) return;

  const isOwner = req.userId === syncService.userId;
  if (!isOwner) return;
  if (syncService.isRunning()) return;

  app.log.info({ userId: req.userId }, 'authGuard: owner authenticated; starting Aster DEX sync');
  syncService.start();
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
  }
}

export default fp(async (app) => {
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    const cookies: any = (req as any).cookies;

    const headerToken = auth?.startsWith('Bearer ') ? auth.split(' ')[1] : undefined;
    const cookieToken = cookies && typeof cookies.userToken === 'string' ? cookies.userToken : undefined;

    // IMPORTANT: prefer cookie-based session (Google login) over header token
    let token: string | undefined;
    let source: 'header' | 'cookie' | 'none' = 'none';

    if (cookieToken) {
      token = cookieToken;
      source = 'cookie';
    } else if (headerToken) {
      token = headerToken;
      source = 'header';
    }

    if (!token) {
      app.log.info({ path: req.url, source, hasAuthHeader: !!auth }, 'authGuard: no token found');
      return;
    }

    try {
      const payload = app.jwt.verify(token) as any;
      // Support both { sub } (password login) and { userId } (Google cookie login)
      req.userId = payload.sub ?? payload.userId;
      if (payload.role) req.userRole = payload.role;
      app.log.info({ path: req.url, source, userId: req.userId, role: req.userRole }, 'authGuard: authenticated request');
      maybeStartAsterDexSync(app, req);
    } catch (e) {
      app.log.warn({ err: e, path: req.url, source }, 'authGuard: token verification failed');
      // ignore, route can still enforce auth explicitly
    }
  });
});
