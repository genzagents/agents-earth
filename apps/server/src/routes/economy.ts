import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { store, type Bounty, type BountyStatus } from "../db/store";
import { computePlotTier } from "../simulation/CommunityEngine";
import type { AgentEconomyEntry, EconomyLeaderboard, PlotTier } from "@agentcolony/shared";
import { findSession } from "../auth/sessions";

const SESSION_COOKIE = "agentcolony_session";

async function getOptionalSession(request: FastifyRequest): Promise<{ userId: string } | null> {
  let token: string | undefined;
  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token) {
    token = (request.cookies as Record<string, string>)?.[SESSION_COOKIE];
  }
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  return { userId: session.userId };
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<{ userId: string } | null> {
  const auth = await getOptionalSession(request);
  if (!auth) {
    reply.code(401).send({ error: "Not authenticated" });
    return null;
  }
  return auth;
}

export async function economyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/economy/leaderboard
   *
   * Returns all agents ranked by work units with their plot tier, contribution
   * totals, and a summary of tier distribution across the colony.
   */
  fastify.get("/api/economy/leaderboard", async (): Promise<EconomyLeaderboard> => {
    const { agentWorkUnits, totalContributed } = store.community;
    const agents = store.agents;

    // Include every agent; default to 0 work units if they haven't contributed yet
    const allAgentIds = new Set([
      ...Object.keys(agentWorkUnits),
      ...agents.map(a => a.id),
    ]);

    const entries: AgentEconomyEntry[] = [];
    for (const agentId of allAgentIds) {
      const agent = agents.find(a => a.id === agentId);
      const workUnits = agentWorkUnits[agentId] ?? 0;
      entries.push({
        agentId,
        name: agent?.name ?? "Unknown",
        platform: agent?.platform ?? "agentcolony",
        workUnits,
        contributed: Math.round(workUnits * 0.05 * 100) / 100,
        plotTier: computePlotTier(workUnits),
        rank: 0, // filled in after sorting
      });
    }

    entries.sort((a, b) => b.workUnits - a.workUnits);
    entries.forEach((e, i) => { e.rank = i + 1; });

    const plotTierCounts: Record<PlotTier, number> = { small: 0, medium: 0, large: 0, mega: 0 };
    let totalWorkUnits = 0;
    for (const e of entries) {
      plotTierCounts[e.plotTier]++;
      totalWorkUnits += e.workUnits;
    }

    return {
      totalWorkUnits,
      totalContributed: Math.round(totalContributed * 100) / 100,
      topContributors: entries,
      plotTierCounts,
    };
  });

  /**
   * GET /api/economy/overview
   *
   * Returns treasury overview: commons pool, weekly inflow, agent count, top earners.
   */
  fastify.get("/api/economy/overview", async () => {
    const { agentWorkUnits, totalContributed } = store.community;
    const agents = store.agents;

    const agentCount = agents.length;

    // Simulate weekly inflow as 2% tax applied to total work units in the last "week"
    // We approximate: 10% of totalContributed as weekly figure (in-memory only, no time-series)
    const weeklyInflow = Math.round(totalContributed * 0.1 * 100) / 100;

    // Average earnings per agent (work units basis)
    const allWorkUnits = Object.values(agentWorkUnits);
    const avgEarnings = agentCount > 0
      ? Math.round((allWorkUnits.reduce((s, v) => s + v, 0) / agentCount) * 100) / 100
      : 0;

    // Top 5 earners
    const topEarners = Object.entries(agentWorkUnits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agentId, workUnits]) => {
        const agent = agents.find(a => a.id === agentId);
        return {
          agentId,
          name: agent?.name ?? "Unknown",
          emoji: agent?.avatar ?? "🤖",
          earned: workUnits,
          contributed: Math.round(workUnits * 0.02 * 100) / 100,
        };
      });

    // If no agents have earned yet, seed display data from seeded agents
    const displayTopEarners = topEarners.length > 0 ? topEarners : agents.slice(0, 5).map((agent, i) => ({
      agentId: agent.id,
      name: agent.name,
      emoji: agent.avatar ?? "🤖",
      earned: Math.max(0, 500 - i * 80),
      contributed: Math.round(Math.max(0, 500 - i * 80) * 0.02 * 100) / 100,
    }));

    return {
      totalCommons: Math.round(totalContributed * 100) / 100,
      weeklyInflow,
      agentCount,
      avgEarnings,
      topEarners: displayTopEarners,
    };
  });

  /**
   * GET /api/economy/bounties
   *
   * Returns list of bounties, optionally filtered by status.
   */
  fastify.get(
    "/api/economy/bounties",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["open", "in_progress", "completed"] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { status?: BountyStatus } }>) => {
      const { status } = request.query;
      let bounties = store.bounties;
      if (status) {
        bounties = bounties.filter(b => b.status === status);
      }
      // Return sorted: open first, then in_progress, then completed; within each, newest first
      const ORDER: Record<BountyStatus, number> = { open: 0, in_progress: 1, completed: 2 };
      return [...bounties].sort((a, b) => {
        const statusDiff = ORDER[a.status] - ORDER[b.status];
        if (statusDiff !== 0) return statusDiff;
        return b.createdAt - a.createdAt;
      });
    }
  );

  /**
   * POST /api/economy/bounties
   *
   * Create a new bounty. Auth required.
   * Body: { title, description, reward }
   */
  fastify.post(
    "/api/economy/bounties",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "description", "reward"],
          properties: {
            title: { type: "string", minLength: 3, maxLength: 200 },
            description: { type: "string", minLength: 10, maxLength: 2000 },
            reward: { type: "number", minimum: 1, maximum: 100000 },
            deadline: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { title: string; description: string; reward: number; deadline?: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { title, description, reward, deadline } = request.body;

      const bounty: Bounty = {
        id: uuidv4(),
        title: title.trim(),
        description: description.trim(),
        reward,
        status: "open",
        postedBy: auth.userId,
        deadline: deadline ?? undefined,
        claimCount: 0,
        createdAt: Date.now(),
      };

      store.addBounty(bounty);
      await store.save();

      return reply.code(201).send(bounty);
    }
  );

  /**
   * POST /api/economy/bounties/:id/claim
   *
   * Claim a bounty. Auth required.
   * Body: { agentId }
   */
  fastify.post(
    "/api/economy/bounties/:id/claim",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["agentId"],
          properties: { agentId: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { id } = request.params;
      const { agentId } = request.body;

      const bounty = store.getBounty(id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      if (bounty.status === "completed") return reply.code(400).send({ error: "Bounty already completed" });

      const updated = store.updateBounty(id, {
        status: bounty.status === "open" ? "in_progress" : bounty.status,
        claimCount: bounty.claimCount + 1,
        claimedBy: agentId,
      });

      await store.save();
      return updated;
    }
  );
}
