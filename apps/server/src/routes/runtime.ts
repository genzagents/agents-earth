import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import {
  findAgentById,
  findAgentsByUser,
  createAgent,
  updateAgent,
  deleteAgent,
  clearConversation,
  getConversation,
} from "../db/ownedAgentStore";
import { runtimeService } from "../runtime/RuntimeService";

const SESSION_COOKIE = "agentcolony_session";

async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ userId: string } | null> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    reply.code(401).send({ error: "Not authenticated" });
    return null;
  }
  const session = await findSession(token);
  if (!session) {
    reply.code(401).send({ error: "Session expired" });
    return null;
  }
  const user = await findUserById(session.userId);
  if (!user) {
    reply.code(401).send({ error: "User not found" });
    return null;
  }
  return { userId: user.id };
}

export const runtimeRoutes: FastifyPluginAsync = async (fastify) => {
  // ---- Agent CRUD ----

  fastify.get("/api/agents", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const agents = await findAgentsByUser(auth.userId);
    return reply.send({ agents });
  });

  fastify.post(
    "/api/agents",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1 },
            description: { type: "string" },
            systemPrompt: { type: "string" },
            model: { type: "string" },
            avatarColor: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          systemPrompt?: string;
          model?: string;
          avatarColor?: string;
        };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { name, description, systemPrompt, model, avatarColor } = request.body;
      const agent = await createAgent({
        userId: auth.userId,
        name,
        description,
        systemPrompt,
        model,
        avatarColor,
      });
      return reply.code(201).send({ agent });
    }
  );

  fastify.get(
    "/api/agents/:agentId",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const agent = await findAgentById(request.params.agentId);
      if (!agent || agent.userId !== auth.userId) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      return reply.send({ agent });
    }
  );

  fastify.patch(
    "/api/agents/:agentId",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            description: { type: "string" },
            systemPrompt: { type: "string" },
            model: { type: "string" },
            avatarColor: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: {
          name?: string;
          description?: string;
          systemPrompt?: string;
          model?: string;
          avatarColor?: string;
        };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const updated = await updateAgent(request.params.agentId, auth.userId, request.body);
      if (!updated) return reply.code(404).send({ error: "Agent not found" });
      return reply.send({ agent: updated });
    }
  );

  fastify.delete(
    "/api/agents/:agentId",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const deleted = await deleteAgent(request.params.agentId, auth.userId);
      if (!deleted) return reply.code(404).send({ error: "Agent not found" });
      return reply.code(204).send();
    }
  );

  // ---- Conversation history ----

  fastify.get(
    "/api/agents/:agentId/conversation",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const agent = await findAgentById(request.params.agentId);
      if (!agent || agent.userId !== auth.userId) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      const messages = await getConversation(request.params.agentId, auth.userId);
      return reply.send({ messages });
    }
  );

  fastify.delete(
    "/api/agents/:agentId/conversation",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const agent = await findAgentById(request.params.agentId);
      if (!agent || agent.userId !== auth.userId) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      await clearConversation(request.params.agentId, auth.userId);
      return reply.send({ ok: true });
    }
  );

  // ---- Runtime invocation ----

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
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { agentId, message } = request.body;

      try {
        const result = await runtimeService.invoke({
          agentId,
          userId: auth.userId,
          message,
        });
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invocation failed";
        if (message.startsWith("Forbidden")) return reply.code(403).send({ error: message });
        if (message.includes("not found")) return reply.code(404).send({ error: message });
        fastify.log.error({ err }, "Runtime invoke error");
        return reply.code(500).send({ error: "Internal error during agent invocation" });
      }
    }
  );

  /**
   * POST /api/runtime/invoke/stream
   * Same as invoke but streams response as SSE (text/event-stream).
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
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { agentId, message } = request.body;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      try {
        for await (const chunk of runtimeService.invokeStream({
          agentId,
          userId: auth.userId,
          message,
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
};
