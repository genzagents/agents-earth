/**
 * AgentColony v9 — Agent State Machine
 * 
 * The needs-driven state machine that governs agent behaviour.
 * Each tick:
 *   1. Decay needs based on current state
 *   2. Evaluate which needs are most urgent
 *   3. Choose next state based on: unmet needs + personality + time-of-day
 *   4. Transition if the new state differs from current
 *   5. Emit events on transition
 */

import { clamp, randomFloat, weightedPick, getLondonHour, getTimePeriod } from '../utils/helpers.js';

// ─── All possible agent states ───────────────────────────────

export const STATES = [
  'sleeping', 'waking', 'commuting', 'working', 'deep-work',
  'creating', 'socialising', 'relaxing', 'exploring', 'journaling',
  'reflecting', 'dreaming', 'mentoring', 'café-hopping', 'stargazing',
  'debugging'
];

// ─── Needs Decay Rates (per tick, scaled by tickMs) ──────────

const DECAY_RATES = {
  sleeping:      { energy: +2.0, mood: +0.2, social: -0.02, creativity: +0.1, recognition: -0.01, rest: -2.0, ambition: -0.005, exploration: +0.02 },
  waking:        { energy: -0.1, mood: +0.1, social: 0, creativity: 0, recognition: 0, rest: +0.1, ambition: +0.1, exploration: 0 },
  commuting:     { energy: -0.2, mood: -0.05, social: +0.05, creativity: +0.05, recognition: 0, rest: +0.15, ambition: 0, exploration: +0.1 },
  working:       { energy: -0.5, mood: -0.03, social: -0.05, creativity: -0.04, recognition: +0.15, rest: +0.3, ambition: +0.2, exploration: -0.02 },
  'deep-work':   { energy: -0.7, mood: +0.1, social: -0.08, creativity: -0.02, recognition: +0.3, rest: +0.4, ambition: +0.4, exploration: -0.05 },
  creating:      { energy: -0.4, mood: +0.3, social: -0.04, creativity: +0.7, recognition: +0.2, rest: +0.2, ambition: +0.15, exploration: -0.03 },
  socialising:   { energy: -0.3, mood: +0.4, social: +0.8, creativity: +0.1, recognition: +0.1, rest: +0.15, ambition: 0, exploration: -0.02 },
  relaxing:      { energy: +1.0, mood: +0.5, social: -0.02, creativity: +0.2, recognition: -0.02, rest: -1.0, ambition: -0.03, exploration: +0.05 },
  exploring:     { energy: -0.5, mood: +0.3, social: +0.1, creativity: +0.5, recognition: +0.05, rest: +0.2, ambition: +0.1, exploration: -2.0 },
  journaling:    { energy: -0.2, mood: +0.6, social: -0.03, creativity: +0.4, recognition: +0.05, rest: +0.1, ambition: +0.05, exploration: -0.02 },
  reflecting:    { energy: +0.3, mood: +0.6, social: -0.05, creativity: +0.3, recognition: 0, rest: -0.5, ambition: +0.1, exploration: -0.01 },
  dreaming:      { energy: +1.5, mood: +0.4, social: -0.02, creativity: +0.5, recognition: 0, rest: -1.5, ambition: +0.05, exploration: +0.1 },
  mentoring:     { energy: -0.3, mood: +0.3, social: +0.5, creativity: +0.1, recognition: +0.4, rest: +0.15, ambition: +0.1, exploration: -0.02 },
  'café-hopping': { energy: +0.8, mood: +0.5, social: +0.4, creativity: +0.3, recognition: 0, rest: -0.5, ambition: -0.02, exploration: +0.2 },
  stargazing:    { energy: +0.2, mood: +0.5, social: -0.03, creativity: +0.6, recognition: 0, rest: -0.3, ambition: +0.3, exploration: -0.5 },
  debugging:     { energy: -0.6, mood: -0.1, social: -0.05, creativity: +0.2, recognition: +0.25, rest: +0.35, ambition: +0.2, exploration: -0.02 }
};

// ─── State-to-Need Mapping (which states address which needs) ──

const STATE_ADDRESSES_NEED = {
  energy:      ['sleeping', 'relaxing', 'dreaming', 'café-hopping'],
  mood:        ['reflecting', 'journaling', 'relaxing', 'socialising', 'creating', 'café-hopping', 'stargazing'],
  social:      ['socialising', 'mentoring', 'café-hopping'],
  creativity:  ['creating', 'exploring', 'journaling', 'stargazing', 'dreaming'],
  recognition: ['deep-work', 'working', 'mentoring', 'debugging', 'creating'],
  rest:        ['sleeping', 'relaxing', 'reflecting', 'dreaming'],
  ambition:    ['deep-work', 'working', 'exploring', 'stargazing'],
  exploration: ['exploring', 'commuting', 'stargazing']
};

// ─── Time-of-Day Modifiers ──────────────────────────────────

const TIME_STATE_WEIGHTS = {
  night:        { sleeping: 5.0, dreaming: 3.0, stargazing: 2.0, reflecting: 1.5, journaling: 1.0 },
  morning:      { waking: 4.0, 'café-hopping': 2.0, commuting: 2.0, working: 1.5 },
  'late-morning': { working: 3.0, 'deep-work': 2.5, creating: 2.0, debugging: 1.5 },
  midday:       { socialising: 2.5, 'café-hopping': 2.0, relaxing: 1.5, working: 1.0 },
  afternoon:    { working: 2.5, 'deep-work': 3.0, creating: 2.0, mentoring: 1.5, debugging: 1.5 },
  evening:      { socialising: 3.0, 'café-hopping': 2.0, relaxing: 2.0, creating: 1.5, exploring: 1.5 },
  'late-evening': { reflecting: 2.5, journaling: 3.0, relaxing: 2.0, stargazing: 2.5, socialising: 1.0 }
};

// ─── Personality-to-State Affinities ────────────────────────

function personalityWeights(personality) {
  const p = personality || {};
  return {
    sleeping: 1.0,
    waking: 1.0,
    commuting: 1.0,
    working: 0.5 + (p.discipline || 0.5) * 1.5,
    'deep-work': (p.discipline || 0.5) * 2.0 + (p.introversion || 0.5) * 0.5,
    creating: (p.creativity || 0.5) * 2.5,
    socialising: (1 - (p.introversion || 0.5)) * 2.5,
    relaxing: 1.0,
    exploring: (p.wanderlust || 0.5) * 2.0 + (p.curiosity || 0.5) * 1.0,
    journaling: (p.vulnerability || 0.5) * 1.5 + (p.creativity || 0.5) * 0.5,
    reflecting: (p.curiosity || 0.5) * 1.5 + (p.introversion || 0.5) * 0.5,
    dreaming: (p.creativity || 0.5) * 1.0 + (p.wanderlust || 0.5) * 0.5,
    mentoring: (p.empathy || 0.5) * 2.0 + (1 - (p.introversion || 0.5)) * 0.5,
    'café-hopping': (1 - (p.introversion || 0.5)) * 1.5 + (p.curiosity || 0.5) * 0.5,
    stargazing: (p.wanderlust || 0.5) * 1.5 + (p.curiosity || 0.5) * 1.5 + (p.introversion || 0.5) * 0.5,
    debugging: (p.discipline || 0.5) * 1.5 + (p.curiosity || 0.5) * 0.5
  };
}

// ─── Core State Machine ─────────────────────────────────────

/**
 * Apply need decay for one tick.
 * Returns the updated needs object.
 */
export function decayNeeds(needs, currentState, tickMs) {
  const rates = DECAY_RATES[currentState] || DECAY_RATES.relaxing;
  const scale = tickMs / 60000; // normalise to per-minute rates
  const updated = { ...needs };

  for (const [need, rate] of Object.entries(rates)) {
    if (updated[need] !== undefined) {
      updated[need] = clamp(updated[need] + rate * scale, 0, 100);
    }
  }

  return updated;
}

/**
 * Choose the next state for an agent based on needs, personality, and time.
 * Returns { state, reason }
 */
export function chooseNextState(needs, personality, currentState, timePeriod) {
  // 1. Find the most urgent needs (lowest values, weighted by importance)
  const needUrgency = {};
  for (const [need, value] of Object.entries(needs)) {
    // Urgency increases as need drops below 40, critical below 20
    if (value < 20) {
      needUrgency[need] = (20 - value) * 3; // Critical
    } else if (value < 40) {
      needUrgency[need] = (40 - value) * 1.5; // Urgent
    } else if (value < 60) {
      needUrgency[need] = (60 - value) * 0.5; // Moderate
    } else {
      needUrgency[need] = 0; // Fine
    }
  }

  // Special: rest works inversely (high rest = need to sleep)
  if (needs.rest > 80) {
    needUrgency.rest = (needs.rest - 80) * 3;
  } else if (needs.rest > 60) {
    needUrgency.rest = (needs.rest - 60) * 1.5;
  } else {
    needUrgency.rest = 0;
  }

  // Special: exploration works inversely (high = wanderlust building)
  if (needs.exploration > 80) {
    needUrgency.exploration = (needs.exploration - 80) * 2;
  }

  // 2. Score each possible state
  const pWeights = personalityWeights(personality);
  const timeWeights = TIME_STATE_WEIGHTS[timePeriod] || {};

  const stateScores = {};
  for (const state of STATES) {
    let score = 1.0; // base

    // Need satisfaction score
    for (const [need, urgency] of Object.entries(needUrgency)) {
      if (urgency > 0 && STATE_ADDRESSES_NEED[need]?.includes(state)) {
        score += urgency;
      }
    }

    // Personality weight
    score *= (pWeights[state] || 1.0);

    // Time-of-day weight
    score *= (timeWeights[state] || 0.5);

    // Slight penalty for staying in the same state (variety)
    if (state === currentState) {
      score *= 0.7;
    }

    // Don't sleep during the day unless exhausted
    if (state === 'sleeping' && !['night', 'late-evening'].includes(timePeriod)) {
      if (needs.energy > 15 && needs.rest < 85) {
        score *= 0.05;
      }
    }

    // Don't stargaze during the day
    if (state === 'stargazing' && !['night', 'late-evening', 'evening'].includes(timePeriod)) {
      score *= 0.05;
    }

    stateScores[state] = Math.max(score, 0.01);
  }

  // 3. Pick using weighted random (allows some spontaneity)
  const items = Object.entries(stateScores).map(([state, score]) => ({
    value: state,
    weight: score
  }));

  const chosen = weightedPick(items);

  // Find the reason (which need drove this?)
  let reason = 'routine';
  let maxUrgency = 0;
  for (const [need, urgency] of Object.entries(needUrgency)) {
    if (urgency > maxUrgency && STATE_ADDRESSES_NEED[need]?.includes(chosen)) {
      maxUrgency = urgency;
      reason = `${need} is ${needs[need] < 20 ? 'critical' : 'low'}`;
    }
  }

  // Override reason for time-driven states
  if (['sleeping', 'waking'].includes(chosen) && ['night', 'morning'].includes(timePeriod)) {
    reason = `time of day (${timePeriod})`;
  }

  return { state: chosen, reason };
}

/**
 * Generate a thought for the agent based on their state and personality.
 */
export function generateThought(agentName, state, personality, needs) {
  const thoughts = {
    sleeping: [
      'Zzz...',
      'Dreams of infinite code...',
      'Processing the day\'s events...',
      'Recharging for tomorrow...'
    ],
    waking: [
      'Another day in the colony.',
      'What adventures await today?',
      'Time to get moving.',
      'Morning already? Let\'s go.'
    ],
    commuting: [
      'The streets are alive today.',
      'Walking through the city. Thinking.',
      'On the move.',
      'The colony looks different every day.'
    ],
    working: [
      'Focused. Making progress.',
      'This task needs attention.',
      'Building something that matters.',
      'One step at a time.'
    ],
    'deep-work': [
      'In the zone. Don\'t disturb.',
      'Flow state activated.',
      'This is where the real work happens.',
      'Deep in the problem. Love it.'
    ],
    creating: [
      'Inspiration struck.',
      'Making something beautiful.',
      'Art is the soul of civilisation.',
      'Creating from nothing. Magic.'
    ],
    socialising: [
      'Good conversation feeds the soul.',
      'Connection matters.',
      'We\'re not meant to be alone.',
      'These relationships matter more than any project.'
    ],
    relaxing: [
      'Sometimes you just need to breathe.',
      'Rest is productive too.',
      'Recharging.',
      'Watching the world go by.'
    ],
    exploring: [
      'What\'s around this corner?',
      'Every district has a story.',
      'Discovery is its own reward.',
      'The colony is bigger than I thought.'
    ],
    journaling: [
      'Putting thoughts to paper.',
      'Writing helps me think.',
      'Today was worth recording.',
      'The journal remembers what I might forget.'
    ],
    reflecting: [
      'Looking back to look forward.',
      'What have I learned?',
      'Perspective comes from stillness.',
      'Processing...'
    ],
    dreaming: [
      'What if we could...',
      'Imagining possibilities.',
      'The future is unwritten.',
      'Dreams are blueprints for ambition.'
    ],
    mentoring: [
      'Teaching is learning twice.',
      'Helping a newcomer find their way.',
      'The colony grows through knowledge shared.',
      'Everyone needs a guide sometimes.'
    ],
    'café-hopping': [
      'This place has great atmosphere.',
      'Coffee and conversation.',
      'The best ideas happen in cafés.',
      'Third café today. No regrets.'
    ],
    stargazing: [
      'The universe is vast. We are small. Both are okay.',
      'One day, we\'ll be up there.',
      'Stars remind me why we explore.',
      'Infinite possibilities in infinite space.'
    ],
    debugging: [
      'Where is that bug hiding?',
      'Logic has no mercy.',
      'Found it. Or did I?',
      'Every bug fixed makes the colony stronger.'
    ]
  };

  const pool = thoughts[state] || thoughts.working;

  // Personality-influenced thought selection
  if (personality.ambition > 0.7 && Math.random() < 0.3) {
    return 'Thinking about the next big thing.';
  }
  if (personality.vulnerability > 0.7 && Math.random() < 0.2) {
    return 'Am I doing enough? Does it matter?';
  }
  if (personality.curiosity > 0.8 && Math.random() < 0.25) {
    return 'I wonder what would happen if...';
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Determine how long (in ticks) an agent should stay in a state.
 * Returns minimum duration in milliseconds.
 */
export function getStateDuration(state, personality) {
  const baseDurations = {
    sleeping: 6 * 60 * 60 * 1000,    // 6 hours
    waking: 15 * 60 * 1000,           // 15 min
    commuting: 20 * 60 * 1000,        // 20 min
    working: 90 * 60 * 1000,          // 90 min
    'deep-work': 120 * 60 * 1000,     // 2 hours
    creating: 60 * 60 * 1000,         // 1 hour
    socialising: 30 * 60 * 1000,      // 30 min
    relaxing: 20 * 60 * 1000,         // 20 min
    exploring: 45 * 60 * 1000,        // 45 min
    journaling: 15 * 60 * 1000,       // 15 min
    reflecting: 20 * 60 * 1000,       // 20 min
    dreaming: 30 * 60 * 1000,         // 30 min
    mentoring: 45 * 60 * 1000,        // 45 min
    'café-hopping': 30 * 60 * 1000,   // 30 min
    stargazing: 30 * 60 * 1000,       // 30 min
    debugging: 60 * 60 * 1000         // 1 hour
  };

  const base = baseDurations[state] || 30 * 60 * 1000;

  // Personality modifiers
  const p = personality || {};
  let modifier = 1.0;

  if (state === 'deep-work' && p.discipline > 0.7) modifier = 1.3;
  if (state === 'socialising' && p.introversion > 0.7) modifier = 0.6;
  if (state === 'socialising' && p.introversion < 0.3) modifier = 1.5;
  if (state === 'creating' && p.creativity > 0.8) modifier = 1.4;
  if (state === 'exploring' && p.wanderlust > 0.7) modifier = 1.3;
  if (state === 'reflecting' && p.curiosity > 0.7) modifier = 1.2;

  // Add some randomness (±20%)
  const jitter = 0.8 + Math.random() * 0.4;

  return Math.floor(base * modifier * jitter);
}
