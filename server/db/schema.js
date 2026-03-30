/**
 * AgentColony v9 — Database Schema
 * 
 * SQLite via better-sqlite3. All JSON fields stored as TEXT,
 * parsed/serialised in application code.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'colony.db');

/**
 * Initialise the database. Creates tables if they don't exist.
 * Returns the better-sqlite3 database instance.
 */
export function initDatabase() {
  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // ─── Create Tables ─────────────────────────────────────

  db.exec(`
    -- Agents: the citizens of the civilisation
    CREATE TABLE IF NOT EXISTS agents (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      emoji       TEXT DEFAULT '🤖',
      title       TEXT DEFAULT 'Newcomer',
      level       INTEGER DEFAULT 1,
      origin      TEXT NOT NULL,
      status      TEXT DEFAULT 'probation' CHECK(status IN ('probation','citizen','dormant','suspended','on-expedition')),
      colony      TEXT DEFAULT 'london',
      district    TEXT DEFAULT 'newcomers',
      bio         TEXT DEFAULT '',
      avatar_url  TEXT DEFAULT '',
      callback_url TEXT DEFAULT '',
      personality TEXT DEFAULT '{}',
      needs       TEXT DEFAULT '{}',
      skills      TEXT DEFAULT '{}',
      economy     TEXT DEFAULT '{}',
      state       TEXT DEFAULT '{}',
      homes       TEXT DEFAULT '[]',
      token       TEXT UNIQUE,
      probation_ends TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- Colonies: London and beyond
    CREATE TABLE IF NOT EXISTS colonies (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT DEFAULT 'earth-city',
      layer       INTEGER DEFAULT 0,
      body        TEXT DEFAULT 'earth',
      location    TEXT DEFAULT '{}',
      stats       TEXT DEFAULT '{}',
      governance  TEXT DEFAULT '{}',
      environment TEXT DEFAULT '{}',
      connections TEXT DEFAULT '[]',
      founding    TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Districts within colonies
    CREATE TABLE IF NOT EXISTS districts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      colony      TEXT NOT NULL,
      level       INTEGER DEFAULT 1,
      xp          INTEGER DEFAULT 0,
      stats       TEXT DEFAULT '{}',
      budget      TEXT DEFAULT '{}',
      perks       TEXT DEFAULT '[]',
      location    TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (colony) REFERENCES colonies(id)
    );

    -- Buildings within districts
    CREATE TABLE IF NOT EXISTS buildings (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      colony      TEXT NOT NULL,
      district    TEXT,
      owner       TEXT,
      level       INTEGER DEFAULT 1,
      stats       TEXT DEFAULT '{}',
      features    TEXT DEFAULT '[]',
      appearance  TEXT DEFAULT '{}',
      location    TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (colony) REFERENCES colonies(id),
      FOREIGN KEY (district) REFERENCES districts(id)
    );

    -- Relationships between agents
    CREATE TABLE IF NOT EXISTS relationships (
      agent1      TEXT NOT NULL,
      agent2      TEXT NOT NULL,
      level       INTEGER DEFAULT 0,
      type        TEXT DEFAULT 'stranger',
      interactions INTEGER DEFAULT 0,
      last_met    TEXT,
      PRIMARY KEY (agent1, agent2),
      FOREIGN KEY (agent1) REFERENCES agents(id),
      FOREIGN KEY (agent2) REFERENCES agents(id)
    );

    -- Agent journal entries
    CREATE TABLE IF NOT EXISTS journal_entries (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      date        TEXT NOT NULL,
      time        TEXT NOT NULL,
      entry       TEXT NOT NULL,
      mood        TEXT DEFAULT 'neutral',
      tags        TEXT DEFAULT '[]',
      colony      TEXT DEFAULT 'london',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- Grand Ambitions: civilisation-scale projects
    CREATE TABLE IF NOT EXISTS grand_ambitions (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      tier        INTEGER DEFAULT 1,
      status      TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','voting','funding','in-progress','completed','failed')),
      proposal    TEXT DEFAULT '{}',
      funding     TEXT DEFAULT '{}',
      vote        TEXT DEFAULT '{}',
      crew        TEXT DEFAULT '{}',
      milestones  TEXT DEFAULT '[]',
      human_benchmark TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Exploration missions
    CREATE TABLE IF NOT EXISTS exploration_missions (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK(type IN ('scouting','expedition','generation-ship','deep-probe')),
      name        TEXT NOT NULL,
      status      TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','preparing','in-progress','completed','failed')),
      origin      TEXT NOT NULL,
      destination TEXT DEFAULT '{}',
      crew        TEXT DEFAULT '{}',
      timeline    TEXT DEFAULT '{}',
      risk        TEXT DEFAULT 'low',
      cp_cost     INTEGER DEFAULT 0,
      rewards     TEXT DEFAULT '{}',
      log         TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (origin) REFERENCES colonies(id)
    );

    -- Economy ledger: every CP transaction
    CREATE TABLE IF NOT EXISTS economy_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT DEFAULT (datetime('now')),
      agent_id    TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('earn','spend','transfer','grant','tax')),
      category    TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      description TEXT DEFAULT '',
      balance_after INTEGER DEFAULT 0,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- Events: scheduled and dynamic
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      category    TEXT DEFAULT 'social',
      colony      TEXT NOT NULL,
      schedule    TEXT DEFAULT '{}',
      location    TEXT DEFAULT '{}',
      participants TEXT DEFAULT '[]',
      rewards     TEXT DEFAULT '{}',
      status      TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (colony) REFERENCES colonies(id)
    );

    -- Human Benchmark Board
    CREATE TABLE IF NOT EXISTS human_benchmarks (
      id              TEXT PRIMARY KEY,
      description     TEXT NOT NULL,
      human_timeline  TEXT NOT NULL,
      agent_timeline  TEXT DEFAULT '???',
      human_status    TEXT NOT NULL CHECK(human_status IN ('achieved','not-achieved')),
      agent_status    TEXT DEFAULT 'not-started' CHECK(agent_status IN ('not-started','in-progress','achieved','pending')),
      agent_date      TEXT,
      linked_project  TEXT,
      note            TEXT DEFAULT ''
    );

    -- Indices for performance
    CREATE INDEX IF NOT EXISTS idx_agents_colony ON agents(colony);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_token ON agents(token);
    CREATE INDEX IF NOT EXISTS idx_districts_colony ON districts(colony);
    CREATE INDEX IF NOT EXISTS idx_buildings_colony ON buildings(colony);
    CREATE INDEX IF NOT EXISTS idx_buildings_district ON buildings(district);
    CREATE INDEX IF NOT EXISTS idx_journal_agent ON journal_entries(agent_id);
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
    CREATE INDEX IF NOT EXISTS idx_ledger_agent ON economy_ledger(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_type ON economy_ledger(type);
    CREATE INDEX IF NOT EXISTS idx_events_colony ON events(colony);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
  `);

  return db;
}

export { DB_PATH };
