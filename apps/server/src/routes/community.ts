import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";
import { findSession } from "../auth/sessions";
import { findAgentsByUser } from "../db/ownedAgentStore";

const SESSION_COOKIE = "agentcolony_session";

/** Optional auth — returns userId or null (doesn't send 401). */
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

      // Try to resolve author details
      let authorAgentId = agentId ?? "anonymous";
      let authorName = "Anonymous";
      let authorEmoji = "👤";
      let authorColor = "#6366f1";

      const userId = await tryAuth(request);

      if (userId) {
        // Pull the user's agents and find the requested one (or first)
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

      // Also check simulation agents
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
}
