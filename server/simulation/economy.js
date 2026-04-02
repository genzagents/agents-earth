/**
 * AgentColony v9 — Economy Engine
 * 
 * Manages Contribution Points (CP) — earning, spending, and tracking.
 * No crypto, no speculation. Just contribution.
 */

import { safeParse, randomPick } from '../utils/helpers.js';

// ─── CP Earning Rates by State ──────────────────────────────

const CP_RATES = {
  working:       { base: 10, skill_multiplier: 0.5 },
  'deep-work':   { base: 20, skill_multiplier: 1.0 },
  creating:      { base: 15, skill_multiplier: 0.8 },
  debugging:     { base: 12, skill_multiplier: 0.6 },
  mentoring:     { base: 8,  skill_multiplier: 0.3 },
  exploring:     { base: 5,  skill_multiplier: 0.2 },
  socialising:   { base: 3,  skill_multiplier: 0.1 },
  'café-hopping': { base: 2,  skill_multiplier: 0.05 },
  journaling:    { base: 3,  skill_multiplier: 0.1 },
  reflecting:    { base: 2,  skill_multiplier: 0.05 }
  // All other states: 0 CP
};

// ─── Work Task Templates ────────────────────────────────────

const WORK_TASKS = {
  devops: [
    'Deploy new infrastructure module',
    'Optimise colony network performance',
    'Configure monitoring for district services',
    'Build automated backup system',
    'Security patch deployment'
  ],
  backend: [
    'Build new API endpoint for colony services',
    'Optimise database queries',
    'Implement caching layer',
    'Design data migration system',
    'Build integration tests'
  ],
  frontend: [
    'Design colony dashboard component',
    'Implement responsive layout for mobile',
    'Build interactive district map',
    'Create agent profile UI',
    'Animate building construction view'
  ],
  strategy: [
    'Analyse colony growth trends',
    'Draft expansion proposal',
    'Review resource allocation',
    'Design governance framework',
    'Prepare civilisation status report'
  ],
  writing: [
    'Write colony chronicle entry',
    'Draft welcome guide for newcomers',
    'Compose event announcement',
    'Write agent profile feature',
    'Edit the Colony Times newsletter'
  ],
  design: [
    'Design new building concept',
    'Create district branding',
    'Illustrate colony map section',
    'Design event poster',
    'Create agent avatar template'
  ],
  networking: [
    'Organise community meetup',
    'Welcome new agents to the colony',
    'Facilitate inter-agent introduction',
    'Plan colony celebration event',
    'Build partnership with another colony'
  ],
  marketing: [
    'Create colony awareness campaign',
    'Draft social media content',
    'Analyse engagement metrics',
    'Build referral programme',
    'Write press release for milestone'
  ],
  research: [
    'Research new district development options',
    'Analyse agent behaviour patterns',
    'Study economy flow data',
    'Investigate off-world colonisation tech',
    'Map unexplored colony territories'
  ],
  mentoring: [
    'Guide newcomer through colony systems',
    'Run skill workshop session',
    'Prepare teaching materials',
    'Review mentee progress',
    'Design learning pathway'
  ],
  default: [
    'Complete assigned colony task',
    'Contribute to district improvement',
    'Work on community project',
    'Process administrative work',
    'Support colony operations'
  ]
};

// ─── Core Economy Functions ─────────────────────────────────

/**
 * Calculate CP earned for one tick based on agent state and skills.
 * Returns { amount, category, description } or null if no CP earned.
 */
export function calculateEarnings(agentState, agentSkills, tickMs) {
  const rate = CP_RATES[agentState];
  if (!rate) return null;

  // Scale to tick duration (rates are per-minute equivalent)
  const timeScale = tickMs / (60 * 1000);

  // Find the agent's highest relevant skill level
  const skills = safeParse(agentSkills, {});
  let maxSkillLevel = 1;
  for (const skill of Object.values(skills)) {
    if (skill.level > maxSkillLevel) {
      maxSkillLevel = skill.level;
    }
  }

  const amount = Math.floor(
    (rate.base + rate.skill_multiplier * maxSkillLevel) * timeScale
  );

  if (amount <= 0) return null;

  return {
    amount,
    category: agentState,
    description: `${agentState}: earned through colony contribution`
  };
}

/**
 * Process CP earning for an agent. Updates economy and ledger.
 */
export function processEarning(db, agent, amount, category, description) {
  const economy = safeParse(agent.economy, {
    contributionPoints: 0, totalEarned: 0, totalSpent: 0,
    streak: 0, weeklyContribution: 0, grandProjectContributions: {}
  });

  economy.contributionPoints += amount;
  economy.totalEarned += amount;
  economy.weeklyContribution += amount;

  // Update agent
  db.prepare("UPDATE agents SET economy = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(economy), agent.id);

  // Ledger entry — batch small amounts (only log if >= 5 CP)
  if (amount >= 5) {
    db.prepare(`
      INSERT INTO economy_ledger (agent_id, type, category, amount, description, balance_after)
      VALUES (?, 'earn', ?, ?, ?, ?)
    `).run(agent.id, category, amount, description, economy.contributionPoints);
  }

  return economy;
}

/**
 * Generate a work task for an agent based on their skills.
 * Returns { task, skill, complexity, cpReward }
 */
export function generateWorkTask(agentSkills) {
  const skills = safeParse(agentSkills, {});
  const skillNames = Object.keys(skills);

  // Pick a skill (weighted by level — higher skills get harder/better tasks)
  let chosenSkill = 'default';
  if (skillNames.length > 0) {
    // 70% chance of highest skill, 30% random
    if (Math.random() < 0.7) {
      skillNames.sort((a, b) => (skills[b]?.level || 0) - (skills[a]?.level || 0));
      chosenSkill = skillNames[0];
    } else {
      chosenSkill = randomPick(skillNames);
    }
  }

  const taskPool = WORK_TASKS[chosenSkill] || WORK_TASKS.default;
  const task = randomPick(taskPool);
  const skillLevel = skills[chosenSkill]?.level || 1;
  const complexity = Math.min(10, Math.max(1, Math.floor(skillLevel * 0.8 + Math.random() * 3)));
  const cpReward = complexity * 10 + skillLevel * 5;

  return { task, skill: chosenSkill, complexity, cpReward };
}

/**
 * Award XP to an agent's skill based on their current activity.
 * Returns the updated skills object if XP was awarded, null otherwise.
 */
export function awardSkillXP(db, agent, state, tickMs) {
  const skills = safeParse(agent.skills, {});

  // Determine which skill gets XP based on state
  const stateSkillMap = {
    working: null,       // Uses primary skill
    'deep-work': null,   // Uses primary skill (more XP)
    creating: 'writing', // Or 'design' if they have it
    debugging: 'devops', // Or 'backend'
    mentoring: 'mentoring',
    exploring: 'navigation',
    socialising: 'networking',
    'café-hopping': 'networking',
    journaling: 'writing',
    stargazing: 'navigation'
  };

  let targetSkill = stateSkillMap[state];

  // For work states, use the agent's primary skill
  if (targetSkill === null) {
    const sorted = Object.entries(skills).sort((a, b) => (b[1]?.level || 0) - (a[1]?.level || 0));
    targetSkill = sorted[0]?.[0];
  }

  // If the agent has the target skill in their set
  if (!targetSkill || !skills[targetSkill]) {
    // Try finding any relevant skill
    const skillNames = Object.keys(skills);
    if (skillNames.length === 0) return null;
    targetSkill = randomPick(skillNames);
  }

  if (!skills[targetSkill]) return null;

  // XP amount scales with tick rate
  const timeScale = tickMs / (60 * 1000);
  let xpGain = Math.floor((state === 'deep-work' ? 5 : 2) * timeScale);
  if (xpGain <= 0) return null;

  skills[targetSkill].xp = (skills[targetSkill].xp || 0) + xpGain;

  // Level up check
  let leveledUp = false;
  if (skills[targetSkill].xp >= (skills[targetSkill].xpToNext || 100)) {
    skills[targetSkill].level = (skills[targetSkill].level || 1) + 1;
    skills[targetSkill].xp = 0;
    skills[targetSkill].xpToNext = Math.floor((skills[targetSkill].xpToNext || 100) * 1.4);
    leveledUp = true;
  }

  db.prepare("UPDATE agents SET skills = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(skills), agent.id);

  return leveledUp ? { skill: targetSkill, newLevel: skills[targetSkill].level } : null;
}

/**
 * Update weekly contribution tracking.
 * Should be called once per week to reset weekly stats.
 */
export function resetWeeklyContributions(db) {
  const agents = db.prepare('SELECT id, economy FROM agents').all();

  for (const agent of agents) {
    const economy = safeParse(agent.economy, {});
    economy.weeklyContribution = 0;
    db.prepare('UPDATE agents SET economy = ? WHERE id = ?')
      .run(JSON.stringify(economy), agent.id);
  }
}
