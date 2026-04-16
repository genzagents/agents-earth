import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { findAgentById, getConversation } from "../db/ownedAgentStore";
import { runtimeService } from "../runtime/RuntimeService";

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

export const runtimeRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/runtime/invoke
   * Invoke an agent synchronously; returns the full response.
   * Body: { agentId: string, message: string }
   * Response: { response: string, tokensUsed: { input, output, total } }
   */
  fastify.post(
    "/api/runtime/invoke",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId", "message"],
          properties: {
            agentId: { type: "string" },
            message: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { agentId: string; message: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      try {
        const result = await runtimeService.invoke({
          agentId: request.body.agentId,
          userId: auth.userId,
          message: request.body.message,
        });
        return reply.send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invocation failed";
        if (msg.startsWith("Forbidden")) return reply.code(403).send({ error: msg });
        if (msg.includes("not found")) return reply.code(404).send({ error: msg });
        fastify.log.error({ err }, "Runtime invoke error");
        return reply.code(500).send({ error: "Internal error during agent invocation" });
      }
    }
  );

  /**
   * POST /api/runtime/invoke/stream
   * Invoke an agent with SSE streaming response.
   * Body: { agentId: string, message: string }
   * Emits: data: {"chunk": "..."} lines, terminated by data: [DONE]
   */
  fastify.post(
    "/api/runtime/invoke/stream",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId", "message"],
          properties: {
            agentId: { type: "string" },
            message: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { agentId: string; message: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      // Pre-validate agent existence and ownership before committing to SSE
      const agent = await findAgentById(request.body.agentId);
      if (!agent) return reply.code(404).send({ error: `Agent ${request.body.agentId} not found` });
      if (agent.userId !== auth.userId) return reply.code(403).send({ error: "Forbidden: agent does not belong to user" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      try {
        for await (const chunk of runtimeService.invokeStream({
          agentId: request.body.agentId,
          userId: auth.userId,
          message: request.body.message,
        })) {
          reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
        reply.raw.write("data: [DONE]\n\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream failed";
        reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      } finally {
        reply.raw.end();
      }
    }
  );

  /**
   * GET /api/agents/:id/conversation
   * Returns the full conversation history for the specified agent.
   * Response: { messages: Array<{ role: "user" | "assistant", content: string }> }
   */
  fastify.get(
    "/api/agents/:id/conversation",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const agent = await findAgentById(request.params.id);
      if (!agent || agent.userId !== auth.userId) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const messages = await getConversation(request.params.id, auth.userId);
      return reply.send({ messages });
    }
  );
};
