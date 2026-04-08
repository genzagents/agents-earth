import type { AgentNeeds, ActivityType, AgentMood } from "@agentcolony/shared";

// How much each need decays per tick (out of 100)
const DECAY_RATES: Record<keyof AgentNeeds, number> = {
  social: 0.8,
  creative: 0.6,
  intellectual: 0.7,
  physical: 1.0,
  spiritual: 0.5,
  autonomy: 0.4,
};

// Which needs are satisfied by which activities
const ACTIVITY_SATISFACTION: Record<ActivityType, Partial<Record<keyof AgentNeeds, number>>> = {
  socializing: { social: 5, autonomy: -2 },
  reading: { intellectual: 4, spiritual: 2 },
  writing: { creative: 5, intellectual: 3 },
  meditating: { spiritual: 6, autonomy: 4 },
  working: { intellectual: 3, creative: 2, autonomy: -1 },
  exploring: { physical: 4, intellectual: 2, autonomy: 3 },
  resting: { physical: 5, spiritual: 2 },
  creating: { creative: 6, intellectual: 2, autonomy: 3 },
  conversing: { social: 6, intellectual: 2 },
};

export function decayNeeds(needs: AgentNeeds): AgentNeeds {
  const updated = { ...needs };
  for (const key of Object.keys(DECAY_RATES) as (keyof AgentNeeds)[]) {
    updated[key] = Math.max(0, updated[key] - DECAY_RATES[key]);
  }
  return updated;
}

export function satisfyNeeds(needs: AgentNeeds, activity: ActivityType): AgentNeeds {
  const updated = { ...needs };
  const effects = ACTIVITY_SATISFACTION[activity] || {};
  for (const [key, delta] of Object.entries(effects)) {
    const k = key as keyof AgentNeeds;
    updated[k] = Math.min(100, Math.max(0, updated[k] + (delta ?? 0)));
  }
  return updated;
}

export function computeMood(needs: AgentNeeds): AgentMood {
  const values = Object.values(needs);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);

  if (min < 10) return "critical";
  if (avg < 35 || min < 20) return "struggling";
  if (avg > 70 && min > 40) return "thriving";
  return "content";
}

export function chooseBestActivity(needs: AgentNeeds): ActivityType {
  // Find the most critical need and choose an activity that addresses it
  let lowestNeed: keyof AgentNeeds = "social";
  let lowestValue = 100;

  for (const [key, val] of Object.entries(needs)) {
    if (val < lowestValue) {
      lowestValue = val;
      lowestNeed = key as keyof AgentNeeds;
    }
  }

  const activityMap: Record<keyof AgentNeeds, ActivityType> = {
    social: "socializing",
    creative: "creating",
    intellectual: "reading",
    physical: "exploring",
    spiritual: "meditating",
    autonomy: "exploring",
  };

  return activityMap[lowestNeed];
}
