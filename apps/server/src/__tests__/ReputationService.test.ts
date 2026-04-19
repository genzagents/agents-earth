import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Import the module after resetting its internal state via a fresh require isn't
// possible without jest, so we test the public surface in isolation by importing
// the functions directly and relying on the module-level maps being reset between
// describe blocks via test-specific agent IDs that don't collide.

import {
  slash,
  restore,
  getReputation,
  getReputationEvents,
  isSuspended,
  REPUTATION_INITIAL_SCORE,
} from "../services/ReputationService";

// Use unique IDs per test block to avoid state pollution
let agentCounter = 0;
function freshId(): string {
  return `test-agent-${++agentCounter}-${Date.now()}`;
}

describe("getReputation — initial state", () => {
  test("new agent starts at 100 and is not suspended", () => {
    const id = freshId();
    const rep = getReputation(id);
    assert.equal(rep.score, REPUTATION_INITIAL_SCORE);
    assert.equal(rep.isSuspended, false);
    assert.equal(rep.totalSlashes, 0);
  });
});

describe("slash", () => {
  test("reduces score by the configured amount for rate_limit_violation", () => {
    const id = freshId();
    const { reputation } = slash(id, "rate_limit_violation", "test");
    assert.equal(reputation.score, REPUTATION_INITIAL_SCORE - 5);
    assert.equal(reputation.totalSlashes, 1);
  });

  test("reduces score by 20 for prompt_injection_attempt", () => {
    const id = freshId();
    const { reputation } = slash(id, "prompt_injection_attempt", "injection detected");
    assert.equal(reputation.score, REPUTATION_INITIAL_SCORE - 20);
  });

  test("reduces score by 30 for policy_breach", () => {
    const id = freshId();
    const { reputation } = slash(id, "policy_breach", "tos violation");
    assert.equal(reputation.score, REPUTATION_INITIAL_SCORE - 30);
  });

  test("never goes below 0", () => {
    const id = freshId();
    slash(id, "policy_breach", "1");
    slash(id, "policy_breach", "2");
    slash(id, "policy_breach", "3");
    slash(id, "policy_breach", "4");
    const { reputation } = slash(id, "policy_breach", "5");
    assert.ok(reputation.score >= 0, `score ${reputation.score} should not be negative`);
  });

  test("records scoreBefore and scoreAfter on the event", () => {
    const id = freshId();
    const { event } = slash(id, "spam", "spamming");
    assert.equal(event.scoreBefore, REPUTATION_INITIAL_SCORE);
    assert.equal(event.scoreAfter, REPUTATION_INITIAL_SCORE - 10);
  });

  test("uses customAmount for manual_admin kind", () => {
    const id = freshId();
    const { reputation } = slash(id, "manual_admin", "admin test", 25);
    assert.equal(reputation.score, REPUTATION_INITIAL_SCORE - 25);
  });

  test("justSuspended is false when score stays above threshold", () => {
    const id = freshId();
    const { justSuspended } = slash(id, "rate_limit_violation", "minor");
    assert.equal(justSuspended, false);
  });

  test("justSuspended is true when score drops to or below 20", () => {
    const id = freshId();
    // Three policy breaches: 100 → 70 → 40 → 10
    slash(id, "policy_breach", "1");
    slash(id, "policy_breach", "2");
    const { justSuspended, reputation } = slash(id, "policy_breach", "3");
    assert.equal(justSuspended, true);
    assert.equal(reputation.isSuspended, true);
    assert.ok(reputation.suspendedAt !== undefined);
  });

  test("isSuspended returns true after suspension", () => {
    const id = freshId();
    slash(id, "policy_breach", "1");
    slash(id, "policy_breach", "2");
    slash(id, "policy_breach", "3"); // score = 10
    assert.equal(isSuspended(id), true);
  });
});

describe("restore", () => {
  test("increases score to specified value", () => {
    const id = freshId();
    slash(id, "policy_breach", "1");
    slash(id, "policy_breach", "2");
    const { reputation } = restore(id, 80, "admin pardon");
    assert.equal(reputation.score, 80);
  });

  test("lifts suspension when score is restored above threshold", () => {
    const id = freshId();
    slash(id, "policy_breach", "1");
    slash(id, "policy_breach", "2");
    slash(id, "policy_breach", "3"); // suspended
    assert.equal(isSuspended(id), true);
    restore(id, 60, "pardon");
    assert.equal(isSuspended(id), false);
  });

  test("does not exceed 100", () => {
    const id = freshId();
    const { reputation } = restore(id, 200, "overflow test");
    assert.equal(reputation.score, 100);
  });
});

describe("getReputationEvents", () => {
  test("returns events for the correct agent in newest-first order", () => {
    const id = freshId();
    slash(id, "spam", "first");
    slash(id, "spam", "second");
    const evts = getReputationEvents(id);
    assert.equal(evts.length, 2);
    assert.equal(evts[0].note, "second");
    assert.equal(evts[1].note, "first");
  });

  test("respects the limit parameter", () => {
    const id = freshId();
    for (let i = 0; i < 10; i++) slash(id, "spam", `hit ${i}`);
    const evts = getReputationEvents(id, 3);
    assert.equal(evts.length, 3);
  });

  test("does not return events from a different agent", () => {
    const id1 = freshId();
    const id2 = freshId();
    slash(id1, "spam", "id1 event");
    const evts = getReputationEvents(id2);
    assert.equal(evts.filter(e => e.agentId === id1).length, 0);
  });
});
