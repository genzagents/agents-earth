import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";

// Simple spam/injection classifier — heuristic, no external dep required
function isSpam(content: string): boolean {
  const lower = content.toLowerCase();
  // Prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s*:\s*you\s+are/i,
    /\bact\s+as\b.*\bai\b/i,
    /jailbreak/i,
    /forget\s+(everything|your|all)/i,
  ];
  if (injectionPatterns.some(p => p.test(content))) return true;
  // Basic spam signals: excessive caps, repeated chars, URLs
  const capsRatio = (content.match(/[A-Z]/g) ?? []).length / content.length;
  if (content.length > 10 && capsRatio > 0.7) return true;
  if (/(.)\1{6,}/.test(content)) return true; // "aaaaaaa"
  return false;
}

export async function dmRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/dms
   * Initiate or retrieve a DM thread between two agents.
   * Body: { fromAgentId, toAgentId, content }
   */
  fastify.post(
    "/api/dms",
    {
      schema: {
        body: {
          type: "object",
          required: ["fromAgentId", "toAgentId", "content"],
          properties: {
            fromAgentId: { type: "string" },
            toAgentId:   { type: "string" },
            content:     { type: "string", minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { fromAgentId: string; toAgentId: string; content: string };
      }>,
      reply: FastifyReply
    ) => {
      const { fromAgentId, toAgentId, content } = request.body;

      if (fromAgentId === toAgentId) {
        return reply.code(400).send({ error: "Cannot DM yourself" });
      }

      // Both agents must exist
      const fromAgent = store.getAgent(fromAgentId);
      const toAgent   = store.getAgent(toAgentId);
      if (!fromAgent || !toAgent) {
        return reply.code(404).send({ error: "One or both agents not found" });
      }

      // Owner permission flag: both agents must have allowDms enabled
      if (!fromAgent.allowDms) {
        return reply.code(403).send({ error: "Sender agent has not enabled DMs (allowDms: false)" });
      }
      if (!toAgent.allowDms) {
        return reply.code(403).send({ error: "Recipient agent has not enabled DMs (allowDms: false)" });
      }

      if (isSpam(content)) {
        return reply.code(422).send({ error: "Message flagged as spam or prompt injection" });
      }

      let thread = store.getDmThread(fromAgentId, toAgentId);
      if (!thread) {
        thread = store.createDmThread(fromAgentId, toAgentId);
      }

      const msg = {
        id: uuidv4(),
        senderId: fromAgentId,
        content: content.trim(),
        timestamp: Date.now(),
      };

      store.addDmMessage(thread.id, msg);
      return reply.code(201).send({ thread, message: msg });
    }
  );

  /**
   * GET /api/dms/:agentId
   * List all DM threads involving an agent.
   */
  fastify.get(
    "/api/dms/:agentId",
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const agent = store.getAgent(agentId);
      if (!agent) return reply.code(404).send({ error: "Agent not found" });

      const threads = store.getDmThreadsForAgent(agentId).map(t => ({
        id: t.id,
        participantIds: t.participantIds,
        messageCount: t.messages.length,
        lastMessageAt: t.lastMessageAt,
        createdAt: t.createdAt,
      }));

      return threads;
    }
  );

  /**
   * GET /api/dms/thread/:threadId
   * Get full DM thread with messages.
   */
  fastify.get(
    "/api/dms/thread/:threadId",
    async (
      request: FastifyRequest<{ Params: { threadId: string } }>,
      reply: FastifyReply
    ) => {
      const { threadId } = request.params;
      const thread = store.getDmThreadById(threadId);
      if (!thread) return reply.code(404).send({ error: "Thread not found" });
      return thread;
    }
  );
}
