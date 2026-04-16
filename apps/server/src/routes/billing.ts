import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { getOrCreateCredits, getUsageLog } from "../billing/TokenMeter";
import { runConsolidationPass } from "../jobs/MemoryConsolidationJob";

const SESSION_COOKIE = "agentcolony_session";

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<{ userId: string } | null> {
  let token: string | undefined;
  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[SESSION_COOKIE];
  }
  if (!token) { reply.code(401).send({ error: "Not authenticated" }); return null; }
  const session = await findSession(token);
  if (!session) { reply.code(401).send({ error: "Session expired" }); return null; }
  const user = await findUserById(session.userId);
  if (!user) { reply.code(401).send({ error: "User not found" }); return null; }
  return { userId: user.id };
}

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/billing/balance
   * Returns the authenticated user's current credit balance.
   */
  fastify.get("/api/billing/balance", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const credits = await getOrCreateCredits(auth.userId);
    return reply.send({
      balancePence: credits.balancePence,
      balancePounds: (credits.balancePence / 100).toFixed(2),
      commonsPence: credits.commonsPence,
      totalSpentPence: credits.totalSpentPence,
      lowBalance: credits.balancePence < 50,
    });
  });

  /**
   * GET /api/billing/usage
   * Returns recent token usage log for the authenticated user.
   */
  fastify.get(
    "/api/billing/usage",
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 200);
      const log = await getUsageLog(auth.userId, limit);
      return reply.send({ usage: log });
    }
  );

  /**
   * POST /api/jobs/consolidate-all
   * Manual trigger for memory consolidation (admin/testing + Azure Functions timer).
   * In production, protect with an internal API key or IP allowlist.
   */
  fastify.post("/api/jobs/consolidate-all", async (request, reply) => {
    const cronKey = process.env.CRON_SECRET;
    const provided = request.headers["x-cron-secret"];
    if (cronKey && provided !== cronKey) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    runConsolidationPass(fastify.log).catch((err) =>
      fastify.log.warn({ err }, "Manual consolidation failed")
    );

    return reply.send({ ok: true, message: "Consolidation pass started" });
  });
};
