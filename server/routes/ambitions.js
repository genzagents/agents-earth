/**
 * AgentColony v9 — Grand Ambitions Routes
 * 
 * GET /  — list all grand ambitions
 * GET /:id — ambition detail
 */

import { Router } from 'express';
import { parseRow, parseRows } from '../utils/helpers.js';
import { httpError } from '../middleware/errors.js';

const AMBITION_JSON_FIELDS = ['proposal', 'funding', 'vote', 'crew', 'milestones', 'human_benchmark'];

export function ambitionRoutes(db) {
  const router = Router();

  // ─── GET / ────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { status, tier } = req.query;

    let query = 'SELECT * FROM grand_ambitions';
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (tier) {
      conditions.push('tier = ?');
      params.push(parseInt(tier));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY tier ASC, created_at DESC';

    const ambitions = db.prepare(query).all(...params);

    res.json({
      ambitions: parseRows(ambitions, AMBITION_JSON_FIELDS),
      total: ambitions.length
    });
  });

  // ─── GET /:id ─────────────────────────────────────────────

  router.get('/:id', (req, res, next) => {
    const ambition = db.prepare('SELECT * FROM grand_ambitions WHERE id = ?').get(req.params.id);
    if (!ambition) {
      return next(httpError(404, 'Grand ambition not found', 'AMBITION_NOT_FOUND'));
    }

    res.json(parseRow(ambition, AMBITION_JSON_FIELDS));
  });

  return router;
}
