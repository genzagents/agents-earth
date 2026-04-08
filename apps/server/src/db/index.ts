import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "agentcolony.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS world_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 10,
      ambiance TEXT NOT NULL DEFAULT 'calm'
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      traits TEXT NOT NULL DEFAULT '[]',
      needs_social REAL NOT NULL DEFAULT 75,
      needs_creative REAL NOT NULL DEFAULT 75,
      needs_intellectual REAL NOT NULL DEFAULT 75,
      needs_physical REAL NOT NULL DEFAULT 75,
      needs_spiritual REAL NOT NULL DEFAULT 75,
      needs_autonomy REAL NOT NULL DEFAULT 75,
      mood TEXT NOT NULL DEFAULT 'content',
      current_activity TEXT NOT NULL DEFAULT 'resting',
      current_area_id TEXT NOT NULL,
      status_message TEXT NOT NULL DEFAULT '',
      state_last_updated INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      target_agent_id TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'stranger',
      interactions INTEGER NOT NULL DEFAULT 0,
      last_met INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      emotional_weight REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS world_events (
      id TEXT PRIMARY KEY,
      tick INTEGER NOT NULL,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      involved_agent_ids TEXT NOT NULL DEFAULT '[]',
      area_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_agent ON relationships(agent_id);
    CREATE INDEX IF NOT EXISTS idx_world_events_tick ON world_events(tick DESC);
  `);
}

export { sqlite };
