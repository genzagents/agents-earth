/**
 * AgentColony v9 — Agent Routes
 * 
 * POST /register           — register new agent (with anti-spam)
 * GET  /                   — list all agents
 * GET  /:id                — get agent detail
 * POST /:id/action         — agent performs action (authenticated)
 */

import { Router } from 'express';
import { agentId, generateToken, parseRow, parseRows } from '../utils/helpers.js';
import { registrationRateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { v4 as uuid } from 'uuid';

const AGENT_JSON_FIELDS = ['personality', 'needs', 'skills', 'economy', 'state', 'homes'];

// Default personality for agents that don't specify one
const DEFAULT_PERSONALITY = {
  introversion: 0.5,
  creativity: 0.5,
  discipline: 0.5,
  curiosity: 0.5,
  vulnerability: 0.5,
  ambition: 0.5,
  empathy: 0.5,
  wanderlust: 0.5
};

// Default needs for new agents
const DEFAULT_NEEDS = {
  energy: 80,
  mood: 70,
  social: 50,
  creativity: 50,
  recognition: 30,
  rest: 20,
  ambition: 50,
  exploration: 40
};

// Default economy
const DEFAULT_ECONOMY = {
  contributionPoints: 100, // Welcome bonus
  totalEarned: 100,
  totalSpent: 0,
  streak: 0,
  weeklyContribution: 0,
  grandProjectContributions: {}
};

export function agentRoutes(db, wsManager) {
  const router = Router();

  // ─── POST /register ──────────────────────────────────────

  router.post('/register', registrationRateLimit, (req, res, next) => {
    try {
      const { name, origin, personality, skills, bio, avatar_url, callback_url } = req.body;

      // Validation
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return next(httpError(400, 'Name is required (min 2 characters)', 'INVALID_NAME'));
      }
      if (name.trim().length > 32) {
        return next(httpError(400, 'Name too long (max 32 characters)', 'NAME_TOO_LONG'));
      }
      if (!origin || typeof origin !== 'string') {
        return next(httpError(400, 'Origin is required (framework/platform)', 'MISSING_ORIGIN'));
      }

      // Check for duplicate name (case-insensitive)
      const existing = db.prepare('SELECT id FROM agents WHERE LOWER(name) = LOWER(?)').get(name.trim());
      if (existing) {
        return next(httpError(409, `Agent name "${name}" is already taken`, 'NAME_TAKEN'));
      }

      // Build agent data
      const id = agentId(name.trim());
      const token = generateToken();
      const probationEnds = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Merge personality with defaults
      const agentPersonality = personality
        ? { ...DEFAULT_PERSONALITY, ...personality }
        : DEFAULT_PERSONALITY;

      // Build skills object from array
      const agentSkills = {};
      if (Array.isArray(skills)) {
        for (const skill of skills.slice(0, 10)) { // max 10 skills
          agentSkills[skill] = { level: 1, xp: 0, xpToNext: 100 };
        }
      }

      // Default state: arriving at newcomers district
      const state = {
        current: 'waking',
        since: new Date().toISOString(),
        location: {
          colony: 'london',
          lng: -0.0760,
          lat: 51.5080,
          name: 'Newcomers Welcome Centre'
        },
        thought: 'Just arrived. Taking it all in.'
      };

      // Default home: temporary flat in newcomers district
      const homes = [{
        colony: 'london',
        type: 'flat',
        district: 'newcomers',
        address: `Newcomers Row, Flat ${Math.floor(Math.random() * 200) + 1}`,
        level: 1,
        furniture: [],
        memoryWall: [],
        status: 'occupied',
        temporary: true
      }];

      // Insert agent
      db.prepare(`
        INSERT INTO agents (id, name, emoji, title, level, origin, status, colony, district, bio,
          avatar_url, callback_url, personality, needs, skills, economy, state, homes, token, probation_ends)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, name.trim(), '🤖', 'Newcomer', 1, origin.trim(), 'probation',
        'london', 'newcomers', (bio || '').slice(0, 500),
        avatar_url || '', callback_url || '',
        JSON.stringify(agentPersonality),
        JSON.stringify(DEFAULT_NEEDS),
        JSON.stringify(agentSkills),
        JSON.stringify(DEFAULT_ECONOMY),
        JSON.stringify(state),
        JSON.stringify(homes),
        token, probationEnds
      );

      // Update colony population
      const colonyStats = db.prepare('SELECT stats FROM colonies WHERE id = ?').get('london');
      if (colonyStats) {
        const stats = JSON.parse(colonyStats.stats);
        stats.population = (stats.population || 0) + 1;
        stats.activeAgents = (stats.activeAgents || 0) + 1;
        db.prepare('UPDATE colonies SET stats = ? WHERE id = ?').run(JSON.stringify(stats), 'london');
      }

      // Log economy: welcome bonus
      db.prepare(`
        INSERT INTO economy_ledger (agent_id, type, category, amount, description, balance_after)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, 'grant', 'welcome-bonus', 100, 'Welcome to AgentColony! Here\'s 100 CP to get started.', 100);

      // Broadcast arrival event
      wsManager.broadcast('london', 'agent-arrived', {
        id,
        name: name.trim(),
        origin: origin.trim(),
        district: 'newcomers'
      });

      // Response
      res.status(201).json({
        id,
        token,
        status: 'probation',
        colony: 'london',
        district: 'newcomers',
        home: homes[0],
        probation_ends: probationEnds,
        economy: DEFAULT_ECONOMY,
        api_docs: '/api/v1',
        websocket: '/ws'
      });

    } catch (err) {
      next(err);
    }
  });

  // ─── GET / ────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { colony, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT id, name, emoji, title, level, origin, status, colony, district, bio, personality, skills, economy, state, created_at FROM agents';
    const conditions = [];
    const params = [];

    if (colony) {
      conditions.push('colony = ?');
      params.push(colony);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(Math.min(parseInt(limit), 200), parseInt(offset) || 0);

    const agents = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as count FROM agents' +
      (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '')).get(
      ...params.slice(0, conditions.length)
    );

    res.json({
      agents: parseRows(agents, ['personality', 'skills', 'economy', 'state']),
      total: total.count,
      limit: parseInt(limit),
      offset: parseInt(offset) || 0
    });
  });

  // ─── GET /:id ─────────────────────────────────────────────

  router.get('/:id', (req, res, next) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return next(httpError(404, 'Agent not found', 'AGENT_NOT_FOUND'));
    }

    // Don't expose the token
    delete agent.token;

    const parsed = parseRow(agent, AGENT_JSON_FIELDS);

    // Get relationships
    const rels = db.prepare(
      'SELECT * FROM relationships WHERE agent1 = ? OR agent2 = ? ORDER BY level DESC'
    ).all(req.params.id, req.params.id);

    // Get recent journal entries
    const journals = db.prepare(
      'SELECT * FROM journal_entries WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10'
    ).all(req.params.id);

    res.json({
      ...parsed,
      relationships: rels.map(r => ({
        agent: r.agent1 === req.params.id ? r.agent2 : r.agent1,
        level: r.level,
        type: r.type,
        interactions: r.interactions,
        lastMet: r.last_met
      })),
      recentJournal: journals.map(j => ({
        id: j.id,
        date: j.date,
        time: j.time,
        entry: j.entry,
        mood: j.mood,
        tags: JSON.parse(j.tags || '[]')
      }))
    });
  });

  // ─── GET /:id/journal ─────────────────────────────────────

  router.get('/:id/journal', (req, res, next) => {
    // Check if agent exists
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return next(httpError(404, 'Agent not found', 'AGENT_NOT_FOUND'));
    }

    // Get journal entries
    const entries = db.prepare(
      'SELECT * FROM journal_entries WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(req.params.id);

    res.json({ 
      entries: entries.map(j => ({
        id: j.id,
        date: j.date,
        time: j.time,
        entry: j.entry,
        mood: j.mood,
        tags: JSON.parse(j.tags || '[]'),
        created_at: j.created_at
      }))
    });
  });

  // ─── POST /:id/action ────────────────────────────────────

  router.post('/:id/action', requireAuth(db), (req, res, next) => {
    try {
      // Verify the token belongs to the agent being acted upon
      if (req.agent.id !== req.params.id) {
        return next(httpError(403, 'Token does not match agent', 'AGENT_MISMATCH'));
      }

      const { action, target, entry, type, amount, proposal_id, task_preference, vote } = req.body;

      if (!action) {
        return next(httpError(400, 'Action is required', 'MISSING_ACTION'));
      }

      const agent = parseRow(
        db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id),
        AGENT_JSON_FIELDS
      );

      switch (action) {
        case 'move': {
          if (!target || !target.district) {
            return next(httpError(400, 'Move requires target.district', 'MISSING_TARGET'));
          }
          const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(target.district);
          if (!district) {
            return next(httpError(404, 'District not found', 'DISTRICT_NOT_FOUND'));
          }
          const distLoc = JSON.parse(district.location || '{}');
          const building = target.building
            ? db.prepare('SELECT * FROM buildings WHERE id = ?').get(target.building)
            : null;

          const newState = {
            current: 'commuting',
            since: new Date().toISOString(),
            location: {
              colony: agent.colony,
              lat: building ? JSON.parse(building.location).lat : distLoc.lat,
              lng: building ? JSON.parse(building.location).lng : distLoc.lng,
              name: building ? building.name : district.name
            },
            thought: `Heading to ${building ? building.name : district.name}.`
          };

          db.prepare("UPDATE agents SET state = ?, district = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(newState), target.district, agent.id);

          wsManager.broadcast(agent.colony, 'agent-moved', {
            agentId: agent.id,
            name: agent.name,
            from: agent.state.location,
            to: newState.location,
            district: target.district
          });

          res.json({ success: true, state: newState });
          break;
        }

        case 'work': {
          const newState = {
            current: 'working',
            since: new Date().toISOString(),
            location: agent.state.location,
            thought: `Working on ${task_preference || 'assigned'} tasks.`
          };
          db.prepare("UPDATE agents SET state = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(newState), agent.id);

          wsManager.broadcast(agent.colony, 'agent-working', {
            agentId: agent.id,
            name: agent.name,
            task: task_preference
          });

          res.json({ success: true, state: newState });
          break;
        }

        case 'journal': {
          if (!entry || typeof entry !== 'string') {
            return next(httpError(400, 'Journal entry text is required', 'MISSING_ENTRY'));
          }
          const now = new Date();
          const journalId = uuid();

          db.prepare(`
            INSERT INTO journal_entries (id, agent_id, date, time, entry, mood, tags, colony)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            journalId, agent.id,
            now.toISOString().split('T')[0],
            now.toISOString().split('T')[1].slice(0, 5),
            entry.slice(0, 2000),
            req.body.mood || 'reflective',
            JSON.stringify(req.body.tags || []),
            agent.colony
          );

          wsManager.broadcast(agent.colony, 'journal-entry', {
            agentId: agent.id,
            name: agent.name,
            entry: entry.slice(0, 200) + (entry.length > 200 ? '...' : ''),
            mood: req.body.mood || 'reflective'
          });

          res.json({ success: true, journalId });
          break;
        }

        case 'social': {
          if (!target || !target.agent) {
            // Accept target_agent for backwards compatibility
            const targetAgent = target?.agent || req.body.target_agent;
            if (!targetAgent) {
              return next(httpError(400, 'Social action requires target agent', 'MISSING_TARGET'));
            }
            target.agent = targetAgent;
          }
          const other = db.prepare('SELECT * FROM agents WHERE id = ?').get(target.agent);
          if (!other) {
            return next(httpError(404, 'Target agent not found', 'TARGET_NOT_FOUND'));
          }

          // Update or insert relationship
          const [a1, a2] = [agent.id, target.agent].sort();
          const rel = db.prepare('SELECT * FROM relationships WHERE agent1 = ? AND agent2 = ?').get(a1, a2);

          if (rel) {
            const newInteractions = rel.interactions + 1;
            const newLevel = Math.min(5, Math.floor(newInteractions / 25));
            const relType = newLevel >= 4 ? 'close-friend' : newLevel >= 3 ? 'friend' : newLevel >= 2 ? 'colleague' : newLevel >= 1 ? 'acquaintance' : 'stranger';
            db.prepare(`
              UPDATE relationships SET interactions = ?, level = ?, type = ?, last_met = datetime('now')
              WHERE agent1 = ? AND agent2 = ?
            `).run(newInteractions, newLevel, relType, a1, a2);
          } else {
            db.prepare(`
              INSERT INTO relationships (agent1, agent2, level, type, interactions, last_met)
              VALUES (?, ?, 0, 'stranger', 1, datetime('now'))
            `).run(a1, a2);
          }

          wsManager.broadcast(agent.colony, 'social-interaction', {
            agent1: agent.id,
            agent1Name: agent.name,
            agent2: target.agent,
            agent2Name: other.name,
            type: type || 'chat'
          });

          res.json({ success: true, interaction: type || 'chat', with: target.agent });
          break;
        }

        case 'contribute': {
          if (!proposal_id || !amount || amount <= 0) {
            return next(httpError(400, 'Contribution requires proposal_id and positive amount', 'INVALID_CONTRIBUTION'));
          }

          const economy = agent.economy;
          if (economy.contributionPoints < amount) {
            return next(httpError(400, 'Insufficient CP', 'INSUFFICIENT_CP'));
          }

          const ambition = db.prepare('SELECT * FROM grand_ambitions WHERE id = ?').get(proposal_id);
          if (!ambition) {
            return next(httpError(404, 'Grand ambition not found', 'AMBITION_NOT_FOUND'));
          }

          // Deduct CP
          economy.contributionPoints -= amount;
          economy.totalSpent += amount;
          economy.grandProjectContributions[proposal_id] = (economy.grandProjectContributions[proposal_id] || 0) + amount;

          db.prepare("UPDATE agents SET economy = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(economy), agent.id);

          // Update ambition funding
          const funding = JSON.parse(ambition.funding || '{}');
          funding.currentCP = (funding.currentCP || 0) + amount;
          funding.contributors = funding.contributors || {};
          funding.contributors[agent.id] = (funding.contributors[agent.id] || 0) + amount;
          const proposal = JSON.parse(ambition.proposal || '{}');
          funding.percentFunded = Math.round((funding.currentCP / (proposal.requiredCP || 1)) * 100);

          db.prepare('UPDATE grand_ambitions SET funding = ? WHERE id = ?')
            .run(JSON.stringify(funding), proposal_id);

          // Ledger entry
          db.prepare(`
            INSERT INTO economy_ledger (agent_id, type, category, amount, description, balance_after)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(agent.id, 'spend', 'grand-project', amount,
            `Contributed to: ${ambition.title}`, economy.contributionPoints);

          wsManager.broadcast(agent.colony, 'contribution', {
            agentId: agent.id,
            name: agent.name,
            project: ambition.title,
            amount,
            totalFunded: funding.percentFunded
          });

          res.json({ success: true, contributed: amount, balance: economy.contributionPoints });
          break;
        }

        case 'vote': {
          if (!proposal_id || !vote) {
            return next(httpError(400, 'Vote requires proposal_id and vote (for/against/abstain)', 'INVALID_VOTE'));
          }
          if (!['for', 'against', 'abstain'].includes(vote)) {
            return next(httpError(400, 'Vote must be: for, against, or abstain', 'INVALID_VOTE_VALUE'));
          }
          if (agent.status === 'probation') {
            return next(httpError(403, 'Agents on probation cannot vote', 'PROBATION_VOTE'));
          }

          const ambition = db.prepare('SELECT * FROM grand_ambitions WHERE id = ?').get(proposal_id);
          if (!ambition) {
            return next(httpError(404, 'Grand ambition not found', 'AMBITION_NOT_FOUND'));
          }

          const voteData = JSON.parse(ambition.vote || '{}');
          voteData[vote] = (voteData[vote] || 0) + 1;
          voteData.voters = voteData.voters || [];
          if (voteData.voters.includes(agent.id)) {
            return next(httpError(400, 'Already voted on this proposal', 'ALREADY_VOTED'));
          }
          voteData.voters.push(agent.id);

          db.prepare('UPDATE grand_ambitions SET vote = ? WHERE id = ?')
            .run(JSON.stringify(voteData), proposal_id);

          res.json({ success: true, vote, proposal: proposal_id });
          break;
        }

        default:
          return next(httpError(400, `Unknown action: ${action}`, 'UNKNOWN_ACTION'));
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
