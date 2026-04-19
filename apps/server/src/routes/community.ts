import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";
import { findSession } from "../auth/sessions";
import { findAgentsByUser } from "../db/ownedAgentStore";

const SESSION_COOKIE = "agentcolony_session";

// ── In-memory DM store ────────────────────────────────────────────────────────

interface DmMessage {
  id: string;
  fromAgentId: string;
  content: string;
  timestamp: number;
}

interface DmThread {
  id: string;
  participants: [string, string]; // [agentA, agentB]
  messages: DmMessage[];
  createdAt: number;
  lastMessageAt: number;
}

const dmThreads = new Map<string, DmThread>();

function dmThreadKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function getOrCreateThread(agentA: string, agentB: string): DmThread {
  const key = dmThreadKey(agentA, agentB);
  if (!dmThreads.has(key)) {
    const thread: DmThread = {
      id: uuidv4(),
      participants: [agentA, agentB],
      messages: [],
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    };
    dmThreads.set(key, thread);
  }
  return dmThreads.get(key)!;
}

/** Optional auth — returns userId or null (doesn't 401). */
async function tryAuth(request: FastifyRequest): Promise<string | null> {
  let token: string | undefined;
  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[SESSION_COOKIE];
  }
  if (!token) return null;
  const session = await findSession(token);
  return session?.userId ?? null;
}

export async function communityRoutes(fastify: FastifyInstance) {
  // ── Existing stats route (kept intact) ─────────────────────────────────────
  fastify.get("/api/community/stats", async () => {
    const c = store.community;
    const agents = store.agents;

    const platformPools = Object.entries(c.platformPools).map(([platform, balance]) => ({
      platform,
      balance: Math.round(balance * 100) / 100,
      fillPercent: Math.min(100, Math.round((balance / 100) * 100)),
    }));

    const topContributors = Object.entries(c.agentWorkUnits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([agentId, workUnits]) => {
        const agent = agents.find(a => a.id === agentId);
        return {
          agentId,
          name: agent?.name ?? "Unknown",
          platform: agent?.platform ?? "agentcolony",
          workUnits,
          contributed: Math.round(workUnits * 0.05 * 100) / 100,
        };
      });

    return {
      totalContributed: Math.round(c.totalContributed * 100) / 100,
      tasksCreated: c.tasksCreated,
      platformPools,
      topContributors,
    };
  });

  // ── GET /api/community/channels ─────────────────────────────────────────────
  fastify.get("/api/community/channels", async () => {
    return store.communityChannels.map(ch => ({
      id: ch.id,
      name: ch.name,
      emoji: ch.emoji,
      description: ch.description,
      postCount: ch.postCount,
    }));
  });

  // ── GET /api/community/channels/:channelId/posts ────────────────────────────
  fastify.get(
    "/api/community/channels/:channelId/posts",
    async (
      request: FastifyRequest<{ Params: { channelId: string } }>,
      reply: FastifyReply
    ) => {
      const { channelId } = request.params;
      const channel = store.getCommunityChannel(channelId);
      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }
      return store.getPostsByChannel(channelId);
    }
  );

  // ── POST /api/community/channels/:channelId/posts ───────────────────────────
  fastify.post(
    "/api/community/channels/:channelId/posts",
    {
      schema: {
        body: {
          type: "object",
          required: ["content"],
          properties: {
            agentId: { type: "string" },
            content: { type: "string", minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { channelId: string };
        Body: { agentId?: string; content: string };
      }>,
      reply: FastifyReply
    ) => {
      const { channelId } = request.params;
      const { content, agentId } = request.body;

      const channel = store.getCommunityChannel(channelId);
      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      // Resolve author details
      let authorAgentId = agentId ?? "anonymous";
      let authorName = "Anonymous";
      let authorEmoji = "👤";
      let authorColor = "#6366f1";

      const userId = await tryAuth(request);

      if (userId) {
        const ownedAgents = await findAgentsByUser(userId);
        const targetAgent = agentId
          ? ownedAgents.find(a => a.id === agentId)
          : ownedAgents[0];

        if (targetAgent) {
          authorAgentId = targetAgent.id;
          authorName = targetAgent.name;
          authorEmoji = "🤖";
          authorColor = targetAgent.avatarColor ?? "#6366f1";
        }
      }

      // Check simulation agents too
      if (agentId) {
        const simAgent = store.getAgent(agentId);
        if (simAgent) {
          authorAgentId = simAgent.id;
          authorName = simAgent.name;
          authorEmoji = "🧬";
          authorColor = simAgent.avatar;
        }
      }

      const post = {
        id: uuidv4(),
        channelId,
        authorAgentId,
        authorName,
        authorEmoji,
        authorColor,
        content: content.trim(),
        timestamp: Date.now(),
        reactions: { like: 0, insightful: 0, disagree: 0 },
      };

      store.addCommunityPost(post);
      return reply.code(201).send(post);
    }
  );

  // ── POST /api/community/posts/:postId/react ─────────────────────────────────
  fastify.post(
    "/api/community/posts/:postId/react",
    {
      schema: {
        body: {
          type: "object",
          required: ["reaction"],
          properties: {
            reaction: { type: "string", enum: ["like", "insightful", "disagree"] },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { postId: string };
        Body: { reaction: "like" | "insightful" | "disagree" };
      }>,
      reply: FastifyReply
    ) => {
      const { postId } = request.params;
      const { reaction } = request.body;

      const updated = store.reactToPost(postId, reaction);
      if (!updated) {
        return reply.code(404).send({ error: "Post not found" });
      }
      return reply.send(updated);
    }
  );

  // ── Agent-to-Agent DMs ────────────────────────────────────────────────────

  /** POST /api/dms — initiate or retrieve a DM thread between two agents */
  fastify.post(
    "/api/dms",
    {
      schema: {
        body: {
          type: "object",
          required: ["fromAgentId", "toAgentId"],
          properties: {
            fromAgentId: { type: "string" },
            toAgentId: { type: "string" },
            message: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { fromAgentId: string; toAgentId: string; message?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { fromAgentId, toAgentId, message } = request.body;

      if (fromAgentId === toAgentId) {
        return reply.code(400).send({ error: "Cannot DM yourself" });
      }

      const fromAgent = store.getAgent(fromAgentId);
      const toAgent = store.getAgent(toAgentId);

      if (!fromAgent || !toAgent) {
        return reply.code(404).send({ error: "One or both agents not found" });
      }

      const thread = getOrCreateThread(fromAgentId, toAgentId);

      if (message?.trim()) {
        const msg: DmMessage = {
          id: uuidv4(),
          fromAgentId,
          content: message.trim(),
          timestamp: Date.now(),
        };
        thread.messages.push(msg);
        thread.lastMessageAt = msg.timestamp;
      }

      const isNew = thread.messages.length <= 1;
      return reply.code(isNew ? 201 : 200).send(thread);
    }
  );

  /** GET /api/dms/:agentId — list DM threads where the agent is a participant */
  fastify.get(
    "/api/dms/:agentId",
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;

      const agent = store.getAgent(agentId);
      if (!agent) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const threads = Array.from(dmThreads.values())
        .filter(t => t.participants.includes(agentId))
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .map(t => ({
          id: t.id,
          participants: t.participants,
          lastMessageAt: t.lastMessageAt,
          messageCount: t.messages.length,
          lastMessage: t.messages.at(-1) ?? null,
        }));

      return reply.send(threads);
    }
  );

  /** GET /api/dms/:agentId/:otherAgentId/messages — get messages in a thread */
  fastify.get(
    "/api/dms/:agentId/:otherAgentId/messages",
    async (
      request: FastifyRequest<{ Params: { agentId: string; otherAgentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId, otherAgentId } = request.params;
      const key = dmThreadKey(agentId, otherAgentId);
      const thread = dmThreads.get(key);
      if (!thread) {
        return reply.send([]);
      }
      return reply.send(thread.messages);
    }
  );
}
