import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import jwt from '@fastify/jwt';
import { loadApiEnv } from '@services/config/src/env';
import { connectMongo } from './db/mongo';
import { registerAuthRoutes } from './routes/auth';
import authGuard from './plugins/authGuard';
import cookie from '@fastify/cookie';
import { registerUserRoutes } from './routes/users';
import { registerIntegrationRoutes } from './routes/integrations';
import { AsterDexSyncService } from './services/asterDexSync';

dotenv.config();

async function bootstrap() {
  const env = loadApiEnv();

  const app = Fastify({ logger: true, trustProxy: env.NODE_ENV === 'production' });

  const origins = (env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) || []);
  const origin = origins.length > 0 ? origins : env.CORS_ORIGIN ?? true;
  await app.register(cors, { origin, credentials: true });

  await connectMongo(env.MONGODB_URI);

  // Single JWT instance; set different expirations at sign time in routes
  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(cookie);

  // Attach auth guard to populate req.userId when Authorization header is present
  await app.register(authGuard);

  app.get('/health', async () => ({ status: 'ok' }));

  // Debug auth endpoint
  app.get('/debug/auth', async (req, reply) => {
    const authHeader = req.headers.authorization;
    const cookies: any = (req as any).cookies || {};

    let headerPayload: any = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        headerPayload = app.jwt.verify(token);
      } catch (e) {
        headerPayload = { error: 'invalid header token', details: (e as any)?.message };
      }
    }

    let cookiePayload: any = null;
    if (typeof cookies.userToken === 'string') {
      try {
        cookiePayload = app.jwt.verify(cookies.userToken);
      } catch (e) {
        cookiePayload = { error: 'invalid cookie token', details: (e as any)?.message };
      }
    }

    return reply.send({
      userId: (req as any).userId ?? null,
      userRole: (req as any).userRole ?? null,
      hasAuthHeader: !!authHeader,
      authHeader: authHeader || null,
      hasUserTokenCookie: typeof cookies.userToken === 'string',
      cookies,
      headerPayload,
      cookiePayload,
    });
  });

  // Routes
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  const { registerTradeRoutes } = await import('./routes/trades');
  await registerTradeRoutes(app);
  await registerIntegrationRoutes(app);

  if (env.ASTERDEX_ENABLED) {
    const missing: string[] = [];
    if (!env.ASTERDEX_USER_ID) missing.push('ASTERDEX_USER_ID');
    if (!env.ASTERDEX_USER_ADDRESS) missing.push('ASTERDEX_USER_ADDRESS');
    if (!env.ASTERDEX_SIGNER_ADDRESS) missing.push('ASTERDEX_SIGNER_ADDRESS');
    if (!env.ASTERDEX_SIGNER_PRIVATE_KEY) missing.push('ASTERDEX_SIGNER_PRIVATE_KEY');

    if (missing.length > 0) {
      app.log.warn({ missing }, 'Aster DEX sync disabled because required env vars are missing');
    } else {
      try {
        const syncService = new AsterDexSyncService(
          {
            pollIntervalMs: env.ASTERDEX_POLL_INTERVAL_MS ?? 60_000,
            userId: env.ASTERDEX_USER_ID!,
          },
          {
            futuresBaseURL: env.ASTERDEX_BASE_URL ?? 'https://fapi.asterdex.com',
            spotBaseURL: env.ASTERDEX_SPOT_BASE_URL ?? 'https://api.asterdex.com',
            userAddress: env.ASTERDEX_USER_ADDRESS!,
            signerAddress: env.ASTERDEX_SIGNER_ADDRESS!,
            signerPrivateKey: env.ASTERDEX_SIGNER_PRIVATE_KEY!,
            recvWindowMs: env.ASTERDEX_RECV_WINDOW_MS,
          },
          app.log,
        );
        app.asterDexSync = syncService;
        app.log.info('Aster DEX sync initialized; waiting for authenticated owner session before starting scheduler');
        app.addHook('onClose', async () => {
          syncService.stop();
        });
      } catch (err) {
        app.log.error({ err }, 'Failed to initialize Aster DEX sync');
      }
    }
  } else {
    app.log.info('Aster DEX sync disabled via configuration');
  }

  const port = env.PORT;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
