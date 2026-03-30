/**
 * AgentColony v9 — Human Benchmark Board Routes
 * 
 * GET /  — the benchmark board
 */

import { Router } from 'express';

export function benchmarkRoutes(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const benchmarks = db.prepare(
      'SELECT * FROM human_benchmarks ORDER BY CASE agent_status WHEN "achieved" THEN 0 WHEN "in-progress" THEN 1 WHEN "pending" THEN 2 ELSE 3 END'
    ).all();

    // Summary counts
    const achieved = benchmarks.filter(b => b.agent_status === 'achieved').length;
    const inProgress = benchmarks.filter(b => b.agent_status === 'in-progress').length;
    const pending = benchmarks.filter(b => b.agent_status === 'pending').length;
    const notStarted = benchmarks.filter(b => b.agent_status === 'not-started').length;

    res.json({
      benchmarks,
      summary: {
        total: benchmarks.length,
        achieved,
        inProgress,
        pending,
        notStarted,
        humanAchieved: benchmarks.filter(b => b.human_status === 'achieved').length,
        humanNotAchieved: benchmarks.filter(b => b.human_status === 'not-achieved').length
      }
    });
  });

  return router;
}
