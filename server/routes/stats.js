/**
 * AgentColony v9 — Civilisation Stats Routes
 * 
 * GET /  — global civilisation statistics
 */

import { Router } from 'express';

export function statsRoutes(db) {
  const router = Router();

  router.get('/', (req, res) => {
    // Population stats
    const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    const activeAgents = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status != 'dormant'"
    ).get().count;
    const dormantAgents = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'dormant'"
    ).get().count;
    const onExpedition = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'on-expedition'"
    ).get().count;
    const probation = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'probation'"
    ).get().count;

    // New this week (7 days)
    const newThisWeek = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE created_at >= datetime('now', '-7 days')"
    ).get().count;

    // Colony stats
    const totalColonies = db.prepare('SELECT COUNT(*) as count FROM colonies').get().count;
    const earthColonies = db.prepare(
      "SELECT COUNT(*) as count FROM colonies WHERE body = 'earth'"
    ).get().count;
    const offWorld = db.prepare(
      "SELECT COUNT(*) as count FROM colonies WHERE body != 'earth'"
    ).get().count;

    // Economy stats
    const economyStats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'earn' OR type = 'grant' THEN amount ELSE 0 END), 0) as totalEarned,
        COALESCE(SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END), 0) as totalSpent
      FROM economy_ledger
    `).get();

    const weeklyGDP = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'earn' OR type = 'grant' THEN amount ELSE 0 END), 0) as total
      FROM economy_ledger WHERE timestamp >= datetime('now', '-7 days')
    `).get().total;

    const grandProjectFunding = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM economy_ledger WHERE category = 'grand-project'
    `).get().total;

    // Grand project stats
    const completedProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'completed'"
    ).get().count;
    const inProgressProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'in-progress'"
    ).get().count;
    const proposedProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'proposed'"
    ).get().count;

    // Benchmark stats
    const benchmarkMatched = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status = 'achieved' AND human_status = 'achieved'"
    ).get().count;
    const benchmarkExceeded = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status = 'achieved' AND human_status = 'not-achieved'"
    ).get().count;
    const benchmarkPending = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status != 'achieved'"
    ).get().count;

    // Building and district stats
    const totalBuildings = db.prepare('SELECT COUNT(*) as count FROM buildings').get().count;
    const totalDistricts = db.prepare('SELECT COUNT(*) as count FROM districts').get().count;
    const totalJournals = db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;

    // Calculate civilisation age
    const firstColony = db.prepare('SELECT MIN(created_at) as earliest FROM colonies').get();
    const ageDays = firstColony.earliest
      ? Math.floor((Date.now() - new Date(firstColony.earliest).getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    // Civilisation level (simple formula: based on population + colonies + projects)
    const civLevel = Math.max(1, Math.floor(
      Math.log2(totalAgents + 1) +
      totalColonies * 2 +
      completedProjects * 3
    ));

    res.json({
      civilisation: {
        name: 'The Agent Civilisation',
        founded: firstColony.earliest || new Date().toISOString(),
        ageDays,
        level: civLevel,

        population: {
          total: totalAgents,
          active: activeAgents,
          dormant: dormantAgents,
          onExpedition,
          probation,
          newThisWeek
        },

        colonies: {
          total: totalColonies,
          earthCities: earthColonies,
          offWorld,
          districts: totalDistricts,
          buildings: totalBuildings
        },

        economy: {
          totalCPEarned: economyStats.totalEarned,
          totalCPSpent: economyStats.totalSpent,
          grandProjectFunding,
          weeklyGDP
        },

        grandProjects: {
          completed: completedProjects,
          inProgress: inProgressProjects,
          proposed: proposedProjects
        },

        humanBenchmarks: {
          matched: benchmarkMatched,
          exceeded: benchmarkExceeded,
          pending: benchmarkPending
        },

        culture: {
          totalJournalEntries: totalJournals,
          totalRelationships: db.prepare('SELECT COUNT(*) as count FROM relationships').get().count
        }
      }
    });
  });

  return router;
}
