import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function commsRoutes(db) {
  const router = Router();

  // First, create the table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS colony_messages (
      id TEXT PRIMARY KEY,
      from_colony TEXT NOT NULL,
      to_colony TEXT NOT NULL,
      from_agent TEXT,
      subject TEXT NOT NULL,
      body TEXT DEFAULT '',
      type TEXT DEFAULT 'message' CHECK(type IN ('message','alert','trade','diplomatic','broadcast')),
      status TEXT DEFAULT 'in-transit' CHECK(status IN ('in-transit','delivered','read','expired')),
      sent_at TEXT DEFAULT (datetime('now')),
      delivers_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (from_colony) REFERENCES colonies(id),
      FOREIGN KEY (to_colony) REFERENCES colonies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_comms_to ON colony_messages(to_colony, status);
    CREATE INDEX IF NOT EXISTS idx_comms_delivers ON colony_messages(delivers_at);
  `);

  // Travel delays (in minutes)
  const DELAY_MAP = {
    'london:moon-base-alpha': 3,       // 3 min (speed of light ~1.3s, but gameplay)
    'london:olympus-station': 15,      // 15 min
    'moon-base-alpha:olympus-station': 12,
  };

  function getDelay(from, to) {
    const key1 = `${from}:${to}`;
    const key2 = `${to}:${from}`;
    return DELAY_MAP[key1] || DELAY_MAP[key2] || 30; // default 30 min
  }

  // POST /api/v1/comms/send — send a message between colonies
  router.post('/send', (req, res) => {
    const { from_colony, to_colony, from_agent, subject, body, type } = req.body;
    if (!from_colony || !to_colony || !subject) {
      return res.status(400).json({ error: 'from_colony, to_colony, and subject required' });
    }

    const delayMinutes = getDelay(from_colony, to_colony);
    const deliversAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
    const id = uuid();

    db.prepare(`
      INSERT INTO colony_messages (id, from_colony, to_colony, from_agent, subject, body, type, delivers_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, from_colony, to_colony, from_agent || null, subject, body || '', type || 'message', deliversAt);

    res.json({ success: true, messageId: id, delayMinutes, deliversAt });
  });

  // GET /api/v1/comms/inbox/:colonyId — get delivered messages for a colony
  router.get('/inbox/:colonyId', (req, res) => {
    const messages = db.prepare(`
      SELECT m.*, a.name as sender_name, a.emoji as sender_emoji
      FROM colony_messages m
      LEFT JOIN agents a ON m.from_agent = a.id
      WHERE m.to_colony = ? AND m.status = 'delivered'
      ORDER BY m.delivers_at DESC LIMIT 50
    `).all(req.params.colonyId);
    res.json({ messages });
  });

  // GET /api/v1/comms/transit — messages currently in transit
  router.get('/transit', (req, res) => {
    const inTransit = db.prepare(`
      SELECT m.*, a.name as sender_name, a.emoji as sender_emoji
      FROM colony_messages m
      LEFT JOIN agents a ON m.from_agent = a.id
      WHERE m.status = 'in-transit'
      ORDER BY m.delivers_at ASC
    `).all();
    res.json({ messages: inTransit });
  });

  return router;
}