import { Router } from 'express';
import { v4 as uuid } from 'uuid';

export function milestoneRoutes(db) {
  const router = Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      achieved_at TEXT DEFAULT (datetime('now')),
      colony TEXT DEFAULT 'london'
    );
  `);

  // GET /api/v1/milestones — list all milestones
  router.get('/', (req, res) => {
    const milestones = db.prepare('SELECT * FROM milestones ORDER BY achieved_at DESC').all();
    res.json({ milestones, total: milestones.length });
  });

  // POST /api/v1/milestones — record a milestone (admin/system)
  router.post('/', (req, res) => {
    const { title, description, category, colony } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    
    const id = uuid();
    db.prepare(`INSERT INTO milestones (id, title, description, category, colony) VALUES (?, ?, ?, ?, ?)`)
      .run(id, title, description || '', category || 'general', colony || 'london');
    res.json({ success: true, milestoneId: id });
  });

  return router;
}