import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  bio: text("bio").notNull().default(""),
  traits: text("traits").notNull().default("[]"), // JSON array
  // needs stored as individual columns for query efficiency
  needsSocial: real("needs_social").notNull().default(75),
  needsCreative: real("needs_creative").notNull().default(75),
  needsIntellectual: real("needs_intellectual").notNull().default(75),
  needsPhysical: real("needs_physical").notNull().default(75),
  needsSpiritual: real("needs_spiritual").notNull().default(75),
  needsAutonomy: real("needs_autonomy").notNull().default(75),
  // state
  mood: text("mood").notNull().default("content"),
  currentActivity: text("current_activity").notNull().default("resting"),
  currentAreaId: text("current_area_id").notNull(),
  statusMessage: text("status_message").notNull().default(""),
  stateLastUpdated: integer("state_last_updated").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
});

export const areas = sqliteTable("areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  posX: real("pos_x").notNull(),
  posY: real("pos_y").notNull(),
  capacity: integer("capacity").notNull().default(10),
  ambiance: text("ambiance").notNull().default("calm"),
});

export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  targetAgentId: text("target_agent_id").notNull(),
  strength: real("strength").notNull().default(0),
  type: text("type").notNull().default("stranger"),
  interactions: integer("interactions").notNull().default(0),
  lastMet: integer("last_met").notNull().default(0),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  emotionalWeight: real("emotional_weight").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  tags: text("tags").notNull().default("[]"), // JSON array
});

export const worldEvents = sqliteTable("world_events", {
  id: text("id").primaryKey(),
  tick: integer("tick").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  involvedAgentIds: text("involved_agent_ids").notNull().default("[]"), // JSON
  areaId: text("area_id"),
});

export const worldMeta = sqliteTable("world_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
