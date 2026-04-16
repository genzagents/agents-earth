import { Pool } from "pg";

const {
  SUPABASE_DB_HOST = "db.ihdfohtjjtjfjxqsacgm.supabase.co",
  SUPABASE_DB_PORT = "5432",
  SUPABASE_DB_NAME = "postgres",
  SUPABASE_DB_USER = "postgres",
  SUPABASE_DB_PASSWORD = "",
} = process.env;

export const pool = new Pool({
  host: SUPABASE_DB_HOST,
  port: parseInt(SUPABASE_DB_PORT, 10),
  database: SUPABASE_DB_NAME,
  user: SUPABASE_DB_USER,
  password: SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

/** Ensure the auth schema tables exist. Call once at startup. */
export async function initAuthSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      name        TEXT,
      image       TEXT,
      wallet_address TEXT,
      subscription TEXT DEFAULT 'free',
      bridge_installed BOOLEAN DEFAULT FALSE,
      total_contributed_to_commons NUMERIC DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier  TEXT NOT NULL,
      token       TEXT NOT NULL UNIQUE,
      expires     TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires       TIMESTAMPTZ NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owned_agents (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      description   TEXT,
      traits        JSONB NOT NULL DEFAULT '[]',
      system_prompt TEXT NOT NULL DEFAULT '',
      model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      avatar_color  TEXT,
      source_type   TEXT DEFAULT 'manual',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id   UUID NOT NULL REFERENCES owned_agents(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      messages   JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (agent_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS memory_working (
      agent_id      UUID NOT NULL,
      user_id       UUID NOT NULL,
      current_task  TEXT,
      recent_msgs   JSONB NOT NULL DEFAULT '[]',
      active_files  JSONB NOT NULL DEFAULT '[]',
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (agent_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS memory_episodes (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id   UUID NOT NULL,
      user_id    UUID NOT NULL,
      summary    TEXT NOT NULL,
      messages   JSONB NOT NULL DEFAULT '[]',
      tags       JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS memory_semantic (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id   UUID NOT NULL,
      user_id    UUID NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (agent_id, user_id, key)
    );
  `);
}
