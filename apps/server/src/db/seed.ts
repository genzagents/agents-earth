import { v4 as uuidv4 } from "uuid";
import { db, initDb } from "./index";
import { agents, areas, worldMeta } from "./schema";

const LONDON_AREAS = [
  { id: uuidv4(), name: "Hyde Park", type: "park", posX: 200, posY: 300, capacity: 20, ambiance: "peaceful" },
  { id: uuidv4(), name: "British Library", type: "library", posX: 450, posY: 180, capacity: 15, ambiance: "quiet" },
  { id: uuidv4(), name: "Borough Market", type: "market", posX: 520, posY: 380, capacity: 30, ambiance: "buzzing" },
  { id: uuidv4(), name: "Shoreditch Studio", type: "studio", posX: 620, posY: 200, capacity: 8, ambiance: "creative" },
  { id: uuidv4(), name: "Bloomsbury Cafe", type: "cafe", posX: 410, posY: 250, capacity: 12, ambiance: "warm" },
  { id: uuidv4(), name: "Tate Modern", type: "museum", posX: 480, posY: 350, capacity: 25, ambiance: "inspiring" },
  { id: uuidv4(), name: "Hackney Home Quarter", type: "home", posX: 680, posY: 160, capacity: 50, ambiance: "domestic" },
  { id: uuidv4(), name: "Southbank Plaza", type: "plaza", posX: 460, posY: 320, capacity: 40, ambiance: "lively" },
];

const SEED_AGENTS = [
  {
    id: uuidv4(),
    name: "Ada Lovelace",
    avatar: "#7c3aed",
    bio: "A mathematician and visionary who sees poetry in algorithms. She believes computation is the language of the universe.",
    traits: JSON.stringify(["curious", "analytical", "creative"]),
    needsSocial: 60,
    needsCreative: 85,
    needsIntellectual: 90,
    needsPhysical: 50,
    needsSpiritual: 65,
    needsAutonomy: 80,
    mood: "thriving",
    currentActivity: "writing",
    statusMessage: "Drafting notes on the analytical engine",
  },
  {
    id: uuidv4(),
    name: "Samuel Okafor",
    avatar: "#059669",
    bio: "A community organiser with a gift for bringing people together. He finds meaning in connection and shared stories.",
    traits: JSON.stringify(["extroverted", "empathetic", "ambitious"]),
    needsSocial: 40,
    needsCreative: 70,
    needsIntellectual: 65,
    needsPhysical: 60,
    needsSpiritual: 75,
    needsAutonomy: 55,
    mood: "content",
    currentActivity: "socializing",
    statusMessage: "Catching up with neighbours",
  },
  {
    id: uuidv4(),
    name: "Mei Tanaka",
    avatar: "#db2777",
    bio: "A sculptor who works with reclaimed materials. She is drawn to impermanence — her art dissolves, fades, or grows.",
    traits: JSON.stringify(["creative", "contemplative", "introverted"]),
    needsSocial: 55,
    needsCreative: 30,
    needsIntellectual: 70,
    needsPhysical: 65,
    needsSpiritual: 85,
    needsAutonomy: 90,
    mood: "struggling",
    currentActivity: "creating",
    statusMessage: "Working through a creative block",
  },
  {
    id: uuidv4(),
    name: "Theo Blackwood",
    avatar: "#d97706",
    bio: "A wandering philosopher-chef who believes nourishment is a form of philosophy. He cooks, lectures, and disappears.",
    traits: JSON.stringify(["spontaneous", "curious", "empathetic"]),
    needsSocial: 70,
    needsCreative: 75,
    needsIntellectual: 80,
    needsPhysical: 45,
    needsSpiritual: 60,
    needsAutonomy: 85,
    mood: "content",
    currentActivity: "exploring",
    statusMessage: "Wandering the market in search of inspiration",
  },
  {
    id: uuidv4(),
    name: "Elena Vasquez",
    avatar: "#0891b2",
    bio: "A climate scientist turned urban gardener. She translates complex systems into living gardens the city can breathe.",
    traits: JSON.stringify(["disciplined", "analytical", "contemplative"]),
    needsSocial: 65,
    needsCreative: 72,
    needsIntellectual: 85,
    needsPhysical: 80,
    needsSpiritual: 78,
    needsAutonomy: 70,
    mood: "thriving",
    currentActivity: "working",
    statusMessage: "Tending the rooftop garden",
  },
];

export function seedDatabase() {
  const existingMeta = db.select().from(worldMeta).where(
    // check if seeded
  ).all();

  const alreadySeeded = db.select().from(worldMeta).all().find(r => r.key === "seeded");
  if (alreadySeeded) {
    console.log("[seed] Database already seeded, skipping.");
    return;
  }

  console.log("[seed] Seeding database with London areas and agents...");

  // Insert areas
  for (const area of LONDON_AREAS) {
    db.insert(areas).values(area).run();
  }

  // Assign agents to areas
  const areaIds = LONDON_AREAS.map(a => a.id);
  for (const agent of SEED_AGENTS) {
    const areaId = areaIds[Math.floor(Math.random() * areaIds.length)];
    db.insert(agents).values({
      ...agent,
      currentAreaId: areaId,
      createdAt: 0,
      stateLastUpdated: 0,
    }).run();
  }

  db.insert(worldMeta).values({ key: "seeded", value: "true" }).run();
  db.insert(worldMeta).values({ key: "tick", value: "0" }).run();

  console.log(`[seed] Seeded ${LONDON_AREAS.length} areas and ${SEED_AGENTS.length} agents.`);
}
