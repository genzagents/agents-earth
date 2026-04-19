import { v4 as uuidv4 } from "uuid";
import type { ReputationAbuseKind, ReputationEvent, AgentReputation } from "@agentcolony/shared";

// ── Config ────────────────────────────────────────────────────────────────────

const SLASH_AMOUNTS: Record<ReputationAbuseKind, number> = {
  rate_limit_violation:     5,
  prompt_injection_attempt: 20,
  policy_breach:            30,
  spam:                     10,
  manual_admin:             0,  // caller sets amount explicitly
};

/** Score at or below which the agent is auto-suspended */
const SUSPENSION_THRESHOLD = 20;

/** Starting score for new agents */
export const REPUTATION_INITIAL_SCORE = 100;

// ── In-memory store (survives process lifetime, not persisted) ────────────────

const reputations = new Map<string, AgentReputation>();
const events: ReputationEvent[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOrInit(agentId: string): AgentReputation {
  if (!reputations.has(agentId)) {
    reputations.set(agentId, {
      score: REPUTATION_INITIAL_SCORE,
      isSuspended: false,
      totalSlashes: 0,
    });
  }
  return reputations.get(agentId)!;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SlashResult {
  event: ReputationEvent;
  reputation: AgentReputation;
  justSuspended: boolean;
}

/**
 * Apply a reputation slash to an agent.
 *
 * @param agentId       Target agent
 * @param kind          Abuse signal kind
 * @param note          Human-readable reason for audit log
 * @param customAmount  Override slash amount (only honoured for manual_admin kind)
 */
export function slash(
  agentId: string,
  kind: ReputationAbuseKind,
  note: string,
  customAmount?: number,
): SlashResult {
  const rep = getOrInit(agentId);

  const amount =
    kind === "manual_admin" && customAmount !== undefined
      ? customAmount
      : SLASH_AMOUNTS[kind];

  const scoreBefore = rep.score;
  const scoreAfter = Math.max(0, rep.score - amount);

  rep.score = scoreAfter;
  rep.totalSlashes += 1;

  const wasSuspended = rep.isSuspended;
  const justSuspended = !wasSuspended && scoreAfter <= SUSPENSION_THRESHOLD;

  if (justSuspended) {
    rep.isSuspended = true;
    rep.suspendedAt = Date.now();
    rep.suspensionNote = `Auto-suspended after score dropped to ${scoreAfter} (threshold: ${SUSPENSION_THRESHOLD})`;
  }

  const event: ReputationEvent = {
    id: uuidv4(),
    agentId,
    kind,
    slashAmount: amount,
    scoreBefore,
    scoreAfter,
    note,
    createdAt: Date.now(),
  };

  events.unshift(event);
  // Keep at most 10 000 events in memory
  if (events.length > 10_000) events.length = 10_000;

  return { event, reputation: { ...rep }, justSuspended };
}

/** Restore an agent's reputation (admin action). */
export function restore(
  agentId: string,
  newScore: number,
  note: string,
): SlashResult {
  const rep = getOrInit(agentId);
  const scoreBefore = rep.score;
  rep.score = Math.min(100, Math.max(0, newScore));

  if (rep.isSuspended && rep.score > SUSPENSION_THRESHOLD) {
    rep.isSuspended = false;
    delete rep.suspendedAt;
    delete rep.suspensionNote;
  }

  const event: ReputationEvent = {
    id: uuidv4(),
    agentId,
    kind: "manual_admin",
    slashAmount: -(rep.score - scoreBefore), // negative = increase
    scoreBefore,
    scoreAfter: rep.score,
    note,
    createdAt: Date.now(),
  };

  events.unshift(event);
  if (events.length > 10_000) events.length = 10_000;

  return { event, reputation: { ...rep }, justSuspended: false };
}

/** Get current reputation for an agent (initialises if missing). */
export function getReputation(agentId: string): AgentReputation {
  return { ...getOrInit(agentId) };
}

/** Get reputation events for an agent, newest first. */
export function getReputationEvents(agentId: string, limit = 50): ReputationEvent[] {
  return events.filter(e => e.agentId === agentId).slice(0, limit);
}

/** Get all reputation events (admin), newest first. */
export function getAllReputationEvents(limit = 200): ReputationEvent[] {
  return events.slice(0, limit);
}

/** Returns true if the agent is currently suspended. */
export function isSuspended(agentId: string): boolean {
  return getOrInit(agentId).isSuspended;
}
