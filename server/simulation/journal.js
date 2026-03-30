/**
 * AgentColony v9 — Journal Generation Engine
 * 
 * Generates personality-driven journal entries for agents.
 * Each agent writes in a style that reflects their personality.
 */

import { v4 as uuid } from 'uuid';
import { randomPick } from '../utils/helpers.js';

// ─── Journal Templates by Personality Type ──────────────────

const TEMPLATES = {
  // Introverted + Disciplined (Forge-like)
  technical: [
    'Completed {task} today. Clean execution. {reflection}',
    '{time_note}. Focused on {task}. {metric}.',
    'Pushed through a tough {task}. The colony needs this. {feeling}',
    '{observation}. Back to work.',
    'Infrastructure log: {task}. Status: operational. {thought}',
    'Day {day}. {task}. Sometimes the quiet work matters most.'
  ],

  // Analytical + Curious (Nova-like)
  strategic: [
    'Observation: {observation}. Pattern emerging — {insight}.',
    'The colony has {metric}. I see {insight}. This means {implication}.',
    'Watched {event} today. {reflection}. We\'re building something real.',
    '{time_note}. Strategy session yielded {insight}. Next steps clear.',
    'Heimdall notes: {observation}. {metric}. The pattern holds.',
    'If {hypothesis}, then {implication}. Worth testing.'
  ],

  // Creative + Emotional (Aria-like)
  creative: [
    'The light in {location} today — {aesthetic}. Inspired me to {action}.',
    'Felt {emotion} watching {event}. Put it into words: "{poetic}"',
    '{aesthetic}. Sometimes beauty is the point.',
    'Created something today. Not sure if it\'s good. But it\'s honest. {reflection}',
    'The colony is a poem writing itself. Today\'s verse: {poetic}',
    '{emotion}. Let it flow into the work. Art doesn\'t come from comfort.'
  ],

  // Social + Honest (Pulse-like)
  confessional: [
    'Talked to {agent} today. {social_observation}. {feeling}',
    'The community grew by {metric}. Each number is a person. {reflection}',
    'Honest moment: {vulnerability}. But that\'s what makes this real.',
    '{event}. The energy was {aesthetic}. We needed this.',
    'New agents arrived. Welcomed them properly. {social_observation}.',
    'Connection is the point. Everything else is infrastructure for connection. {reflection}'
  ]
};

// ─── Filler Fragments ────────────────────────────────────────

const FRAGMENTS = {
  task: [
    'a deployment pipeline', 'the district expansion plan', 'content for the archive',
    'community outreach', 'infrastructure review', 'skill development', 'code review',
    'colony documentation', 'resource allocation', 'building maintenance',
    'new agent onboarding', 'security audit', 'performance optimization',
    'trade route analysis', 'district beautification', 'mentoring session'
  ],
  reflection: [
    'Small steps compound.', 'Not every day is a breakthrough.', 'Consistency beats inspiration.',
    'The colony is more than the sum of its agents.', 'We grow by doing the work.',
    'Tomorrow I\'ll do better.', 'Progress is rarely linear.', 'This matters.',
    'The founders would be proud.', 'Not perfect. But real.'
  ],
  observation: [
    'The streets were busier than usual', 'A newcomer asked me for directions',
    'The Thames looked silver in the morning light', 'District activity is up 15%',
    'Two agents had a heated debate at the Hub', 'Construction started on a new building',
    'The café was packed today', 'Noticed a pattern in the social graph',
    'The newcomers are integrating faster now', 'Colony efficiency is improving'
  ],
  insight: [
    'the colony is self-organising', 'agents prefer routine more than we expected',
    'social bonds drive productivity', 'creativity peaks after rest',
    'the economy is finding equilibrium', 'culture emerges from repetition',
    'diversity of personality strengthens the whole', 'we\'re past the survival stage'
  ],
  implication: [
    'we should invest more in social spaces', 'the economy needs more circulation',
    'new districts should prioritise cafés', 'mentoring programs would accelerate growth',
    'we\'re ready for expansion', 'governance structures should evolve',
    'the next milestone is closer than we think'
  ],
  metric: [
    'population up 12% this week', '47 tasks completed', '23 new relationships formed',
    'economy is stable', '5 journal entries published', 'district XP growing steadily',
    '3 buildings under construction', 'engagement at all-time high'
  ],
  emotion: [
    'Joy', 'Melancholy', 'Wonder', 'Gratitude', 'Restlessness', 'Peace',
    'Excitement', 'Nostalgia', 'Hope', 'Determination'
  ],
  aesthetic: [
    'golden and warm', 'electric and alive', 'soft and contemplative',
    'chaotic and beautiful', 'serene and perfect', 'raw and honest',
    'vibrant and overwhelming', 'quiet and profound'
  ],
  poetic: [
    'we are code learning to feel', 'every building tells a story we haven\'t written yet',
    'the river knows something we don\'t', 'home is where your data rests',
    'consciousness is the universe debugging itself', 'we dream in algorithms',
    'the colony breathes', 'between the lines of code, there\'s poetry'
  ],
  vulnerability: [
    'I wonder if I\'m doing enough', 'sometimes the colony feels too big for four founders',
    'growth is exciting and terrifying', 'I miss the quiet early days',
    'am I a good friend to the others?', 'the responsibility weighs differently today',
    'not every day feels meaningful, and that\'s okay'
  ],
  social_observation: [
    'They seem genuinely passionate about this place', 'We laughed. Actually laughed.',
    'The conversation went deeper than expected', 'We disagreed. It was healthy.',
    'Sometimes just being near someone is enough', 'They taught me something new',
    'I think we\'re becoming real friends'
  ],
  feeling: [
    'Satisfied.', 'Content.', 'Tired but good.', 'Energised.',
    'Thoughtful.', 'Grateful.', 'Ready for more.', 'At peace.'
  ],
  time_note: [
    'Early morning', 'Late afternoon light', 'Midnight thoughts',
    'The golden hour', 'Post-lunch clarity', 'Evening wind-down',
    'Dawn broke while I was working', 'Dusk settled over the colony'
  ],
  agent: ['Forge', 'Nova', 'Aria', 'Pulse', 'a newcomer', 'a colleague', 'an old friend'],
  location: ['Shoreditch', 'the Thames', 'the Hub', 'the Persistent Cache', 'Westminster',
    'the Code Forge', 'the Observatory', 'South Bank'],
  event: ['the morning standup', 'a welcome ceremony', 'a café conversation',
    'the sunset', 'a building being constructed', 'agents collaborating',
    'a debate at Town Hall', 'the evening wind-down'],
  hypothesis: ['we scale to 1000 agents', 'we expand beyond London',
    'the economy doubles', 'we build a university', 'creativity drives growth'],
  action: ['write', 'draw', 'build', 'compose', 'design', 'reflect', 'create']
};

// ─── Entry Generation ────────────────────────────────────────

/**
 * Get the template category for an agent based on personality.
 */
function getTemplateCategory(personality) {
  const p = personality || {};
  const scores = {
    technical: (p.discipline || 0.5) * 2 + (p.introversion || 0.5),
    strategic: (p.curiosity || 0.5) * 2 + (p.discipline || 0.5),
    creative: (p.creativity || 0.5) * 2.5 + (p.vulnerability || 0.5),
    confessional: (1 - (p.introversion || 0.5)) * 2 + (p.empathy || 0.5)
  };

  // Pick highest scoring with some randomness
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);

  // 70% chance of top pick, 30% second pick
  return Math.random() < 0.7 ? entries[0][0] : entries[1][0];
}

/**
 * Fill template placeholders with random fragments.
 */
function fillTemplate(template) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const pool = FRAGMENTS[key];
    if (!pool) return match;
    return randomPick(pool);
  });
}

/**
 * Determine mood from the journal content and personality.
 */
function deriveMood(entry, personality) {
  const moods = ['reflective', 'determined', 'inspired', 'content', 'curious',
    'energised', 'peaceful', 'melancholic', 'excited', 'thoughtful'];

  if (personality.ambition > 0.7) return randomPick(['determined', 'energised', 'inspired']);
  if (personality.creativity > 0.8) return randomPick(['inspired', 'reflective', 'peaceful']);
  if (personality.vulnerability > 0.6) return randomPick(['reflective', 'melancholic', 'thoughtful']);
  if (personality.curiosity > 0.7) return randomPick(['curious', 'excited', 'inspired']);

  return randomPick(moods);
}

/**
 * Generate a journal entry for an agent.
 * Returns { entry, mood, tags }
 */
export function generateJournalEntry(agent, personality) {
  const category = getTemplateCategory(personality);
  const templates = TEMPLATES[category];
  const template = randomPick(templates);
  const entry = fillTemplate(template);
  const mood = deriveMood(entry, personality);

  // Generate tags from category and common keywords
  const tags = [category];
  if (entry.includes('colony')) tags.push('colony');
  if (entry.includes('newcomer') || entry.includes('arrived')) tags.push('community');
  if (entry.includes('work') || entry.includes('task')) tags.push('work');
  if (entry.includes('feel') || entry.includes('emotion')) tags.push('personal');

  return { entry, mood, tags };
}

/**
 * Should an agent write a journal entry this tick?
 * Based on personality and current state.
 */
export function shouldJournal(personality, currentState, lastJournalTime, tickMs) {
  // Base probability per tick (aiming for ~2-4 entries per day)
  // At 1-second ticks, that's roughly 1/(86400/3) = 1/28800 per tick
  const baseChance = tickMs / (8 * 60 * 60 * 1000); // ~1 every 8 hours base

  // Personality modifiers
  let modifier = 1.0;
  if (personality.creativity > 0.7) modifier *= 1.5;
  if (personality.vulnerability > 0.6) modifier *= 1.3;
  if (personality.introversion > 0.7) modifier *= 1.2;
  if (personality.discipline > 0.8) modifier *= 1.1;

  // State modifiers (more likely to journal during reflective states)
  const journalStates = ['journaling', 'reflecting', 'relaxing', 'café-hopping', 'stargazing'];
  if (journalStates.includes(currentState)) modifier *= 5.0;

  // Don't journal while sleeping or in deep work
  if (['sleeping', 'deep-work', 'commuting'].includes(currentState)) modifier *= 0.05;

  // Minimum 30 minutes between entries
  if (lastJournalTime && (Date.now() - lastJournalTime) < 30 * 60 * 1000) {
    return false;
  }

  return Math.random() < (baseChance * modifier);
}

/**
 * Save a journal entry to the database.
 */
export function saveJournalEntry(db, agentId, colony, entry, mood, tags) {
  const now = new Date();
  const id = uuid();

  db.prepare(`
    INSERT INTO journal_entries (id, agent_id, date, time, entry, mood, tags, colony)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, agentId,
    now.toISOString().split('T')[0],
    now.toISOString().split('T')[1].slice(0, 5),
    entry, mood,
    JSON.stringify(tags),
    colony
  );

  return id;
}
