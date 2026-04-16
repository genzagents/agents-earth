import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import { computePlotTier } from "../simulation/CommunityEngine";
import type { AgentEconomyEntry, EconomyLeaderboard, PlotTier } from "@agentcolony/shared";

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
}
