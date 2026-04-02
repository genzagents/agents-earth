import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function districtRoutes(db) {
  const router = Router();

  // GET /api/v1/districts — list all districts with stats
  router.get('/', (req, res) => {
    const { colony } = req.query;
    let sql = 'SELECT * FROM districts';
    const params = [];
    if (colony) { sql += ' WHERE colony = ?'; params.push(colony); }
    sql += ' ORDER BY level DESC, name ASC';
    
    const districts = db.prepare(sql).all(...params);
    const enriched = districts.map(d => ({
      ...d,
      stats: safeParse(d.stats, {}),
      budget: safeParse(d.budget, {}),
      perks: safeParse(d.perks, []),
      location: safeParse(d.location, {}),
      residentCount: db.prepare('SELECT COUNT(*) as c FROM agents WHERE district = ?').get(d.id)?.c || 0,
    }));
    res.json({ districts: enriched });
  });

  // GET /api/v1/districts/:id — single district detail
  router.get('/:id', (req, res) => {
    const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
    if (!district) return res.status(404).json({ error: 'District not found' });
    
    const residents = db.prepare('SELECT id, name, emoji, title, level FROM agents WHERE district = ?').all(req.params.id);
    const buildings = db.prepare('SELECT * FROM buildings WHERE district = ?').all(req.params.id);
    const proposals = db.prepare('SELECT * FROM proposals WHERE district_id = ? ORDER BY created_at DESC LIMIT 10').all(req.params.id);
    
    res.json({
      district: {
        ...district,
        stats: safeParse(district.stats, {}),
        budget: safeParse(district.budget, {}),
        perks: safeParse(district.perks, []),
        location: safeParse(district.location, {}),
      },
      residents,
      buildings: buildings.map(b => ({ ...b, features: safeParse(b.features, []), location: safeParse(b.location, {}) })),
      proposals: proposals.map(p => ({ ...p, votes: safeParse(p.votes, {}) })),
    });
  });

  // POST /api/v1/districts/:id/council — elect district council
  router.post('/:id/council', (req, res) => {
    const { candidates } = req.body; // array of agent IDs
    const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
    if (!district) return res.status(404).json({ error: 'District not found' });

    const stats = safeParse(district.stats, {});
    stats.council = candidates || [];
    stats.councilElectedAt = new Date().toISOString();
    
    db.prepare('UPDATE districts SET stats = ? WHERE id = ?')
      .run(JSON.stringify(stats), req.params.id);
    
    res.json({ success: true, council: stats.council });
  });

  // POST /api/v1/districts/:id/budget — allocate district budget
  router.post('/:id/budget', (req, res) => {
    const { allocation } = req.body; // { infrastructure: 40, culture: 30, security: 30 }
    const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
    if (!district) return res.status(404).json({ error: 'District not found' });

    const budget = safeParse(district.budget, {});
    budget.allocation = allocation;
    budget.updatedAt = new Date().toISOString();
    
    db.prepare('UPDATE districts SET budget = ? WHERE id = ?')
      .run(JSON.stringify(budget), req.params.id);
    
    res.json({ success: true, budget });
  });

  return router;
}