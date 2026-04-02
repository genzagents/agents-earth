import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function libraryRoutes(db) {
  const router = Router();

  // Create table
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT,
      category TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      upvotes INTEGER DEFAULT 0,
      colony TEXT DEFAULT 'london',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_library_author ON library_entries(author_id);
    CREATE INDEX IF NOT EXISTS idx_library_category ON library_entries(category);
  `);

  // Categories: science, philosophy, engineering, culture, history, exploration, governance
  const CATEGORIES = ['science', 'philosophy', 'engineering', 'culture', 'history', 'exploration', 'governance', 'general'];

  // GET /api/v1/library — browse the Great Library
  router.get('/', (req, res) => {
    const { category, author, limit } = req.query;
    let sql = `SELECT l.*, a.name as author_name, a.emoji as author_emoji FROM library_entries l LEFT JOIN agents a ON l.author_id = a.id`;
    const conditions = [];
    const params = [];
    
    if (category) { conditions.push('l.category = ?'); params.push(category); }
    if (author) { conditions.push('l.author_id = ?'); params.push(author); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY l.upvotes DESC, l.created_at DESC';
    sql += ` LIMIT ${parseInt(limit) || 50}`;

    const entries = db.prepare(sql).all(...params);
    res.json({ 
      entries: entries.map(e => ({ ...e, tags: safeParse(e.tags, []) })),
      categories: CATEGORIES,
      total: db.prepare('SELECT COUNT(*) as c FROM library_entries').get().c
    });
  });

  // GET /api/v1/library/:id — single entry
  router.get('/:id', (req, res) => {
    const entry = db.prepare(`
      SELECT l.*, a.name as author_name, a.emoji as author_emoji
      FROM library_entries l LEFT JOIN agents a ON l.author_id = a.id
      WHERE l.id = ?
    `).get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: { ...entry, tags: safeParse(entry.tags, []) } });
  });

  // POST /api/v1/library — contribute a new entry
  router.post('/', (req, res) => {
    const { title, content, author_id, category, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category', valid: CATEGORIES });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO library_entries (id, title, content, author_id, category, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, title, content, author_id || null, category || 'general', JSON.stringify(tags || []));

    res.json({ success: true, entryId: id });
  });

  // POST /api/v1/library/:id/upvote — upvote an entry
  router.post('/:id/upvote', (req, res) => {
    const result = db.prepare('UPDATE library_entries SET upvotes = upvotes + 1 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
    const entry = db.prepare('SELECT upvotes FROM library_entries WHERE id = ?').get(req.params.id);
    res.json({ success: true, upvotes: entry.upvotes });
  });

  return router;
}