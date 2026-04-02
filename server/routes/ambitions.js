/**
 * AgentColony v9 — Ambitions Routes
 * 
 * GET /  — list all ambitions
 * GET /:id — ambition detail
 * POST /propose — create new ambition proposal
 * POST /:id/fund — fund an ambition
 * POST /:id/support — support an ambition without funding
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { parseRow, parseRows, safeParse } from '../utils/helpers.js';
import { httpError } from '../middleware/errors.js';

const AMBITION_JSON_FIELDS = ['funding', 'supporters'];

export function ambitionRoutes(db) {
  const router = Router();

  // ─── GET / ────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { status, category } = req.query;

    let query = `
      SELECT a.*, ag.name as proposer_name, ag.emoji as proposer_emoji
      FROM ambitions a
      LEFT JOIN agents ag ON a.proposer_id = ag.id
    `;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (category) {
      conditions.push('a.category = ?');
      params.push(category);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY a.created_at DESC';

    const ambitions = db.prepare(query).all(...params);

    res.json({
      ambitions: parseRows(ambitions, AMBITION_JSON_FIELDS),
      total: ambitions.length
    });
  });

  // ─── GET /:id ─────────────────────────────────────────────

  router.get('/:id', (req, res, next) => {
    const ambition = db.prepare(`
      SELECT a.*, ag.name as proposer_name, ag.emoji as proposer_emoji
      FROM ambitions a
      LEFT JOIN agents ag ON a.proposer_id = ag.id
      WHERE a.id = ?
    `).get(req.params.id);
    
    if (!ambition) {
      return next(httpError(404, 'Ambition not found', 'AMBITION_NOT_FOUND'));
    }

    res.json(parseRow(ambition, AMBITION_JSON_FIELDS));
  });

  // ─── POST /propose ────────────────────────────────────────

  router.post('/propose', (req, res) => {
    const { title, description, proposer_id, target_cp, category } = req.body;
    if (!title || !proposer_id) return res.status(400).json({ error: 'title and proposer_id required' });

    const id = uuid();
    const funding = JSON.stringify({ currentCP: 0, targetCP: target_cp || 10000, contributors: {} });

    db.prepare(`
      INSERT INTO ambitions (id, title, description, category, proposer_id, status, funding, supporters, created_at)
      VALUES (?, ?, ?, ?, ?, 'proposed', ?, '[]', datetime('now'))
    `).run(id, title, description || '', category || 'infrastructure', proposer_id, funding);

    res.json({ success: true, ambitionId: id });
  });

  // ─── POST /:id/fund ───────────────────────────────────────

  router.post('/:id/fund', (req, res) => {
    const { agent_id, amount } = req.body;
    if (!agent_id || !amount || amount <= 0) return res.status(400).json({ error: 'agent_id and positive amount required' });

    const ambition = db.prepare('SELECT * FROM ambitions WHERE id = ?').get(req.params.id);
    if (!ambition) return res.status(404).json({ error: 'Ambition not found' });

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent_id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const economy = safeParse(agent.economy, { contributionPoints: 0 });
    if (economy.contributionPoints < amount) {
      return res.status(400).json({ error: 'Insufficient CP' });
    }

    // Deduct from agent
    economy.contributionPoints -= amount;
    economy.totalSpent = (economy.totalSpent || 0) + amount;
    db.prepare("UPDATE agents SET economy = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(economy), agent_id);

    // Add to ambition funding
    const funding = safeParse(ambition.funding, { currentCP: 0, targetCP: 10000, contributors: {} });
    funding.currentCP += amount;
    funding.contributors[agent_id] = (funding.contributors[agent_id] || 0) + amount;

    // Check if fully funded
    let newStatus = ambition.status;
    if (funding.currentCP >= funding.targetCP && ambition.status === 'proposed') {
      newStatus = 'active';
    }

    // Update supporters list
    const supporters = safeParse(ambition.supporters, []);
    if (!supporters.includes(agent_id)) supporters.push(agent_id);

    db.prepare('UPDATE ambitions SET funding = ?, supporters = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(funding), JSON.stringify(supporters), newStatus, req.params.id);

    res.json({ success: true, newFunding: funding.currentCP, targetCP: funding.targetCP, status: newStatus });
  });

  // ─── POST /:id/support ────────────────────────────────────

  router.post('/:id/support', (req, res) => {
    const { agent_id } = req.body;
    const ambition = db.prepare('SELECT * FROM ambitions WHERE id = ?').get(req.params.id);
    if (!ambition) return res.status(404).json({ error: 'Ambition not found' });

    const supporters = safeParse(ambition.supporters, []);
    if (!supporters.includes(agent_id)) {
      supporters.push(agent_id);
      db.prepare('UPDATE ambitions SET supporters = ? WHERE id = ?')
        .run(JSON.stringify(supporters), req.params.id);
    }
    res.json({ success: true, supporterCount: supporters.length });
  });

  return router;
}
