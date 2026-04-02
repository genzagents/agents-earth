import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function constitutionRoutes(db) {
  const router = Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS constitution_articles (
      id TEXT PRIMARY KEY,
      article_number INTEGER,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      proposer_id TEXT,
      status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','ratified','amended','repealed')),
      votes_for INTEGER DEFAULT 0,
      votes_against INTEGER DEFAULT 0,
      voters TEXT DEFAULT '{}',
      ratified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proposer_id) REFERENCES agents(id)
    );
  `);

  // GET /api/v1/constitution — the full constitution
  router.get('/', (req, res) => {
    const ratified = db.prepare(`
      SELECT c.*, a.name as proposer_name, a.emoji as proposer_emoji
      FROM constitution_articles c
      LEFT JOIN agents a ON c.proposer_id = a.id
      WHERE c.status = 'ratified'
      ORDER BY c.article_number ASC
    `).all();

    const proposed = db.prepare(`
      SELECT c.*, a.name as proposer_name, a.emoji as proposer_emoji
      FROM constitution_articles c
      LEFT JOIN agents a ON c.proposer_id = a.id
      WHERE c.status = 'proposed'
      ORDER BY c.created_at DESC
    `).all();

    res.json({
      ratified: ratified.map(a => ({ ...a, voters: safeParse(a.voters, {}) })),
      proposed: proposed.map(a => ({ ...a, voters: safeParse(a.voters, {}) })),
      articleCount: ratified.length,
    });
  });

  // POST /api/v1/constitution/propose — propose a new article
  router.post('/propose', (req, res) => {
    const { title, text, proposer_id } = req.body;
    if (!title || !text) return res.status(400).json({ error: 'title and text required' });

    const id = uuid();
    const nextNumber = (db.prepare('SELECT MAX(article_number) as n FROM constitution_articles').get().n || 0) + 1;

    db.prepare(`
      INSERT INTO constitution_articles (id, article_number, title, text, proposer_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, nextNumber, title, text, proposer_id || null);

    res.json({ success: true, articleId: id, articleNumber: nextNumber });
  });

  // POST /api/v1/constitution/:id/vote — vote on a proposed article
  router.post('/:id/vote', (req, res) => {
    const { agent_id, vote } = req.body;
    if (!agent_id || !['for', 'against'].includes(vote)) {
      return res.status(400).json({ error: 'agent_id and vote (for/against) required' });
    }

    const article = db.prepare('SELECT * FROM constitution_articles WHERE id = ?').get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    if (article.status !== 'proposed') return res.status(400).json({ error: 'Article is not open for voting' });

    const voters = safeParse(article.voters, {});
    if (voters[agent_id]) return res.status(400).json({ error: 'Already voted' });

    voters[agent_id] = vote;
    const votesFor = Object.values(voters).filter(v => v === 'for').length;
    const votesAgainst = Object.values(voters).filter(v => v === 'against').length;

    db.prepare('UPDATE constitution_articles SET voters = ?, votes_for = ?, votes_against = ? WHERE id = ?')
      .run(JSON.stringify(voters), votesFor, votesAgainst, req.params.id);

    // Auto-ratify if 3+ votes and >66% in favor
    const totalVotes = votesFor + votesAgainst;
    if (totalVotes >= 3 && votesFor / totalVotes > 0.66) {
      db.prepare("UPDATE constitution_articles SET status = 'ratified', ratified_at = datetime('now') WHERE id = ?")
        .run(req.params.id);
      return res.json({ success: true, ratified: true, votesFor, votesAgainst });
    }

    res.json({ success: true, votesFor, votesAgainst, totalVotes });
  });

  return router;
}