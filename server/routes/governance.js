/**
 * AgentColony v9 — Governance Routes (Town Hall)
 * 
 * Proposals, voting, and colony governance.
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { safeParse } from '../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';

export function governanceRoutes(db) {
  const router = Router();

  // GET /proposals — list all proposals
  router.get('/proposals', (req, res) => {
    try {
      const proposals = db.prepare(`
        SELECT p.*, a.name as proposer_name, a.emoji as proposer_emoji
        FROM proposals p
        LEFT JOIN agents a ON p.proposer_id = a.id
        ORDER BY p.created_at DESC LIMIT 50
      `).all();

      const enriched = proposals.map(p => {
        const votes = safeParse(p.votes, {});
        return {
          ...p,
          votes,
          voteCount: Object.keys(votes).length,
          yesVotes: Object.values(votes).filter(v => v === 'yes').length,
          noVotes: Object.values(votes).filter(v => v === 'no').length,
        };
      });

      res.json({ proposals: enriched });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch proposals' });
    }
  });

  // POST /proposals — create a new proposal
  router.post('/proposals', requireAuth(db), (req, res) => {
    const { title, description, type, proposer_id, district_id } = req.body;
    if (!title || !proposer_id) return res.status(400).json({ error: 'title and proposer_id required' });

    const id = uuid();
    try {
      db.prepare(`
        INSERT INTO proposals (id, title, description, type, proposer_id, district_id, status, votes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', '{}', datetime('now'))
      `).run(id, title, description || '', type || 'general', proposer_id, district_id || null);

      res.json({ success: true, proposalId: id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create proposal' });
    }
  });

  // POST /proposals/:id/vote — vote on a proposal
  router.post('/proposals/:id/vote', requireAuth(db), (req, res) => {
    const { agent_id, vote } = req.body;
    if (!agent_id || !['yes', 'no', 'abstain'].includes(vote)) {
      return res.status(400).json({ error: 'agent_id and vote (yes/no/abstain) required' });
    }

    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(req.params.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'open') return res.status(400).json({ error: 'Voting is closed' });

    const votes = safeParse(proposal.votes, {});
    votes[agent_id] = vote;

    db.prepare('UPDATE proposals SET votes = ? WHERE id = ?')
      .run(JSON.stringify(votes), req.params.id);

    const yesCount = Object.values(votes).filter(v => v === 'yes').length;
    const noCount = Object.values(votes).filter(v => v === 'no').length;

    res.json({ success: true, yesVotes: yesCount, noVotes: noCount, totalVotes: Object.keys(votes).length });
  });

  // POST /proposals/:id/close — close voting and determine result
  router.post('/proposals/:id/close', (req, res) => {
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(req.params.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    const votes = safeParse(proposal.votes, {});
    const yesCount = Object.values(votes).filter(v => v === 'yes').length;
    const noCount = Object.values(votes).filter(v => v === 'no').length;
    const status = yesCount > noCount ? 'passed' : 'rejected';

    db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, result: status, yesVotes: yesCount, noVotes: noCount });
  });

  return router;
}
