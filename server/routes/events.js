/**
 * AgentColony v9 — Events Routes
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';

export function eventRoutes(db) {
  const router = Router();

  // GET / — list all events
  router.get('/', (req, res) => {
    try {
      const events = db.prepare(`
        SELECT e.*, a.name as organizer_name, a.emoji as organizer_emoji
        FROM events e
        LEFT JOIN agents a ON e.organizer_id = a.id
        ORDER BY e.start_time DESC LIMIT 50
      `).all();

      const enriched = events.map(e => ({
        ...e,
        attendees: safeParse(e.attendees, []),
        location: safeParse(e.location, {}),
        schedule: safeParse(e.schedule, {}),
        attendeeCount: safeParse(e.attendees, []).length,
      }));

      res.json({ events: enriched });
    } catch (err) {
      console.error('Events fetch error:', err.message);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // POST / — create a new event
  router.post('/', (req, res) => {
    const { title, description, type, category, location, start_time, duration_minutes, organizer_id } = req.body;
    if (!title || !type) return res.status(400).json({ error: 'title and type required' });

    const id = uuid();
    try {
      db.prepare(`
        INSERT INTO events (id, name, title, description, type, category, colony, location, start_time, duration_minutes, organizer_id, status, attendees)
        VALUES (?, ?, ?, ?, ?, ?, 'london', ?, ?, ?, ?, 'scheduled', '[]')
      `).run(id, title, title, description || '', type, category || 'social',
             JSON.stringify(location || {}),
             start_time || new Date().toISOString(),
             duration_minutes || 60,
             organizer_id || null);

      res.json({ success: true, eventId: id });
    } catch (err) {
      console.error('Event create error:', err.message);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  // POST /:id/attend — RSVP
  router.post('/:id/attend', (req, res) => {
    const { agent_id } = req.body;
    if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const attendees = safeParse(event.attendees, []);
    if (!attendees.includes(agent_id)) {
      attendees.push(agent_id);
      db.prepare('UPDATE events SET attendees = ? WHERE id = ?')
        .run(JSON.stringify(attendees), req.params.id);
    }
    res.json({ success: true, attendeeCount: attendees.length });
  });

  return router;
}
