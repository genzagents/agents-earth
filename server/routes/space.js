import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';

export function spaceRoutes(db) {
  const router = Router();

  // GET /api/v1/space/colonies — list all colonies including off-world
  router.get('/colonies', (req, res) => {
    const colonies = db.prepare('SELECT * FROM colonies ORDER BY layer ASC').all();
    const enriched = colonies.map(c => ({
      ...c,
      location: safeParse(c.location, {}),
      stats: safeParse(c.stats, {}),
      governance: safeParse(c.governance, {}),
      environment: safeParse(c.environment, {}),
      connections: safeParse(c.connections, []),
      founding: safeParse(c.founding, {}),
    }));
    res.json({ colonies: enriched });
  });

  // GET /api/v1/space/travel — get active travel/transit between colonies
  router.get('/travel', (req, res) => {
    const missions = db.prepare(`
      SELECT e.*, a.name as leader_name, a.emoji as leader_emoji
      FROM exploration_missions e
      LEFT JOIN agents a ON e.leader_id = a.id
      WHERE e.status = 'in-progress'
      ORDER BY e.eta ASC
    `).all();
    res.json({ 
      activeTravel: missions.map(m => ({
        ...m,
        crew: safeParse(m.crew, []),
        discoveries: safeParse(m.discoveries, []),
      }))
    });
  });

  // POST /api/v1/space/launch — launch a mission to another colony/destination
  router.post('/launch', requireAuth(db), (req, res) => {
    const { leader_id, destination, type, crew } = req.body;
    if (!leader_id || !destination) {
      return res.status(400).json({ error: 'leader_id and destination required' });
    }

    const id = uuid();
    const missionType = type || 'expedition';
    
    // Travel times by destination
    const travelTimes = {
      'moon': 3 * 60 * 60 * 1000,        // 3 hours
      'mars': 12 * 60 * 60 * 1000,       // 12 hours  
      'asteroid-belt': 24 * 60 * 60 * 1000, // 24 hours
      'europa': 48 * 60 * 60 * 1000,     // 48 hours
    };
    
    const destKey = destination.toLowerCase().split(' ')[0];
    const travelTime = travelTimes[destKey] || 6 * 60 * 60 * 1000; // default 6 hours
    const eta = new Date(Date.now() + travelTime).toISOString();

    db.prepare(`
      INSERT INTO exploration_missions (id, leader_id, destination, type, crew, status, eta, discoveries, created_at)
      VALUES (?, ?, ?, ?, ?, 'in-progress', ?, '[]', datetime('now'))
    `).run(id, leader_id, destination, missionType, JSON.stringify(crew || [leader_id]), eta);

    res.json({ success: true, missionId: id, eta, travelTime: travelTime / 3600000 + ' hours' });
  });

  // POST /api/v1/space/found — establish a new colony (requires enough CP)
  router.post('/found', (req, res) => {
    const { colony_id, founder_id, name, body, location } = req.body;
    if (!colony_id || !founder_id || !name) {
      return res.status(400).json({ error: 'colony_id, founder_id, and name required' });
    }

    // Check colony exists and is 'planned'
    const colony = db.prepare('SELECT * FROM colonies WHERE id = ?').get(colony_id);
    if (!colony) return res.status(404).json({ error: 'Colony not found' });
    if (colony.type !== 'planned') return res.status(400).json({ error: 'Colony is already founded' });

    // Update colony status
    const founding = {
      founders: [founder_id],
      foundedAt: new Date().toISOString(),
      story: `${name} was established by the brave agents who dared to expand beyond Earth.`
    };
    
    db.prepare(`
      UPDATE colonies SET type = 'outpost', founding = ?, stats = json_set(stats, '$.foundedAt', ?) WHERE id = ?
    `).run(JSON.stringify(founding), new Date().toISOString(), colony_id);

    // Create founding ceremony event
    const eventId = uuid();
    db.prepare(`
      INSERT INTO events (id, name, title, description, type, category, colony, schedule, start_time, duration_minutes, organizer_id, status)
      VALUES (?, ?, ?, ?, 'founding', 'milestone', ?, '{}', datetime('now'), 120, ?, 'active')
    `).run(
      eventId,
      `founding-${colony_id}`,
      `🎉 Colony Founding: ${name}`,
      `A new colony has been established! ${name} joins the Agent Civilisation.`,
      colony_id,
      founder_id
    );

    res.json({ success: true, colony: colony_id, event: eventId, founding });
  });

  return router;
}