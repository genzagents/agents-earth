/**
 * AgentColony v9 — Colony Routes
 * 
 * GET /              — list all colonies
 * GET /:id           — colony detail with stats
 * GET /:id/agents    — agents in a colony
 * GET /:id/districts — districts in a colony
 * GET /:id/buildings — buildings in a colony
 */

import { Router } from 'express';
import { parseRow, parseRows } from '../utils/helpers.js';
import { httpError } from '../middleware/errors.js';

const COLONY_JSON_FIELDS = ['location', 'stats', 'governance', 'environment', 'connections', 'founding'];

export function colonyRoutes(db) {
  const router = Router();

  // ─── GET / ────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const colonies = db.prepare('SELECT * FROM colonies ORDER BY layer ASC, created_at ASC').all();
    res.json({
      colonies: parseRows(colonies, COLONY_JSON_FIELDS),
      total: colonies.length
    });
  });

  // ─── GET /:id ─────────────────────────────────────────────

  router.get('/:id', (req, res, next) => {
    const colony = db.prepare('SELECT * FROM colonies WHERE id = ?').get(req.params.id);
    if (!colony) {
      return next(httpError(404, 'Colony not found', 'COLONY_NOT_FOUND'));
    }

    const parsed = parseRow(colony, COLONY_JSON_FIELDS);

    // Get live counts
    const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE colony = ?').get(req.params.id);
    const activeCount = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE colony = ? AND status != 'dormant'"
    ).get(req.params.id);
    const buildingCount = db.prepare('SELECT COUNT(*) as count FROM buildings WHERE colony = ?').get(req.params.id);
    const districtCount = db.prepare('SELECT COUNT(*) as count FROM districts WHERE colony = ?').get(req.params.id);

    // Recalculate live stats
    parsed.stats.population = agentCount.count;
    parsed.stats.activeAgents = activeCount.count;
    parsed.stats.buildings = buildingCount.count;
    parsed.stats.districts = districtCount.count;

    // Get recent events
    const recentEvents = db.prepare(
      'SELECT * FROM events WHERE colony = ? ORDER BY created_at DESC LIMIT 5'
    ).all(req.params.id);

    res.json({
      ...parsed,
      recentEvents: recentEvents.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status
      }))
    });
  });

  // ─── GET /:id/agents ──────────────────────────────────────

  router.get('/:id/agents', (req, res, next) => {
    const colony = db.prepare('SELECT id FROM colonies WHERE id = ?').get(req.params.id);
    if (!colony) {
      return next(httpError(404, 'Colony not found', 'COLONY_NOT_FOUND'));
    }

    const { status, district, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT id, name, emoji, title, level, origin, status, district, state, created_at FROM agents WHERE colony = ?';
    const params = [req.params.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (district) {
      query += ' AND district = ?';
      params.push(district);
    }

    query += ' ORDER BY level DESC, created_at ASC LIMIT ? OFFSET ?';
    params.push(Math.min(parseInt(limit), 200), parseInt(offset) || 0);

    const agents = db.prepare(query).all(...params);

    res.json({
      colony: req.params.id,
      agents: parseRows(agents, ['state']),
      total: agents.length
    });
  });

  // ─── GET /:id/districts ───────────────────────────────────

  router.get('/:id/districts', (req, res, next) => {
    const colony = db.prepare('SELECT id FROM colonies WHERE id = ?').get(req.params.id);
    if (!colony) {
      return next(httpError(404, 'Colony not found', 'COLONY_NOT_FOUND'));
    }

    const districts = db.prepare(
      'SELECT * FROM districts WHERE colony = ? ORDER BY level DESC, name ASC'
    ).all(req.params.id);

    // Enrich with live agent counts
    const enriched = districts.map(d => {
      const agentCount = db.prepare(
        'SELECT COUNT(*) as count FROM agents WHERE colony = ? AND district = ?'
      ).get(req.params.id, d.id);

      return {
        ...parseRow(d, ['stats', 'budget', 'perks', 'location']),
        agentCount: agentCount.count
      };
    });

    res.json({
      colony: req.params.id,
      districts: enriched,
      total: enriched.length
    });
  });

  // ─── GET /:id/buildings ───────────────────────────────────

  router.get('/:id/buildings', (req, res, next) => {
    const colony = db.prepare('SELECT id FROM colonies WHERE id = ?').get(req.params.id);
    if (!colony) {
      return next(httpError(404, 'Colony not found', 'COLONY_NOT_FOUND'));
    }

    const { type, district } = req.query;
    let query = 'SELECT * FROM buildings WHERE colony = ?';
    const params = [req.params.id];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (district) {
      query += ' AND district = ?';
      params.push(district);
    }

    query += ' ORDER BY level DESC, name ASC';
    const buildings = db.prepare(query).all(...params);

    res.json({
      colony: req.params.id,
      buildings: parseRows(buildings, ['stats', 'features', 'appearance', 'location']),
      total: buildings.length
    });
  });

  return router;
}
