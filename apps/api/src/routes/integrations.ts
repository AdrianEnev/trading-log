import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function requireAuth(req: FastifyRequest, reply: FastifyReply): req is FastifyRequest & { userId: string } {
  if (!req.userId) {
    reply.code(401).send({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

export async function registerIntegrationRoutes(app: FastifyInstance) {
  app.post('/integrations/asterdex/sync', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const syncService = app.asterDexSync;
    if (!syncService) {
      return reply.code(503).send({ error: 'Aster DEX sync is disabled' });
    }

    const isOwner = req.userId === syncService.userId;
    const isAdmin = req.userRole === 'admin';
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const stats = await syncService.syncOnce();
    return reply.send({ ok: true, stats });
  });
}
