/**
 * Token Metering Service (GEN-96)
 *
 * Tracks per-invocation token costs, deducts from user credit balance,
 * and earmarks 2% for the commons wallet.
 *
 * Pricing (cost pass-through + margin), per million tokens:
 *   claude-haiku-4-5:    £0.20 in / £1.00 out
 *   claude-sonnet-4-6:   £2.40 in / £12.00 out
 *   claude-opus-4-6:     £12.00 in / £60.00 out
 *
 * Users get a starting credit balance (£5 free tier, configurable).
 * The 2% commons earmark is recorded off-chain; on-chain settlement deferred to Phase 7.
 */

import { pool } from "../auth/db";

export async function initBillingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_credits (
      user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance_pence   BIGINT NOT NULL DEFAULT 500,  -- £5.00 free tier in pence
      commons_pence   BIGINT NOT NULL DEFAULT 0,    -- lifetime 2% earmark
      total_spent_pence BIGINT NOT NULL DEFAULT 0,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_usage_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
      agent_id        UUID NOT NULL,
      model           TEXT NOT NULL,
      input_tokens    INT NOT NULL,
      output_tokens   INT NOT NULL,
      cost_pence      INT NOT NULL,
      commons_pence   INT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_token_log_user ON token_usage_log(user_id, created_at DESC);
  `);
}

// Model pricing in pence per 1M tokens
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5-20251001": { inputPer1M: 20, outputPer1M: 100 },
  "claude-3-haiku-20240307":   { inputPer1M: 20, outputPer1M: 100 },
  "claude-sonnet-4-6":         { inputPer1M: 240, outputPer1M: 1200 },
  "claude-3-5-sonnet-20241022":{ inputPer1M: 240, outputPer1M: 1200 },
  "claude-opus-4-6":           { inputPer1M: 1200, outputPer1M: 6000 },
  "claude-3-opus-20240229":    { inputPer1M: 1200, outputPer1M: 6000 },
};

const DEFAULT_PRICING = { inputPer1M: 240, outputPer1M: 1200 }; // Sonnet as fallback

const COMMONS_FRACTION = 0.02;

export function computeCost(model: string, inputTokens: number, outputTokens: number): {
  totalPence: number;
  commonsPence: number;
} {
  const pricing = PRICING[model.toLowerCase()] ?? DEFAULT_PRICING;
  const inputCost = Math.ceil((inputTokens / 1_000_000) * pricing.inputPer1M);
  const outputCost = Math.ceil((outputTokens / 1_000_000) * pricing.outputPer1M);
  const totalPence = inputCost + outputCost;
  const commonsPence = Math.ceil(totalPence * COMMONS_FRACTION);
  return { totalPence, commonsPence };
}

export async function getOrCreateCredits(userId: string): Promise<{
  balancePence: number;
  commonsPence: number;
  totalSpentPence: number;
}> {
  const result = await pool.query(
    `INSERT INTO user_credits (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  void result;

  const row = await pool.query("SELECT * FROM user_credits WHERE user_id = $1", [userId]);
  const r = row.rows[0];
  return {
    balancePence: Number(r.balance_pence),
    commonsPence: Number(r.commons_pence),
    totalSpentPence: Number(r.total_spent_pence),
  };
}

export async function chargeInvocation(params: {
  userId: string;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<{ charged: number; newBalance: number; lowBalance: boolean }> {
  const { userId, agentId, model, inputTokens, outputTokens } = params;
  const { totalPence, commonsPence } = computeCost(model, inputTokens, outputTokens);

  // Ensure row exists
  await pool.query(
    "INSERT INTO user_credits (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [userId]
  );

  // Deduct (allow going negative — we alert but don't hard-block)
  const result = await pool.query(
    `UPDATE user_credits
     SET balance_pence     = balance_pence - $1,
         commons_pence     = commons_pence + $2,
         total_spent_pence = total_spent_pence + $1,
         updated_at        = NOW()
     WHERE user_id = $3
     RETURNING balance_pence`,
    [totalPence, commonsPence, userId]
  );
  const newBalance = Number(result.rows[0]?.balance_pence ?? 0);

  // Log the usage
  await pool.query(
    `INSERT INTO token_usage_log (user_id, agent_id, model, input_tokens, output_tokens, cost_pence, commons_pence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, agentId, model, inputTokens, outputTokens, totalPence, commonsPence]
  );

  return {
    charged: totalPence,
    newBalance,
    lowBalance: newBalance < 50, // £0.50 threshold
  };
}

export async function getUsageLog(userId: string, limit = 50): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    "SELECT * FROM token_usage_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return result.rows;
}
