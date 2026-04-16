import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { findAgentById } from "../db/ownedAgentStore";
import {
  getWorkingMemory,
  recallEpisodes,
  listEpisodes,
  writeEpisode,
  getSemanticFacts,
  upsertSemanticFact,
  deleteSemanticFact,
  consolidate,
  type WorkingMemory,
} from "../memory/MemoryService";

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

async function requireAgentAccess(
  agentId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const agent = await findAgentById(agentId);
  if (!agent || agent.userId !== userId) {
    reply.code(404).send({ error: "Agent not found" });
    return false;
  }
  return true;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  // ---- Tier 1: Working memory ----

  fastify.get(
    "/api/memory/:agentId/working",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const working = await getWorkingMemory(request.params.agentId, auth.userId);
      return reply.send({ working });
    }
  );

  // ---- Tier 2: Episodic memory ----

  fastify.get(
    "/api/memory/:agentId/recall",
    async (
      request: FastifyRequest<{ Params: { agentId: string }; Querystring: { query?: string; limit?: string } }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;

      const query = request.query.query ?? "";
      const limit = Math.min(parseInt(request.query.limit ?? "5", 10), 20);

      const episodes = query
        ? await recallEpisodes(request.params.agentId, auth.userId, query, limit)
        : await listEpisodes(request.params.agentId, auth.userId, limit);

      return reply.send({ episodes });
    }
  );

  fastify.post(
    "/api/memory/:agentId/episode",
    {
      schema: {
        body: {
          type: "object",
          required: ["summary", "messages"],
          properties: {
            summary: { type: "string", minLength: 1 },
            messages: { type: "array" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: { summary: string; messages: WorkingMemory["recentMessages"]; tags?: string[] };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;

      const episode = await writeEpisode({
        agentId: request.params.agentId,
        userId: auth.userId,
        summary: request.body.summary,
        messages: request.body.messages,
        tags: request.body.tags,
      });
      return reply.code(201).send({ episode });
    }
  );

  // ---- Tier 3: Semantic facts ----

  fastify.get(
    "/api/memory/:agentId/facts",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const facts = await getSemanticFacts(request.params.agentId, auth.userId);
      return reply.send({ facts });
    }
  );

  fastify.put(
    "/api/memory/:agentId/facts",
    {
      schema: {
        body: {
          type: "object",
          required: ["key", "value"],
          properties: {
            key: { type: "string", minLength: 1 },
            value: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: { key: string; value: string; confidence?: number };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const fact = await upsertSemanticFact({
        agentId: request.params.agentId,
        userId: auth.userId,
        key: request.body.key,
        value: request.body.value,
        confidence: request.body.confidence,
      });
      return reply.send({ fact });
    }
  );

  fastify.delete(
    "/api/memory/:agentId/facts/:factId",
    async (request: FastifyRequest<{ Params: { agentId: string; factId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const deleted = await deleteSemanticFact(request.params.factId, request.params.agentId, auth.userId);
      if (!deleted) return reply.code(404).send({ error: "Fact not found" });
      return reply.code(204).send();
    }
  );

  // ---- Consolidation (manual trigger) ----

  fastify.post(
    "/api/memory/:agentId/consolidate",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const agent = await findAgentById(request.params.agentId);
      if (!agent || agent.userId !== auth.userId) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const result = await consolidate(
        request.params.agentId,
        auth.userId,
        async (messages) => {
          // Use Claude to generate a summary and extract semantic facts
          const resp = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            system:
              "You are a memory consolidation assistant. Given a conversation, produce a JSON object with two fields:\n" +
              '- "summary": a 1-2 sentence summary of what was discussed\n' +
              '- "facts": an array of {"key": string, "value": string} pairs for notable preferences, facts, or patterns learned\n' +
              "Return only valid JSON.",
            messages: [
              {
                role: "user",
                content: `Conversation to consolidate:\n\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
              },
            ],
          });

          const text = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");

          try {
            const parsed = JSON.parse(text) as { summary: string; facts: Array<{ key: string; value: string }> };
            return { summary: parsed.summary ?? "Conversation summary", facts: parsed.facts ?? [] };
          } catch {
            return { summary: text.slice(0, 200), facts: [] };
          }
        }
      );

      return reply.send(result);
    }
  );
};
