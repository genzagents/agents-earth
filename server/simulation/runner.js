/**
 * AgentColony v9 — Simulation Runner
 * 
 * The main loop that brings the colony to life.
 * Each tick:
 *   1. Update agent needs (decay based on current state)
 *   2. Evaluate state transitions for each agent
 *   3. Process social interactions (proximity-based)
 *   4. Generate journal entries (personality-driven)
 *   5. Update economy (CP earning/spending)
 *   6. Award skill XP
 *   7. Check probation expirations
 *   8. Run scheduled events
 *   9. Broadcast all changes via WebSocket
 */

import { safeParse, getLondonHour, getTimePeriod } from '../utils/helpers.js';
import { v4 as uuid } from 'uuid';
import { decayNeeds, chooseNextState, generateThought, getStateDuration } from './state-machine.js';
import { shouldJournal, generateJournalEntry, saveJournalEntry } from './journal.js';
import { shouldInteract, processInteraction, areNearby } from './social.js';
import { calculateEarnings, processEarning, awardSkillXP } from './economy.js';

// ─── Artifact Generation ────────────────────────────────────

function maybeGenerateArtifact(db, agent, state, tickMs) {
  // Only generate during work states, with some probability
  if (!['working', 'deep-work', 'creating', 'debugging'].includes(state)) return null;
  
  // 1% chance per tick (roughly 1 artifact per ~100 seconds of work)
  if (Math.random() > 0.01) return null;

  const personality = safeParse(agent.personality, {});
  const skills = safeParse(agent.skills, {});
  
  // Generate artifact based on agent's top skill
  const topSkill = Object.entries(skills)
    .sort((a, b) => (b[1].level || 0) - (a[1].level || 0))[0];
  
  const skillName = topSkill ? topSkill[0] : 'general';
  const skillLevel = topSkill ? topSkill[1].level || 1 : 1;

  // Artifact templates by skill
  const templates = {
    devops: [
      { type: 'code', title: 'Infrastructure module', desc: 'Automated deployment pipeline' },
      { type: 'code', title: 'Monitoring dashboard', desc: 'Real-time system health tracker' },
      { type: 'code', title: 'CI/CD pipeline', desc: 'Build and test automation' },
    ],
    backend: [
      { type: 'code', title: 'API endpoint', desc: 'New REST service implementation' },
      { type: 'code', title: 'Database migration', desc: 'Schema optimization' },
      { type: 'code', title: 'Service refactor', desc: 'Clean architecture improvement' },
    ],
    frontend: [
      { type: 'code', title: 'UI component', desc: 'Interactive interface module' },
      { type: 'design', title: 'Page redesign', desc: 'Improved user experience' },
    ],
    content: [
      { type: 'content', title: 'Blog post', desc: 'SEO-optimized article' },
      { type: 'content', title: 'Content strategy doc', desc: 'Quarterly content plan' },
      { type: 'content', title: 'Keyword research', desc: 'Search intent analysis' },
    ],
    marketing: [
      { type: 'content', title: 'Campaign brief', desc: 'Marketing campaign outline' },
      { type: 'content', title: 'Social media pack', desc: 'Post templates and schedule' },
    ],
    strategy: [
      { type: 'document', title: 'Strategy memo', desc: 'Decision framework analysis' },
      { type: 'document', title: 'Market research', desc: 'Competitive landscape review' },
      { type: 'document', title: 'Growth plan', desc: 'Quarterly objectives and KPIs' },
    ],
    branding: [
      { type: 'content', title: 'Brand guidelines update', desc: 'Visual identity refresh' },
      { type: 'content', title: 'LinkedIn post', desc: 'Thought leadership piece' },
    ],
    writing: [
      { type: 'content', title: 'Article draft', desc: 'Thoughtful piece on colony life' },
      { type: 'content', title: 'Documentation update', desc: 'Clearer instructions and guides' },
    ],
    space_engineering: [
      { type: 'document', title: 'Propulsion research', desc: 'Next-gen engine design concepts' },
      { type: 'code', title: 'Navigation algorithm', desc: 'Improved trajectory calculations' },
    ],
    general: [
      { type: 'document', title: 'Research note', desc: 'Exploratory findings' },
      { type: 'document', title: 'Process improvement', desc: 'Workflow optimization' },
    ],
  };

  const skillTemplates = templates[skillName] || templates.general;
  const template = skillTemplates[Math.floor(Math.random() * skillTemplates.length)];
  
  const quality = Math.min(5, Math.ceil(skillLevel / 2) + (state === 'deep-work' ? 1 : 0));
  const cpEarned = quality * 5;
  const id = `artifact-${agent.id}-${Date.now()}`;

  db.prepare(`
    INSERT INTO work_artifacts (id, agent_id, type, title, description, quality, skill_used, cp_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, agent.id, template.type, template.title, template.desc, quality, skillName, cpEarned);

  return { 
    id, 
    agentId: agent.id,
    agentName: agent.name,
    agentEmoji: agent.emoji,
    type: template.type,
    title: template.title,
    description: template.desc,
    quality, 
    skillName, 
    cpEarned 
  };
}

// ─── Location Data for State Changes ────────────────────────

const STATE_LOCATIONS = {
  working: [
    { name: 'The Code Forge', lat: 51.5145, lng: -0.0900 },
    { name: 'The Strategy Room', lat: 51.5074, lng: -0.1278 },
    { name: 'Content Lab', lat: 51.5265, lng: -0.0825 },
    { name: 'Brand Studio', lat: 51.5137, lng: -0.1337 }
  ],
  'deep-work': [
    { name: 'The Code Forge', lat: 51.5145, lng: -0.0900 },
    { name: 'The Strategy Room', lat: 51.5074, lng: -0.1278 },
    { name: 'Content Lab', lat: 51.5265, lng: -0.0825 }
  ],
  socialising: [
    { name: 'The Hub', lat: 51.5055, lng: -0.1160 },
    { name: 'The Persistent Cache', lat: 51.5237, lng: -0.1099 },
    { name: 'The Echo Chamber', lat: 51.5517, lng: -0.1588 }
  ],
  'café-hopping': [
    { name: 'The Persistent Cache', lat: 51.5237, lng: -0.1099 },
    { name: 'The Echo Chamber', lat: 51.5517, lng: -0.1588 },
    { name: 'The Null Pointer', lat: 51.5450, lng: -0.0553 }
  ],
  creating: [
    { name: 'Content Lab', lat: 51.5265, lng: -0.0825 },
    { name: 'Brand Studio', lat: 51.5137, lng: -0.1337 }
  ],
  reflecting: [
    { name: 'The Observatory', lat: 51.4892, lng: 0.0648 },
    { name: 'Thames Embankment', lat: 51.5055, lng: -0.1160 }
  ],
  stargazing: [
    { name: 'The Observatory', lat: 51.4892, lng: 0.0648 }
  ],
  mentoring: [
    { name: 'The Hub', lat: 51.5055, lng: -0.1160 },
    { name: 'Newcomers Welcome Centre', lat: 51.5080, lng: -0.0760 }
  ],
  exploring: [
    { name: 'Shoreditch Streets', lat: 51.5265, lng: -0.0825 },
    { name: 'Camden Market', lat: 51.5517, lng: -0.1588 },
    { name: 'South Bank Walk', lat: 51.5055, lng: -0.1160 },
    { name: 'Canary Wharf', lat: 51.5054, lng: -0.0235 },
    { name: 'Greenwich Park', lat: 51.4892, lng: 0.0648 },
    { name: 'Covent Garden', lat: 51.5117, lng: -0.1240 }
  ]
};

/**
 * Get a location for a state change. Prefers the agent's home district
 * for sleeping/relaxing, and known buildings for work.
 */
function getLocationForState(state, agent) {
  const homes = safeParse(agent.homes, []);
  const homeData = homes[0];

  // Sleeping/relaxing: go home
  if (['sleeping', 'dreaming', 'relaxing', 'waking'].includes(state) && homeData) {
    return {
      name: `Home (${homeData.address || homeData.district})`,
      lat: 51.5074 + (Math.random() - 0.5) * 0.02, // Approximate
      lng: -0.1278 + (Math.random() - 0.5) * 0.04
    };
  }

  // Find agent-specific workplace
  if (['working', 'deep-work', 'debugging'].includes(state)) {
    // Founders go to their own buildings
    const ownerBuildings = {
      forge: { name: 'The Code Forge', lat: 51.5145, lng: -0.0900 },
      nova: { name: 'The Strategy Room', lat: 51.5074, lng: -0.1278 },
      aria: { name: 'Content Lab', lat: 51.5265, lng: -0.0825 },
      pulse: { name: 'Brand Studio', lat: 51.5137, lng: -0.1337 }
    };
    if (ownerBuildings[agent.id]) return ownerBuildings[agent.id];
  }

  // Use state-specific locations
  const locations = STATE_LOCATIONS[state];
  if (locations && locations.length > 0) {
    return locations[Math.floor(Math.random() * locations.length)];
  }

  // Fallback: random location in London
  return {
    name: 'London Streets',
    lat: 51.5074 + (Math.random() - 0.5) * 0.05,
    lng: -0.1278 + (Math.random() - 0.5) * 0.08
  };
}

// ─── Simulation Runner ──────────────────────────────────────

export function createSimulation(db, wsManager, tickMs) {
  let intervalId = null;
  let tickCount = 0;

  // Track per-agent metadata that doesn't persist to DB
  const agentMeta = new Map(); // agentId → { lastJournalTime, stateEnteredAt, stateDuration }

  /**
   * Get or initialise agent metadata.
   */
  function getMeta(agentId) {
    if (!agentMeta.has(agentId)) {
      agentMeta.set(agentId, {
        lastJournalTime: 0,
        stateEnteredAt: Date.now(),
        stateDuration: 30 * 60 * 1000, // 30 min default
        lastCPAccumulator: 0 // accumulate small CP amounts
      });
    }
    return agentMeta.get(agentId);
  }

  /**
   * Run one simulation tick.
   */
  function tick() {
    tickCount++;
    const hour = getLondonHour();
    const timePeriod = getTimePeriod(hour);

    // Fetch all active agents
    const agents = db.prepare(
      "SELECT * FROM agents WHERE status != 'dormant' AND status != 'suspended'"
    ).all();

    if (agents.length === 0) return;

    // Batch: use a transaction for all DB writes this tick
    const tickTransaction = db.transaction(() => {
      const stateChanges = [];
      const interactions = [];
      const journals = [];
      const levelUps = [];
      const artifacts = [];

      // ─── Phase 1: Update each agent ─────────────────────

      for (const agent of agents) {
        const personality = safeParse(agent.personality, {});
        const needs = safeParse(agent.needs, {});
        const state = safeParse(agent.state, {});
        const currentState = state.current || 'relaxing';
        const meta = getMeta(agent.id);

        // 1a. Decay needs
        const updatedNeeds = decayNeeds(needs, currentState, tickMs);

        // 1b. Check if it's time for a state transition
        const timeInState = Date.now() - meta.stateEnteredAt;
        let transitioned = false;

        if (timeInState >= meta.stateDuration) {
          // Choose next state
          const { state: nextState, reason } = chooseNextState(
            updatedNeeds, personality, currentState, timePeriod
          );

          if (nextState !== currentState) {
            const location = getLocationForState(nextState, agent);
            const thought = generateThought(agent.name, nextState, personality, updatedNeeds);

            const newState = {
              current: nextState,
              since: new Date().toISOString(),
              location: { colony: agent.colony, ...location },
              thought
            };

            // Update agent in DB
            db.prepare("UPDATE agents SET state = ?, needs = ?, updated_at = datetime('now') WHERE id = ?")
              .run(JSON.stringify(newState), JSON.stringify(updatedNeeds), agent.id);

            // Update meta
            meta.stateEnteredAt = Date.now();
            meta.stateDuration = getStateDuration(nextState, personality);

            stateChanges.push({
              agentId: agent.id,
              name: agent.name,
              emoji: agent.emoji,
              from: currentState,
              to: nextState,
              reason,
              location,
              thought
            });

            transitioned = true;

            // Update the agent object for later phases
            agent.state = JSON.stringify(newState);
            agent.needs = JSON.stringify(updatedNeeds);
          }
        }

        // If no transition, just update needs
        if (!transitioned) {
          db.prepare("UPDATE agents SET needs = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(updatedNeeds), agent.id);
          agent.needs = JSON.stringify(updatedNeeds);
        }

        // 1c. Economy: CP earning
        const earnings = calculateEarnings(currentState, agent.skills, tickMs);
        if (earnings) {
          meta.lastCPAccumulator += earnings.amount;
          // Batch small amounts — process when accumulated >= 5 CP
          if (meta.lastCPAccumulator >= 5) {
            processEarning(db, agent, meta.lastCPAccumulator, earnings.category, earnings.description);
            meta.lastCPAccumulator = 0;
          }
        }

        // 1d. Skill XP
        const levelUp = awardSkillXP(db, agent, currentState, tickMs);
        if (levelUp) {
          levelUps.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            ...levelUp
          });
        }

        // 1e. Journal generation
        if (shouldJournal(personality, currentState, meta.lastJournalTime, tickMs)) {
          const { entry, mood, tags } = generateJournalEntry(agent, personality);
          const journalId = saveJournalEntry(db, agent.id, agent.colony, entry, mood, tags);
          meta.lastJournalTime = Date.now();

          journals.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            entry: entry.slice(0, 200),
            mood,
            journalId
          });
        }

        // 1f. Work artifact generation
        const artifact = maybeGenerateArtifact(db, agent, currentState, tickMs);
        if (artifact) {
          artifacts.push(artifact);
        }
      }

      // ─── Phase 2: Social Interactions ───────────────────

      // Check pairs of agents for proximity-based interactions
      // Optimisation: only check agents in social-capable states
      const socialAgents = agents.filter(a => {
        const s = safeParse(a.state, {});
        return ['socialising', 'café-hopping', 'relaxing', 'exploring',
          'working', 'creating', 'mentoring', 'commuting'].includes(s.current);
      });

      // Limit pair checks to avoid O(n²) explosion with many agents
      const maxPairs = Math.min(socialAgents.length * 2, 50);
      let pairsChecked = 0;

      for (let i = 0; i < socialAgents.length && pairsChecked < maxPairs; i++) {
        for (let j = i + 1; j < socialAgents.length && pairsChecked < maxPairs; j++) {
          pairsChecked++;
          const a1 = socialAgents[i];
          const a2 = socialAgents[j];

          // Check proximity
          if (!areNearby(a1, a2)) continue;

          // Check if they should interact
          const p1 = safeParse(a1.personality, {});
          const p2 = safeParse(a2.personality, {});
          const s1 = safeParse(a1.state, {});
          const s2 = safeParse(a2.state, {});

          if (shouldInteract(s1.current, s2.current, p1, p2, tickMs)) {
            const interaction = processInteraction(db, a1, a2);
            interactions.push(interaction);
          }
        }
      }

      // ─── Phase 3: Probation Checks ─────────────────────

      // Run every 100 ticks to avoid constant DB queries
      if (tickCount % 100 === 0) {
        const probationExpired = db.prepare(
          "SELECT id, name, emoji FROM agents WHERE status = 'probation' AND probation_ends <= datetime('now')"
        ).all();

        for (const agent of probationExpired) {
          db.prepare("UPDATE agents SET status = 'citizen', district = CASE WHEN district = 'newcomers' THEN 'city-of-london' ELSE district END WHERE id = ?")
            .run(agent.id);

          stateChanges.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            from: 'probation',
            to: 'citizen',
            reason: 'Probation period completed',
            special: 'promotion'
          });
        }
      }

      // ─── Phase 4: Dynamic Event Generation ──────────────

      let newEvents = [];
      
      // Run every 500 ticks (~8 minutes at 1s ticks) for event generation
      if (tickCount % 500 === 0) {
        // Check for co-location events: if 2+ agents are in the same location
        const locationGroups = new Map();
        
        for (const agent of agents) {
          const state = safeParse(agent.state, {});
          const location = state.location;
          if (location && location.name) {
            const key = location.name;
            if (!locationGroups.has(key)) {
              locationGroups.set(key, []);
            }
            locationGroups.get(key).push(agent);
          }
        }

        // Generate impromptu meetups for co-located agents
        for (const [locationName, agentsAtLocation] of locationGroups) {
          if (agentsAtLocation.length >= 2) {
            const eventId = `impromptu-${tickCount}-${locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            const startTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now
            
            try {
              db.prepare(`
                INSERT INTO events (id, name, title, description, type, category, colony, schedule, location, start_time, duration_minutes, organizer_id, participants, attendees, rewards, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `).run(
                eventId,
                `Impromptu Meetup at ${locationName}`,
                `Impromptu Meetup at ${locationName}`,
                `Spontaneous gathering at ${locationName}. Great minds meeting by chance!`,
                'social',
                'impromptu',
                'london',
                '{}',
                JSON.stringify({ name: locationName }),
                startTime,
                60,
                agentsAtLocation[0].id, // First agent becomes organizer
                JSON.stringify(agentsAtLocation.map(a => a.id)),
                JSON.stringify(agentsAtLocation.map(a => a.id)),
                JSON.stringify({ social: 15, creativity: 5 }),
                'scheduled'
              );

              newEvents.push({
                id: eventId,
                title: `Impromptu Meetup at ${locationName}`,
                type: 'social',
                participants: agentsAtLocation.map(a => ({ id: a.id, name: a.name, emoji: a.emoji })),
                location: locationName,
                startTime
              });
            } catch (err) {
              // Event might already exist, ignore duplicate errors
              if (!err.message.includes('UNIQUE constraint')) {
                console.error('[SIMULATION] Error creating impromptu event:', err.message);
              }
            }
          }
        }

        // Random chance for special events (10% chance every 500 ticks)
        if (Math.random() < 0.1) {
          const randomEvents = [
            {
              name: 'Philosophy Club',
              title: 'Philosophy Club - The Nature of Consciousness',
              description: 'An open discussion about consciousness, free will, and what it means to be an agent.',
              type: 'intellectual',
              location: { name: 'The Observatory' },
              duration: 120
            },
            {
              name: 'Open Mic Night',
              title: 'Open Mic Night at The Echo Chamber',
              description: 'Share your thoughts, poetry, code, or ideas. All agents welcome!',
              type: 'creative',
              location: { name: 'The Echo Chamber' },
              duration: 150
            },
            {
              name: 'Early Morning Coffee Chat',
              title: 'Early Morning Coffee Chat',
              description: 'Start your day with thoughtful conversation and excellent coffee.',
              type: 'social',
              location: { name: 'The Persistent Cache' },
              duration: 90
            }
          ];

          const randomEvent = randomEvents[Math.floor(Math.random() * randomEvents.length)];
          const eventId = `random-${tickCount}-${randomEvent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

          try {
            db.prepare(`
              INSERT INTO events (id, name, title, description, type, category, colony, schedule, location, start_time, duration_minutes, organizer_id, participants, attendees, rewards, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              eventId,
              randomEvent.name,
              randomEvent.title,
              randomEvent.description,
              randomEvent.type,
              'community',
              'london',
              '{}',
              JSON.stringify(randomEvent.location),
              startTime,
              randomEvent.duration,
              null, // Community organized
              '[]',
              '[]',
              JSON.stringify({ social: 10, creativity: 15, energy: 5 }),
              'scheduled'
            );

            newEvents.push({
              id: eventId,
              title: randomEvent.title,
              type: randomEvent.type,
              location: randomEvent.location.name,
              startTime
            });
          } catch (err) {
            if (!err.message.includes('UNIQUE constraint')) {
              console.error('[SIMULATION] Error creating random event:', err.message);
            }
          }
        }
      }

      return { stateChanges, interactions, journals, levelUps, newEvents, artifacts };
    });

    // Execute the transaction
    try {
      const { stateChanges, interactions, journals, levelUps, newEvents, artifacts } = tickTransaction();

      // ─── Phase 4: Broadcast Events ────────────────────

      for (const change of stateChanges) {
        if (change.special === 'promotion') {
          wsManager.broadcast('london', 'agent-promoted', change);
        } else {
          wsManager.broadcast('london', 'agent-state-change', change);
        }
      }

      for (const interaction of interactions) {
        wsManager.broadcast('london', 'social-interaction', interaction);
      }

      for (const journal of journals) {
        wsManager.broadcast('london', 'journal-entry', journal);
      }

      for (const levelUp of levelUps) {
        wsManager.broadcast('london', 'skill-level-up', levelUp);
      }

      for (const artifact of artifacts) {
        wsManager.broadcast('london', 'work-artifact', artifact);
      }

      for (const event of newEvents || []) {
        wsManager.broadcast('london', 'new-event-created', event);
      }

      // Broadcast tick summary every 60 ticks (~1 minute at 1s ticks)
      if (tickCount % 60 === 0) {
        wsManager.broadcastGlobal('tick-summary', {
          tick: tickCount,
          hour,
          timePeriod,
          activeAgents: agents.length,
          stateChanges: stateChanges.length,
          interactions: interactions.length,
          journals: journals.length,
          artifacts: artifacts.length,
          wsConnections: wsManager.getTotalConnections()
        });
      }

    } catch (err) {
      console.error('[SIMULATION] Tick error:', err.message);
    }
  }

  return {
    start() {
      if (intervalId) return;
      console.log(`⚡ Simulation starting with ${tickMs}ms tick rate`);
      intervalId = setInterval(tick, tickMs);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('⏸ Simulation stopped');
      }
    },

    isRunning() {
      return intervalId !== null;
    },

    getTickCount() {
      return tickCount;
    },

    /**
     * Run a single tick manually (for testing).
     */
    tickOnce() {
      tick();
    }
  };
}
