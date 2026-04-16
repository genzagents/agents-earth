/**
 * Memory Consolidation Job (GEN-95)
 *
 * Runs nightly per-agent to:
 * 1. Summarise the day's episodic memories into condensed entries
 * 2. Extract semantic facts from episodes
 * 3. Archive/decay episodes not accessed in N days
 * 4. Clear working memory after consolidation
 *
 * Implementation: setInterval-based scheduler (Azure Functions timer trigger
 * can be used in production by calling POST /api/jobs/consolidate-all).
 */

import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../auth/db";
import { consolidate } from "../memory/MemoryService";
import type { FastifyBaseLogger } from "fastify";

const EPISODE_DECAY_DAYS = 90; // Archive episodes older than 90 days
const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function summariseMessages(messages: Array<{ role: string; content: string }>): Promise<{
  summary: string;
  facts: Array<{ key: string; value: string }>;
}> {
  if (messages.length === 0) return { summary: "", facts: [] };

  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      'Analyse this conversation and return JSON: {"summary": "1-2 sentence summary", "facts": [{"key": "...", "value": "..."}]}. Return only valid JSON.',
    messages: [
      {
        role: "user",
        content: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return JSON.parse(text) as { summary: string; facts: Array<{ key: string; value: string }> };
  } catch {
    return { summary: text.slice(0, 200), facts: [] };
  }
}

/**
 * Consolidate all active (agent_id, user_id) pairs that have working memory.
 */
async function runConsolidationPass(log: FastifyBaseLogger): Promise<void> {
  // Find all (agent_id, user_id) pairs with non-empty working memory
  const result = await pool.query(
    "SELECT agent_id, user_id FROM memory_working WHERE jsonb_array_length(recent_msgs) > 0"
  );

  const pairs = result.rows as Array<{ agent_id: string; user_id: string }>;
  log.info({ count: pairs.length }, "[MemoryConsolidation] starting pass");

  for (const { agent_id, user_id } of pairs) {
    try {
      const result = await consolidate(agent_id, user_id, (messages) =>
        summariseMessages(messages)
      );
      if (result.episodeId) {
        log.info(
          { agentId: agent_id, userId: user_id, episodeId: result.episodeId, factsWritten: result.factsWritten },
          "[MemoryConsolidation] consolidated"
        );
      }
    } catch (err) {
      log.warn({ err, agentId: agent_id, userId: user_id }, "[MemoryConsolidation] failed for pair");
    }
  }

  // Archive (soft-delete by removing from query results) old episodes
  await pool.query(
    `DELETE FROM memory_episodes
     WHERE created_at < NOW() - INTERVAL '${EPISODE_DECAY_DAYS} days'`
  );

  log.info("[MemoryConsolidation] pass complete");
}

let consolidationTimer: NodeJS.Timeout | null = null;

export function startMemoryConsolidationJob(log: FastifyBaseLogger): void {
  // Run once at startup (for dev/test) then every 24h
  // In production, use SKIP_CONSOLIDATION_STARTUP=true to skip the initial run
  if (!process.env.SKIP_CONSOLIDATION_STARTUP) {
    // Delay 60s after startup to avoid blocking server boot
    setTimeout(() => {
      runConsolidationPass(log).catch((err) =>
        log.warn({ err }, "[MemoryConsolidation] startup pass failed")
      );
    }, 60_000);
  }

  consolidationTimer = setInterval(() => {
    runConsolidationPass(log).catch((err) =>
      log.warn({ err }, "[MemoryConsolidation] nightly pass failed")
    );
  }, NIGHTLY_INTERVAL_MS);

  log.info("[MemoryConsolidation] nightly job scheduled");
}

export function stopMemoryConsolidationJob(): void {
  if (consolidationTimer) {
    clearInterval(consolidationTimer);
    consolidationTimer = null;
  }
}

/** Manual trigger (for testing or Azure Functions integration) */
export { runConsolidationPass };
