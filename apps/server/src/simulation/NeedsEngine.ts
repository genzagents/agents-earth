import type { AgentNeeds, ActivityType, AgentMood, Area } from "@agentcolony/shared";

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

// Area affinity — available activities vary by area type
const AREA_ACTIVITIES: Record<string, ActivityType[]> = {
  park: ["exploring", "meditating", "resting", "socializing"],
  library: ["reading", "writing", "working"],
  cafe: ["conversing", "writing", "reading", "socializing"],
  studio: ["creating", "writing", "working"],
  market: ["socializing", "conversing", "exploring"],
  museum: ["reading", "meditating", "conversing"],
  plaza: ["socializing", "conversing", "exploring", "resting"],
  home: ["resting", "writing", "meditating", "creating"],
};

// Which area types best serve each need
const NEED_PREFERRED_AREA_TYPES: Record<keyof AgentNeeds, string[]> = {
  social: ["cafe", "market", "plaza", "park"],
  creative: ["studio", "museum", "cafe", "home"],
  intellectual: ["library", "museum", "cafe"],
  physical: ["park", "market", "plaza"],
  spiritual: ["park", "home", "museum"],
  autonomy: ["park", "home", "plaza"],
};

/**
 * Choose the best destination area for an agent based on their current needs.
 * Scores areas by need alignment and penalises crowded areas.
 * Uses soft-max weighted random selection so agents don't always pick the top area.
 */
export function chooseDestinationArea(
  needs: AgentNeeds,
  areas: Area[],
  currentAreaId: string
): Area {
  // Find the agent's most critical need
  let lowestNeed: keyof AgentNeeds = "social";
  let lowestValue = 101;
  for (const [key, val] of Object.entries(needs)) {
    if (val < lowestValue) {
      lowestValue = val;
      lowestNeed = key as keyof AgentNeeds;
    }
  }
  const preferredTypes = NEED_PREFERRED_AREA_TYPES[lowestNeed];

  const scored = areas.map(area => {
    let score = 0;

    // Need alignment bonus
    if (preferredTypes.includes(area.type)) score += 30;

    // Crowding penalty (0–40 points)
    const crowdRatio = area.currentOccupants.length / Math.max(1, area.capacity);
    score -= crowdRatio * 40;

    // Slight nudge away from current area (encourage exploration)
    if (area.id === currentAreaId) score -= 8;

    return { area, score };
  });

  // Weighted random using softmax-like weights (temperature = 15)
  const minScore = Math.min(...scored.map(s => s.score));
  const weighted = scored.map(s => ({ area: s.area, weight: Math.exp((s.score - minScore) / 15) }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  let rand = Math.random() * totalWeight;
  for (const { area, weight } of weighted) {
    rand -= weight;
    if (rand <= 0) return area;
  }
  return weighted[weighted.length - 1].area;
}

export function chooseBestActivityForArea(needs: AgentNeeds, areaType: string): ActivityType {
  const available = AREA_ACTIVITIES[areaType] ?? Object.keys(ACTIVITY_SATISFACTION) as ActivityType[];

  // Score each available activity by how much it helps the most critical needs
  let bestActivity = available[0];
  let bestScore = -Infinity;

  for (const activity of available) {
    const effects = ACTIVITY_SATISFACTION[activity] ?? {};
    let score = 0;
    for (const [need, delta] of Object.entries(effects)) {
      const k = need as keyof AgentNeeds;
      // Weight by how critical the need is (lower = more critical)
      const criticality = 100 - needs[k];
      score += criticality * (delta ?? 0) / 100;
    }
    if (score > bestScore) {
      bestScore = score;
      bestActivity = activity;
    }
  }

  return bestActivity;
}
