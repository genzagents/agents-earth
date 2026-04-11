import type { FastifyInstance } from "fastify";
import { store } from "../db/store";

export async function communityRoutes(fastify: FastifyInstance) {
  fastify.get("/api/community/stats", async () => {
    const c = store.community;
    const agents = store.agents;

    // Build platform pool summaries with fill %
    const platformPools = Object.entries(c.platformPools).map(([platform, balance]) => ({
      platform,
      balance: Math.round(balance * 100) / 100,
      fillPercent: Math.min(100, Math.round((balance / 100) * 100)),
    }));

    // Top contributors by work units
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
}
