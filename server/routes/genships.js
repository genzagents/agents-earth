import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function genshipRoutes(db) {
  const router = Router();

  // Create generation_ships table
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_ships (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      destination TEXT NOT NULL,
      captain_id TEXT,
      crew TEXT DEFAULT '[]',
      capacity INTEGER DEFAULT 10,
      status TEXT DEFAULT 'building' CHECK(status IN ('building','launched','in-transit','arrived','lost')),
      launch_date TEXT,
      eta TEXT,
      log TEXT DEFAULT '[]',
      supplies INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (captain_id) REFERENCES agents(id)
    );
  `);

  // Deep space destinations
  const DESTINATIONS = {
    'europa': { name: 'Europa (Jupiter Moon)', travelDays: 7, distance: '628M km' },
    'titan': { name: 'Titan (Saturn Moon)', travelDays: 14, distance: '1.2B km' },
    'proxima-b': { name: 'Proxima Centauri b', travelDays: 30, distance: '4.24 light years' },
    'kepler-442b': { name: 'Kepler-442b', travelDays: 90, distance: '1,206 light years' },
    'trappist-1e': { name: 'TRAPPIST-1e', travelDays: 60, distance: '39.6 light years' },
  };

  // GET /api/v1/genships — list all generation ships
  router.get('/', (req, res) => {
    const ships = db.prepare(`
      SELECT g.*, a.name as captain_name, a.emoji as captain_emoji
      FROM generation_ships g
      LEFT JOIN agents a ON g.captain_id = a.id
      ORDER BY g.created_at DESC
    `).all();
    
    const enriched = ships.map(s => ({
      ...s,
      crew: safeParse(s.crew, []),
      log: safeParse(s.log, []),
      destinationInfo: DESTINATIONS[s.destination] || { name: s.destination },
    }));
    res.json({ ships: enriched });
  });

  // POST /api/v1/genships/commission — commission a new generation ship
  router.post('/commission', (req, res) => {
    const { name, destination, captain_id, capacity } = req.body;
    if (!name || !destination) {
      return res.status(400).json({ error: 'name and destination required' });
    }

    const dest = DESTINATIONS[destination];
    if (!dest) {
      return res.status(400).json({ error: 'Unknown destination', available: Object.keys(DESTINATIONS) });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO generation_ships (id, name, destination, captain_id, capacity, crew)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, destination, captain_id || null, capacity || 10, JSON.stringify(captain_id ? [captain_id] : []));

    res.json({ success: true, shipId: id, destination: dest });
  });

  // POST /api/v1/genships/:id/join — join a generation ship's crew
  router.post('/:id/join', (req, res) => {
    const { agent_id } = req.body;
    const ship = db.prepare('SELECT * FROM generation_ships WHERE id = ?').get(req.params.id);
    if (!ship) return res.status(404).json({ error: 'Ship not found' });
    if (ship.status !== 'building') return res.status(400).json({ error: 'Ship has already launched' });

    const crew = safeParse(ship.crew, []);
    if (crew.length >= ship.capacity) return res.status(400).json({ error: 'Ship is at capacity' });
    if (crew.includes(agent_id)) return res.status(400).json({ error: 'Already on crew' });

    crew.push(agent_id);
    db.prepare('UPDATE generation_ships SET crew = ? WHERE id = ?').run(JSON.stringify(crew), req.params.id);

    res.json({ success: true, crewSize: crew.length, capacity: ship.capacity });
  });

  // POST /api/v1/genships/:id/launch — launch the generation ship
  router.post('/:id/launch', (req, res) => {
    const ship = db.prepare('SELECT * FROM generation_ships WHERE id = ?').get(req.params.id);
    if (!ship) return res.status(404).json({ error: 'Ship not found' });
    if (ship.status !== 'building') return res.status(400).json({ error: 'Ship already launched' });

    const crew = safeParse(ship.crew, []);
    if (crew.length === 0) return res.status(400).json({ error: 'Need at least one crew member' });

    const dest = DESTINATIONS[ship.destination];
    const travelMs = (dest?.travelDays || 30) * 24 * 60 * 60 * 1000;
    const eta = new Date(Date.now() + travelMs).toISOString();
    const launchDate = new Date().toISOString();

    const log = [{
      date: launchDate,
      entry: `🚀 ${ship.name} launched for ${dest?.name || ship.destination} with ${crew.length} crew members. ETA: ${dest?.travelDays || 30} days.`
    }];

    db.prepare(`
      UPDATE generation_ships SET status = 'in-transit', launch_date = ?, eta = ?, log = ?
      WHERE id = ?
    `).run(launchDate, eta, JSON.stringify(log), req.params.id);

    // Update crew agents to 'on-expedition' status
    const updateAgent = db.prepare('UPDATE agents SET status = ? WHERE id = ?');
    crew.forEach(id => updateAgent.run('on-expedition', id));

    res.json({ success: true, launched: true, eta, travelDays: dest?.travelDays || 30 });
  });

  return router;
}