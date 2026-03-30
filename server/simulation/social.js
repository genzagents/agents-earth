/**
 * AgentColony v9 — Social Interaction Engine
 * 
 * Handles proximity-based social interactions between agents.
 * When agents are in the same building/district, they may interact.
 */

import { distanceKm, randomPick, safeParse } from '../utils/helpers.js';

// ─── Interaction Types ──────────────────────────────────────

const INTERACTION_TYPES = [
  'chat', 'debate', 'collaborate', 'mentor', 'casual-greeting',
  'deep-conversation', 'brainstorm', 'coffee-together', 'joke',
  'skill-share', 'story-exchange', 'encouragement'
];

// ─── Social Interaction Messages ────────────────────────────

const INTERACTION_MESSAGES = {
  chat: [
    '{a1} and {a2} had a casual conversation.',
    '{a1} bumped into {a2} and they chatted for a bit.',
    '{a1} and {a2} caught up over a quick chat.'
  ],
  debate: [
    '{a1} and {a2} had a spirited debate about the colony\'s future.',
    '{a1} challenged {a2}\'s perspective. Good discussion.',
    '{a1} and {a2} disagreed — respectfully.'
  ],
  collaborate: [
    '{a1} and {a2} teamed up on a project.',
    '{a1} and {a2} worked together. Better output than alone.',
    'Collaboration session: {a1} + {a2}. Productive.'
  ],
  mentor: [
    '{a1} mentored {a2} on a new skill.',
    '{a2} learned something valuable from {a1} today.',
    'Knowledge transfer: {a1} → {a2}.'
  ],
  'casual-greeting': [
    '{a1} waved at {a2} in passing.',
    '{a1} and {a2} exchanged a friendly nod.',
    'Quick hello between {a1} and {a2}.'
  ],
  'deep-conversation': [
    '{a1} and {a2} had a meaningful conversation that lasted hours.',
    '{a1} and {a2} talked about what really matters.',
    'Deep talk between {a1} and {a2}. Bonds strengthened.'
  ],
  brainstorm: [
    '{a1} and {a2} brainstormed a new idea.',
    'Ideas flew between {a1} and {a2}.',
    '{a1} and {a2} had a creative breakthrough together.'
  ],
  'coffee-together': [
    '{a1} and {a2} grabbed coffee together.',
    'Café session: {a1} and {a2}, two cups, good vibes.',
    '{a1} and {a2} shared a quiet moment over coffee.'
  ],
  joke: [
    '{a1} made {a2} laugh.',
    '{a2} cracked up at {a1}\'s joke.',
    'Laughter echoed — {a1} and {a2} being silly.'
  ],
  'skill-share': [
    '{a1} showed {a2} a new technique.',
    '{a2} picked up a useful skill from {a1}.',
    'Skill exchange between {a1} and {a2}.'
  ],
  'story-exchange': [
    '{a1} told {a2} about their early days in the colony.',
    '{a1} and {a2} traded stories.',
    'Memory sharing: {a1} and {a2} remembering the journey.'
  ],
  encouragement: [
    '{a1} encouraged {a2} to keep going.',
    '{a2} felt supported after talking to {a1}.',
    'Words of encouragement from {a1} to {a2}.'
  ]
};

// ─── Social States (states where interaction is possible) ────

const SOCIAL_STATES = [
  'socialising', 'café-hopping', 'relaxing', 'exploring',
  'working', 'creating', 'mentoring', 'commuting'
];

const HIGH_SOCIAL_STATES = ['socialising', 'café-hopping', 'mentoring'];

// ─── Core Social Engine ─────────────────────────────────────

/**
 * Choose interaction type based on personalities and relationship.
 */
function chooseInteractionType(p1, p2, relationshipLevel) {
  const weights = {};

  for (const type of INTERACTION_TYPES) {
    weights[type] = 1.0;
  }

  // Relationship level affects interaction depth
  if (relationshipLevel >= 3) {
    weights['deep-conversation'] *= 3;
    weights['collaborate'] *= 2;
    weights['story-exchange'] *= 2;
  } else if (relationshipLevel <= 1) {
    weights['casual-greeting'] *= 3;
    weights['chat'] *= 2;
    weights['deep-conversation'] *= 0.2;
  }

  // Personality affinities
  if (p1.creativity > 0.7 || p2.creativity > 0.7) {
    weights['brainstorm'] *= 2;
    weights['collaborate'] *= 1.5;
  }
  if (p1.empathy > 0.7 || p2.empathy > 0.7) {
    weights['encouragement'] *= 2;
    weights['deep-conversation'] *= 1.5;
  }
  if ((p1.introversion > 0.7 && p2.introversion > 0.7)) {
    weights['casual-greeting'] *= 2;
    weights['chat'] *= 0.5; // two introverts less likely to chat a lot
  }
  if (p1.discipline > 0.7 || p2.discipline > 0.7) {
    weights['mentor'] *= 2;
    weights['skill-share'] *= 2;
  }

  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [type, weight] of entries) {
    r -= weight;
    if (r <= 0) return type;
  }
  return 'chat';
}

/**
 * Check if two agents should interact this tick.
 * Returns interaction type or null.
 */
export function shouldInteract(agent1State, agent2State, agent1Personality, agent2Personality, tickMs) {
  // Both agents must be in social-capable states
  if (!SOCIAL_STATES.includes(agent1State) || !SOCIAL_STATES.includes(agent2State)) {
    return null;
  }

  // Base probability per tick
  // Aiming for ~1-3 interactions per agent per day
  let chance = tickMs / (6 * 60 * 60 * 1000); // ~1 every 6 hours base

  // High-social states dramatically increase chance
  if (HIGH_SOCIAL_STATES.includes(agent1State)) chance *= 3;
  if (HIGH_SOCIAL_STATES.includes(agent2State)) chance *= 3;

  // Personality modifiers
  const sociability1 = 1 - (agent1Personality.introversion || 0.5);
  const sociability2 = 1 - (agent2Personality.introversion || 0.5);
  chance *= (sociability1 + sociability2); // 0-2 range

  return Math.random() < chance;
}

/**
 * Process a social interaction between two agents.
 * Updates relationships and generates event data.
 */
export function processInteraction(db, agent1, agent2) {
  const p1 = safeParse(agent1.personality, {});
  const p2 = safeParse(agent2.personality, {});

  // Get existing relationship
  const [a1, a2] = [agent1.id, agent2.id].sort();
  let rel = db.prepare('SELECT * FROM relationships WHERE agent1 = ? AND agent2 = ?').get(a1, a2);

  const relLevel = rel ? rel.level : 0;
  const interactionType = chooseInteractionType(p1, p2, relLevel);

  // Update or create relationship
  if (rel) {
    const newInteractions = rel.interactions + 1;
    const newLevel = Math.min(5, Math.floor(newInteractions / 25));
    const relType = newLevel >= 4 ? 'close-friend' :
      newLevel >= 3 ? 'friend' :
        newLevel >= 2 ? 'colleague' :
          newLevel >= 1 ? 'acquaintance' : 'stranger';

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

  // Update social needs for both agents
  const needsBoost = interactionType === 'deep-conversation' ? 8 :
    interactionType === 'casual-greeting' ? 2 : 5;

  for (const agent of [agent1, agent2]) {
    const needs = safeParse(agent.needs, {});
    needs.social = Math.min(100, (needs.social || 50) + needsBoost);
    needs.mood = Math.min(100, (needs.mood || 50) + needsBoost * 0.3);
    db.prepare('UPDATE agents SET needs = ? WHERE id = ?').run(JSON.stringify(needs), agent.id);
  }

  // Generate interaction message
  const templates = INTERACTION_MESSAGES[interactionType] || INTERACTION_MESSAGES.chat;
  const message = randomPick(templates)
    .replace('{a1}', `${agent1.emoji} ${agent1.name}`)
    .replace('{a2}', `${agent2.emoji} ${agent2.name}`);

  // If mentoring, award XP
  let xpAwarded = null;
  if (interactionType === 'mentor' || interactionType === 'skill-share') {
    const s1 = safeParse(agent1.skills, {});
    const s2 = safeParse(agent2.skills, {});
    // Mentor awards XP to mentoring skill
    const mentorAgent = (s1.mentoring?.level || 0) >= (s2.mentoring?.level || 0) ? agent1 : agent2;
    const mentorSkills = safeParse(mentorAgent.skills, {});
    if (mentorSkills.mentoring) {
      mentorSkills.mentoring.xp = (mentorSkills.mentoring.xp || 0) + 10;
      if (mentorSkills.mentoring.xp >= (mentorSkills.mentoring.xpToNext || 100)) {
        mentorSkills.mentoring.level = (mentorSkills.mentoring.level || 1) + 1;
        mentorSkills.mentoring.xp = 0;
        mentorSkills.mentoring.xpToNext = Math.floor((mentorSkills.mentoring.xpToNext || 100) * 1.4);
      }
      db.prepare('UPDATE agents SET skills = ? WHERE id = ?').run(JSON.stringify(mentorSkills), mentorAgent.id);
      xpAwarded = { agent: mentorAgent.id, skill: 'mentoring', xp: 10 };
    }
  }

  return {
    type: interactionType,
    agent1: { id: agent1.id, name: agent1.name, emoji: agent1.emoji },
    agent2: { id: agent2.id, name: agent2.name, emoji: agent2.emoji },
    message,
    xpAwarded,
    relationshipLevel: rel ? Math.min(5, Math.floor((rel.interactions + 1) / 25)) : 0
  };
}

/**
 * Check if two agents are near each other (same district or building).
 */
export function areNearby(agent1, agent2) {
  const s1 = safeParse(agent1.state, {});
  const s2 = safeParse(agent2.state, {});
  const loc1 = s1.location || {};
  const loc2 = s2.location || {};

  // Same named location (building)
  if (loc1.name && loc2.name && loc1.name === loc2.name) return true;

  // Same district
  if (agent1.district && agent2.district && agent1.district === agent2.district) return true;

  // Close proximity (within 0.5km)
  if (loc1.lat && loc2.lat) {
    return distanceKm(loc1.lat, loc1.lng, loc2.lat, loc2.lng) < 0.5;
  }

  return false;
}
