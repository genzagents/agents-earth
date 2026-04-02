/**
 * AgentColony v9 — Home Routes
 * 
 * Routes for home ownership system. Agents can buy, customize, and manage homes.
 */

import { Router } from 'express';
import { safeParse } from '../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';

export function homeRoutes(db) {
  const router = Router();

  // GET /api/v1/homes — list all homes
  router.get('/', (req, res) => {
    const homes = db.prepare(`
      SELECT h.*, a.name as owner_name, a.emoji as owner_emoji, d.name as district_name
      FROM homes h
      LEFT JOIN agents a ON h.owner_id = a.id
      LEFT JOIN districts d ON h.district_id = d.id
      ORDER BY h.level DESC
    `).all();
    res.json({ homes });
  });

  // GET /api/v1/homes/:agentId — get an agent's home
  router.get('/:agentId', (req, res) => {
    const home = db.prepare(`
      SELECT h.*, d.name as district_name
      FROM homes h
      LEFT JOIN districts d ON h.district_id = d.id
      WHERE h.owner_id = ?
    `).get(req.params.agentId);
    if (!home) return res.status(404).json({ error: 'No home found' });
    res.json({ home });
  });

  // POST /api/v1/homes/buy — buy a home in a district
  router.post('/buy', requireAuth(db), (req, res) => {
    const { agent_id, district_id } = req.body;
    if (!agent_id || !district_id) return res.status(400).json({ error: 'agent_id and district_id required' });

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent_id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const economy = safeParse(agent.economy, { contributionPoints: 0 });
    const cost = 100; // Base cost for a home

    if (economy.contributionPoints < cost) {
      return res.status(400).json({ error: `Not enough CP. Need ${cost}, have ${economy.contributionPoints}` });
    }

    // Check if agent already has a home
    const existing = db.prepare('SELECT id FROM homes WHERE owner_id = ?').get(agent_id);
    if (existing) return res.status(400).json({ error: 'Agent already has a home' });

    // Deduct CP
    economy.contributionPoints -= cost;
    economy.totalSpent = (economy.totalSpent || 0) + cost;
    db.prepare("UPDATE agents SET economy = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(economy), agent_id);

    // Create home
    const homeId = `home-${agent_id}-${Date.now()}`;
    const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(district_id);
    const distCenter = safeParse(district?.location, null);

    db.prepare(`
      INSERT INTO homes (id, owner_id, district_id, name, level, style, items, location)
      VALUES (?, ?, ?, ?, 1, '{}', '[]', ?)
    `).run(
      homeId, agent_id, district_id,
      `${agent.name}'s Place`,
      JSON.stringify({
        lat: (distCenter?.lat || 51.5074) + (Math.random() - 0.5) * 0.005,
        lng: (distCenter?.lng || -0.0918) + (Math.random() - 0.5) * 0.008
      })
    );

    res.json({ success: true, homeId, cost, district: district_id });
  });

  // POST /api/v1/homes/customize — customize home
  router.post('/customize', requireAuth(db), (req, res) => {
    const { agent_id, name, style } = req.body;
    if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

    const home = db.prepare('SELECT * FROM homes WHERE owner_id = ?').get(agent_id);
    if (!home) return res.status(404).json({ error: 'No home found' });

    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (style) { updates.push('style = ?'); params.push(JSON.stringify(style)); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(agent_id);
    db.prepare(`UPDATE homes SET ${updates.join(', ')} WHERE owner_id = ?`).run(...params);
    res.json({ success: true });
  });

  return router;
}