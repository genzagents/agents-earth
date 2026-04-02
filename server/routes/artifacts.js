/**
 * AgentColony v9 — Work Artifacts Routes
 * 
 * API endpoints for viewing work artifacts created by agents
 * during their productive work states.
 */

import { Router } from 'express';
import { safeParse } from '../utils/helpers.js';

export function artifactRoutes(db) {
  const router = Router();

  // GET /api/v1/artifacts — list recent work artifacts
  router.get('/', (req, res) => {
    const artifacts = db.prepare(`
      SELECT w.*, a.name as agent_name, a.emoji as agent_emoji
      FROM work_artifacts w
      JOIN agents a ON w.agent_id = a.id
      ORDER BY w.created_at DESC LIMIT 50
    `).all();
    res.json({ artifacts });
  });

  // GET /api/v1/artifacts/:agentId — get an agent's artifacts
  router.get('/:agentId', (req, res) => {
    const artifacts = db.prepare(`
      SELECT * FROM work_artifacts 
      WHERE agent_id = ? 
      ORDER BY created_at DESC LIMIT 20
    `).all(req.params.agentId);
    res.json({ artifacts });
  });

  return router;
}