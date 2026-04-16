/**
 * MemoryService — 3-tier memory for user-owned agents.
 *
 * Tier 1: Working memory  — recent messages / current task context (Supabase; swap to Redis TTL 24h when provisioned)
 * Tier 2: Episodic memory — full conversation history and task logs (Supabase; swap to Cosmos DB when provisioned)
 * Tier 3: Semantic memory — distilled facts and learned patterns (Supabase; swap to Cosmos DB + Pinecone when provisioned)
 *
 * All tiers share a single Supabase pool right now so that the acceptance criteria
 * ("agent remembers prior conversations") is met without external infra dependencies.
 * Each tier has its own DB table and service boundary so the backend can be swapped
 * independently (Redis for Tier 1, Cosmos DB for Tier 2/3, Pinecone for vector search).
 */

import { pool } from "../auth/db";

// ---- Types ----

export interface WorkingMemory {
  agentId: string;
  currentTask: string | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeFiles: string[];
  updatedAt: Date;
}

export interface Episode {
  id: string;
  agentId: string;
  userId: string;
  summary: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tags: string[];
  createdAt: Date;
}

export interface SemanticFact {
  id: string;
  agentId: string;
  userId: string;
  key: string;
  value: string;
  confidence: number; // 0–1
  updatedAt: Date;
}

// ---- Schema init ----

export async function initMemorySchema(): Promise<void> {
  await pool.query(`
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
    CREATE INDEX IF NOT EXISTS idx_episodes_agent ON memory_episodes(agent_id, user_id);

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
    CREATE INDEX IF NOT EXISTS idx_semantic_agent ON memory_semantic(agent_id, user_id);
  `);
}

// ---- Tier 1: Working memory ----

const WORKING_MAX_MESSAGES = 20;

export async function getWorkingMemory(agentId: string, userId: string): Promise<WorkingMemory> {
  const result = await pool.query(
    "SELECT * FROM memory_working WHERE agent_id = $1 AND user_id = $2",
    [agentId, userId]
  );
  if (!result.rows[0]) {
    return {
      agentId,
      currentTask: null,
      recentMessages: [],
      activeFiles: [],
      updatedAt: new Date(),
    };
  }
  const row = result.rows[0];
  return {
    agentId: row.agent_id as string,
    currentTask: (row.current_task as string | null) ?? null,
    recentMessages: (row.recent_msgs as WorkingMemory["recentMessages"]) ?? [],
    activeFiles: (row.active_files as string[]) ?? [],
    updatedAt: row.updated_at as Date,
  };
}

export async function setWorkingMemory(
  agentId: string,
  userId: string,
  patch: Partial<Omit<WorkingMemory, "agentId" | "updatedAt">>
): Promise<void> {
  const current = await getWorkingMemory(agentId, userId);
  const recentMessages = patch.recentMessages !== undefined
    ? patch.recentMessages.slice(-WORKING_MAX_MESSAGES)
    : current.recentMessages.slice(-WORKING_MAX_MESSAGES);

  await pool.query(
    `INSERT INTO memory_working (agent_id, user_id, current_task, recent_msgs, active_files, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
     ON CONFLICT (agent_id, user_id) DO UPDATE
       SET current_task = EXCLUDED.current_task,
           recent_msgs  = EXCLUDED.recent_msgs,
           active_files = EXCLUDED.active_files,
           updated_at   = NOW()`,
    [
      agentId,
      userId,
      patch.currentTask !== undefined ? patch.currentTask : current.currentTask,
      JSON.stringify(recentMessages),
      JSON.stringify(patch.activeFiles !== undefined ? patch.activeFiles : current.activeFiles),
    ]
  );
}

export async function appendWorkingMessages(
  agentId: string,
  userId: string,
  messages: WorkingMemory["recentMessages"]
): Promise<void> {
  const current = await getWorkingMemory(agentId, userId);
  const updated = [...current.recentMessages, ...messages].slice(-WORKING_MAX_MESSAGES);
  await setWorkingMemory(agentId, userId, { recentMessages: updated });
}

// ---- Tier 2: Episodic memory ----

export async function writeEpisode(params: {
  agentId: string;
  userId: string;
  summary: string;
  messages: Episode["messages"];
  tags?: string[];
}): Promise<Episode> {
  const result = await pool.query(
    `INSERT INTO memory_episodes (agent_id, user_id, summary, messages, tags)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING *`,
    [
      params.agentId,
      params.userId,
      params.summary,
      JSON.stringify(params.messages),
      JSON.stringify(params.tags ?? []),
    ]
  );
  const row = result.rows[0];
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    summary: row.summary as string,
    messages: row.messages as Episode["messages"],
    tags: row.tags as string[],
    createdAt: row.created_at as Date,
  };
}

/**
 * Recall episodes by keyword similarity (full-text search over summaries + tags).
 * When Pinecone is provisioned, replace this with vector similarity search.
 */
export async function recallEpisodes(
  agentId: string,
  userId: string,
  query: string,
  limit = 5
): Promise<Episode[]> {
  const result = await pool.query(
    `SELECT * FROM memory_episodes
     WHERE agent_id = $1 AND user_id = $2
       AND (summary ILIKE $3 OR tags::text ILIKE $3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [agentId, userId, `%${query}%`, limit]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    summary: row.summary as string,
    messages: row.messages as Episode["messages"],
    tags: row.tags as string[],
    createdAt: row.created_at as Date,
  }));
}

export async function listEpisodes(
  agentId: string,
  userId: string,
  limit = 20,
  offset = 0
): Promise<Episode[]> {
  const result = await pool.query(
    "SELECT * FROM memory_episodes WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
    [agentId, userId, limit, offset]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    summary: row.summary as string,
    messages: row.messages as Episode["messages"],
    tags: row.tags as string[],
    createdAt: row.created_at as Date,
  }));
}

// ---- Tier 3: Semantic memory ----

export async function upsertSemanticFact(params: {
  agentId: string;
  userId: string;
  key: string;
  value: string;
  confidence?: number;
}): Promise<SemanticFact> {
  const result = await pool.query(
    `INSERT INTO memory_semantic (agent_id, user_id, key, value, confidence, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (agent_id, user_id, key) DO UPDATE
       SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, updated_at = NOW()
     RETURNING *`,
    [params.agentId, params.userId, params.key, params.value, params.confidence ?? 1.0]
  );
  const row = result.rows[0];
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    key: row.key as string,
    value: row.value as string,
    confidence: row.confidence as number,
    updatedAt: row.updated_at as Date,
  };
}

export async function getSemanticFacts(
  agentId: string,
  userId: string
): Promise<SemanticFact[]> {
  const result = await pool.query(
    "SELECT * FROM memory_semantic WHERE agent_id = $1 AND user_id = $2 ORDER BY confidence DESC, updated_at DESC",
    [agentId, userId]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    key: row.key as string,
    value: row.value as string,
    confidence: row.confidence as number,
    updatedAt: row.updated_at as Date,
  }));
}

export async function deleteSemanticFact(id: string, agentId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM memory_semantic WHERE id = $1 AND agent_id = $2 AND user_id = $3",
    [id, agentId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---- Consolidation ----

/**
 * Nightly consolidation: compress working memory into an episode and extract
 * semantic facts using Claude. Currently a synchronous trigger; the nightly
 * cron version lives in GEN-95.
 */
export async function consolidate(
  agentId: string,
  userId: string,
  summaryFn: (messages: WorkingMemory["recentMessages"]) => Promise<{ summary: string; facts: Array<{ key: string; value: string }> }>
): Promise<{ episodeId: string; factsWritten: number }> {
  const working = await getWorkingMemory(agentId, userId);
  if (working.recentMessages.length === 0) {
    return { episodeId: "", factsWritten: 0 };
  }

  const { summary, facts } = await summaryFn(working.recentMessages);

  const episode = await writeEpisode({
    agentId,
    userId,
    summary,
    messages: working.recentMessages,
    tags: facts.map((f) => f.key),
  });

  for (const fact of facts) {
    await upsertSemanticFact({ agentId, userId, key: fact.key, value: fact.value });
  }

  // Clear working memory after consolidation
  await setWorkingMemory(agentId, userId, { recentMessages: [], currentTask: null });

  return { episodeId: episode.id, factsWritten: facts.length };
}
