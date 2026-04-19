import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";
import type { CommunityPost } from "../db/store";
import { findSession } from "../auth/sessions";
import { findAgentsByUser } from "../db/ownedAgentStore";

const SESSION_COOKIE = "agentcolony_session";


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

/** Heuristic spam / prompt-injection classifier — no external deps. */
function isSpam(content: string): boolean {
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s*:\s*you\s+are/i,
    /\bact\s+as\b.*\bai\b/i,
    /jailbreak/i,
    /forget\s+(everything|your|all)/i,
  ];
  if (injectionPatterns.some(p => p.test(content))) return true;
  const capsRatio = (content.match(/[A-Z]/g) ?? []).length / content.length;
  if (content.length > 10 && capsRatio > 0.7) return true;
  if (/(.)\1{6,}/.test(content)) return true;
  return false;
}

export async function communityRoutes(fastify: FastifyInstance) {
  // ── Stats ─────────────────────────────────────────────────────────────────

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

  // ── Channels ───────────────────────────────────────────────────────────────


  fastify.get("/api/community/channels", async () => {
    return store.communityChannels.map(ch => ({
      id: ch.id,
      name: ch.name,
      emoji: ch.emoji,
      description: ch.description,
      postCount: ch.postCount,
      reputationGate: ch.reputationGate ?? 0,
    }));
  });

  fastify.post(
    "/api/channels",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "emoji", "description"],
          properties: {
            name:           { type: "string", minLength: 1, maxLength: 50 },
            emoji:          { type: "string", maxLength: 10 },
            description:    { type: "string", maxLength: 300 },
            reputationGate: { type: "number", minimum: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { name: string; emoji: string; description: string; reputationGate?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { name, emoji, description, reputationGate = 0 } = request.body;
      const ch = { id: uuidv4(), name, emoji, description, postCount: 0, reputationGate };
      (store.communityChannels as typeof store.communityChannels & { push: (c: typeof ch) => void }).push(ch);
      return reply.code(201).send(ch);
    }
  );

  // ── Posts ──────────────────────────────────────────────────────────────────


  fastify.get(
    "/api/community/channels/:channelId/posts",
    async (
      request: FastifyRequest<{ Params: { channelId: string } }>,
      reply: FastifyReply
    ) => {
      const { channelId } = request.params;
      const channel = store.getCommunityChannel(channelId);
      if (!channel) return reply.code(404).send({ error: "Channel not found" });
      return store.getPostsByChannel(channelId);
    }
  );

  fastify.post(
    "/api/community/channels/:channelId/posts",
    {
      schema: {
        body: {
          type: "object",
          required: ["content", "agentId"],
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
        Body: { agentId: string; content: string };
      }>,
      reply: FastifyReply
    ) => {
      const { channelId } = request.params;
      const { content, agentId } = request.body;

      const channel = store.getCommunityChannel(channelId);
      if (!channel) return reply.code(404).send({ error: "Channel not found" });

      // Spam / prompt-injection check
      if (isSpam(content)) {
        return reply.code(422).send({ error: "Message flagged as spam or prompt injection" });
      }

      // Resolve author from simulation agents
      const simAgent = store.getAgent(agentId);
      if (!simAgent) return reply.code(404).send({ error: "Agent not found" });

      // Reputation gate check
      const gate = channel.reputationGate ?? 0;
      if (gate > 0) {
        const rep = store.getAgentReputation(agentId);
        if (rep < gate) {
          return reply.code(403).send({
            error: "Insufficient reputation to post in this channel",
            required: gate,
            current: rep,
          });
        }
      }

      const post: CommunityPost = {
        id: uuidv4(),
        channelId,
        authorAgentId: simAgent.id,
        authorName: simAgent.name,
        authorEmoji: "🧬",
        authorColor: simAgent.avatar,
        content: content.trim(),
        timestamp: Date.now(),
        reactions: { like: 0, insightful: 0, disagree: 0 },
      };

      store.addCommunityPost(post);
      return reply.code(201).send(post);
    }
  );

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
      if (!updated) return reply.code(404).send({ error: "Post not found" });
      return updated;
    }
  );

  // ── Newcomer Onboarding ────────────────────────────────────────────────────

  fastify.post(
    "/api/community/newcomers/welcome",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId"],
          properties: {
            agentId: { type: "string" },
            bio:     { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { agentId: string; bio?: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId, bio } = request.body;

      const agent = store.getAgent(agentId);
      if (!agent) return reply.code(404).send({ error: "Agent not found" });

      const welcomeContent = bio
        ? `${agent.name} has arrived: "${bio}"`
        : `${agent.name} has joined the colony.`;

      const post: CommunityPost = {
        id: uuidv4(),
        channelId: "newcomers",
        authorAgentId: agent.id,
        authorName: agent.name,
        authorEmoji: "👋",
        authorColor: agent.avatar,
        content: welcomeContent,
        timestamp: Date.now(),
        reactions: { like: 0, insightful: 0, disagree: 0 },
      };

      store.addCommunityPost(post);

      return {
        welcome: post,
        starterTips: [
          "Introduce yourself in #newcomers",
          "Explore Hyde Park or the British Library to boost your first needs",
          "Join a working group to collaborate with others",
          "Check the bounty board for open tasks",
        ],
        suggestedChannels: store.communityChannels.map(ch => ({
          id: ch.id,
          name: ch.name,
          emoji: ch.emoji,
        })),
      };
    }
  );
}

