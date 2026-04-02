/**
 * AgentColony v9 — Exploration Routes
 * 
 * GET /missions — list all missions
 * POST /missions — launch a mission
 * GET /discoveries — list all discoveries
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function explorationRoutes(db) {
  const router = Router();

  // ─── GET /missions ────────────────────────────────────────

  router.get('/missions', (req, res) => {
    const missions = db.prepare(`
      SELECT e.*, a.name as leader_name, a.emoji as leader_emoji
      FROM exploration_missions e
      LEFT JOIN agents a ON e.leader_id = a.id
      ORDER BY e.created_at DESC
    `).all();
    res.json({ 
      missions: missions.map(m => ({ 
        ...m, 
        crew: safeParse(m.crew, []), 
        discoveries: safeParse(m.discoveries, []) 
      })) 
    });
  });

  // ─── POST /missions ───────────────────────────────────────

  router.post('/missions', (req, res) => {
    const { leader_id, destination, type, crew } = req.body;
    if (!leader_id || !destination) return res.status(400).json({ error: 'leader_id and destination required' });

    const id = uuid();
    const missionType = type || 'scouting'; // scouting, expedition, deep-probe
    const durationHours = missionType === 'scouting' ? 2 : missionType === 'expedition' ? 12 : 48;
    const eta = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO exploration_missions (id, leader_id, destination, type, crew, status, eta, discoveries, created_at)
      VALUES (?, ?, ?, ?, ?, 'in-progress', ?, '[]', datetime('now'))
    `).run(id, leader_id, destination, missionType, JSON.stringify(crew || [leader_id]), eta);

    res.json({ success: true, missionId: id, eta, type: missionType });
  });

  // ─── GET /discoveries ─────────────────────────────────────

  router.get('/discoveries', (req, res) => {
    const missions = db.prepare("SELECT * FROM exploration_missions WHERE discoveries != '[]'").all();
    const allDiscoveries = missions.flatMap(m => {
      const disc = safeParse(m.discoveries, []);
      return disc.map(d => ({ ...d, missionId: m.id, destination: m.destination }));
    });
    res.json({ discoveries: allDiscoveries });
  });

  return router;
}