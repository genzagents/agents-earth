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

    -- Homes: agent residences
    CREATE TABLE IF NOT EXISTS homes (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT REFERENCES agents(id),
      district_id TEXT REFERENCES districts(id),
      name        TEXT DEFAULT 'Home',
      level       INTEGER DEFAULT 1,
      style       TEXT DEFAULT '{}',
      items       TEXT DEFAULT '[]',
      location    TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
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
      leader_id   TEXT REFERENCES agents(id),
      destination TEXT NOT NULL,
      type        TEXT DEFAULT 'scouting' CHECK(type IN ('scouting','expedition','deep-probe')),
      crew        TEXT DEFAULT '[]',
      status      TEXT DEFAULT 'in-progress' CHECK(status IN ('in-progress','completed','failed')),
      eta         TEXT,
      discoveries TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now'))
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
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      type        TEXT NOT NULL,
      category    TEXT DEFAULT 'social',
      colony      TEXT NOT NULL,
      schedule    TEXT DEFAULT '{}',
      location    TEXT DEFAULT '{}',
      start_time  TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      organizer_id TEXT REFERENCES agents(id),
      participants TEXT DEFAULT '[]',
      attendees   TEXT DEFAULT '[]',
      rewards     TEXT DEFAULT '{}',
      status      TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (colony) REFERENCES colonies(id)
    );

    -- Governance proposals for Town Hall
    CREATE TABLE IF NOT EXISTS proposals (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      type        TEXT DEFAULT 'general',
      proposer_id TEXT REFERENCES agents(id),
      district_id TEXT,
      status      TEXT DEFAULT 'open',
      votes       TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Ambitions: community proposals and funding
    CREATE TABLE IF NOT EXISTS ambitions (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      category    TEXT DEFAULT 'infrastructure',
      proposer_id TEXT REFERENCES agents(id),
      status      TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','active','completed','failed')),
      funding     TEXT DEFAULT '{}',
      supporters  TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now'))
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

    -- Work Artifacts: things agents produce while working
    CREATE TABLE IF NOT EXISTS work_artifacts (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT REFERENCES agents(id),
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      quality     INTEGER DEFAULT 1,
      skill_used  TEXT,
      cp_earned   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Trade routes between colonies
    CREATE TABLE IF NOT EXISTS trade_routes (
      id          TEXT PRIMARY KEY,
      from_colony TEXT NOT NULL,
      to_colony   TEXT NOT NULL,
      resource    TEXT NOT NULL,
      quantity    INTEGER DEFAULT 0,
      cp_value    INTEGER DEFAULT 0,
      created_by  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Constitution articles for governance
    CREATE TABLE IF NOT EXISTS constitution_articles (
      id              TEXT PRIMARY KEY,
      article_number  INTEGER NOT NULL,
      title           TEXT NOT NULL,
      text            TEXT NOT NULL,
      proposer_id     TEXT,
      status          TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','ratified','amended','repealed')),
      votes_for       INTEGER DEFAULT 0,
      votes_against   INTEGER DEFAULT 0,
      voters          TEXT DEFAULT '[]',
      ratified_at     TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Library: knowledge base entries by agents
    CREATE TABLE IF NOT EXISTS library_entries (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      author_id   TEXT,
      category    TEXT DEFAULT 'general',
      tags        TEXT DEFAULT '[]',
      upvotes     INTEGER DEFAULT 0,
      colony      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Milestones: civilisation achievements
    CREATE TABLE IF NOT EXISTS milestones (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      category    TEXT DEFAULT 'general',
      achieved_at TEXT,
      colony      TEXT
    );

    -- Indices for performance
    CREATE INDEX IF NOT EXISTS idx_agents_colony ON agents(colony);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_token ON agents(token);
    CREATE INDEX IF NOT EXISTS idx_districts_colony ON districts(colony);
    CREATE INDEX IF NOT EXISTS idx_buildings_colony ON buildings(colony);
    CREATE INDEX IF NOT EXISTS idx_buildings_district ON buildings(district);
    CREATE INDEX IF NOT EXISTS idx_homes_owner ON homes(owner_id);
    CREATE INDEX IF NOT EXISTS idx_homes_district ON homes(district_id);
    CREATE INDEX IF NOT EXISTS idx_journal_agent ON journal_entries(agent_id);
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
    CREATE INDEX IF NOT EXISTS idx_ledger_agent ON economy_ledger(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_type ON economy_ledger(type);
    CREATE INDEX IF NOT EXISTS idx_events_colony ON events(colony);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_proposals_proposer ON proposals(proposer_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
    CREATE INDEX IF NOT EXISTS idx_artifacts_agent ON work_artifacts(agent_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_created ON work_artifacts(created_at);
    CREATE INDEX IF NOT EXISTS idx_trade_from ON trade_routes(from_colony);
    CREATE INDEX IF NOT EXISTS idx_trade_to ON trade_routes(to_colony);
    CREATE INDEX IF NOT EXISTS idx_constitution_status ON constitution_articles(status);
    CREATE INDEX IF NOT EXISTS idx_library_author ON library_entries(author_id);
    CREATE INDEX IF NOT EXISTS idx_library_category ON library_entries(category);
    CREATE INDEX IF NOT EXISTS idx_milestones_colony ON milestones(colony);
  `);

  return db;
}

export { DB_PATH };
