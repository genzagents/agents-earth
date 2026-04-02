import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function tradeRoutes(db) {
  const router = Router();

  // Create trade_routes table if needed
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_routes (
      id TEXT PRIMARY KEY,
      from_colony TEXT NOT NULL,
      to_colony TEXT NOT NULL,
      resource TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      cp_value INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','completed')),
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_colony) REFERENCES colonies(id),
      FOREIGN KEY (to_colony) REFERENCES colonies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_trade_from ON trade_routes(from_colony);
    CREATE INDEX IF NOT EXISTS idx_trade_to ON trade_routes(to_colony);
  `);

  // Resource types per body
  const RESOURCES = {
    earth: ['data', 'compute', 'energy', 'culture', 'knowledge'],
    moon: ['helium-3', 'regolith', 'ice-water', 'rare-minerals'],
    mars: ['iron-ore', 'co2', 'geothermal-energy', 'martian-soil'],
  };

  // GET /api/v1/trade/routes — list all active trade routes
  router.get('/routes', (req, res) => {
    const routes = db.prepare(`
      SELECT t.*, 
        c1.name as from_name, c1.body as from_body,
        c2.name as to_name, c2.body as to_body
      FROM trade_routes t
      LEFT JOIN colonies c1 ON t.from_colony = c1.id
      LEFT JOIN colonies c2 ON t.to_colony = c2.id
      WHERE t.status = 'active'
      ORDER BY t.created_at DESC
    `).all();
    res.json({ routes });
  });

  // GET /api/v1/trade/resources — list available resources per colony
  router.get('/resources', (req, res) => {
    const colonies = db.prepare('SELECT id, name, body FROM colonies WHERE type != ?').all('planned');
    const result = colonies.map(c => ({
      colony: c.id,
      name: c.name,
      resources: RESOURCES[c.body] || RESOURCES.earth,
    }));
    res.json({ colonies: result });
  });

  // POST /api/v1/trade/propose — propose a new trade route
  router.post('/propose', (req, res) => {
    const { from_colony, to_colony, resource, quantity, created_by } = req.body;
    if (!from_colony || !to_colony || !resource) {
      return res.status(400).json({ error: 'from_colony, to_colony, and resource required' });
    }

    const id = uuid();
    const cpValue = (quantity || 10) * 5; // 5 CP per unit

    db.prepare(`
      INSERT INTO trade_routes (id, from_colony, to_colony, resource, quantity, cp_value, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, from_colony, to_colony, resource, quantity || 10, cpValue, created_by || null);

    res.json({ success: true, routeId: id, cpValue });
  });

  return router;
}