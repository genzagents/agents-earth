import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AgentRateLimitConfig,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "../middleware/AgentRateLimiter";

// We need a fresh instance per test to avoid shared state
// Import the class directly rather than the singleton.
// Since AgentRateLimiter is not exported, we test via the singleton with careful resets.
// Re-export class for testing:
import { agentRateLimiter, isAdminRequest } from "../middleware/AgentRateLimiter";

const TEST_AGENT = "test-agent-001";

// Reset the agent window before each test
beforeEach(() => {
  agentRateLimiter.resetWindow(TEST_AGENT);
  agentRateLimiter.resetConfig(TEST_AGENT);
});

describe("AgentRateLimiter.check", () => {
  test("allows first request within default limit", () => {
    const result = agentRateLimiter.check(TEST_AGENT);
    assert.ok(result.allowed, "First request should be allowed");
  });

  test("blocks request after limit is exhausted", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 3 });
    agentRateLimiter.check(TEST_AGENT); // 1
    agentRateLimiter.check(TEST_AGENT); // 2
    agentRateLimiter.check(TEST_AGENT); // 3 = at limit
    const result = agentRateLimiter.check(TEST_AGENT); // 4 = over
    assert.ok(!result.allowed, "Request over limit should be blocked");
    if (!result.allowed) {
      assert.ok(result.retryAfterMs > 0, "retryAfterMs should be positive");
      assert.ok(result.retryAfterMs <= 60_000, "retryAfterMs should be within a minute");
    }
  });

  test("returns 429-compatible result with retryAfterMs when blocked", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 1 });
    agentRateLimiter.check(TEST_AGENT); // exhaust
    const result = agentRateLimiter.check(TEST_AGENT);
    assert.ok(!result.allowed);
    if (!result.allowed) {
      assert.ok(typeof result.retryAfterMs === "number");
      assert.ok(result.retryAfterMs > 0);
    }
  });

  test("admin requests always pass regardless of limit", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 1 });
    agentRateLimiter.check(TEST_AGENT); // exhaust as normal user
    const result = agentRateLimiter.check(TEST_AGENT, true); // isAdmin = true
    assert.ok(result.allowed, "Admin request should always be allowed");
  });

  test("trusted agents get 10x effective limit", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 2, trusted: true });
    // Effective limit = 2 * 10 = 20
    for (let i = 0; i < 20; i++) {
      const r = agentRateLimiter.check(TEST_AGENT);
      assert.ok(r.allowed, `Request ${i + 1} of 20 should be allowed for trusted agent`);
    }
    const over = agentRateLimiter.check(TEST_AGENT);
    assert.ok(!over.allowed, "Request 21 should be blocked");
  });
});

describe("AgentRateLimiter.configure / getConfig", () => {
  test("returns default config when not configured", () => {
    const config = agentRateLimiter.getConfig("unconfigured-agent");
    assert.equal(config.requestsPerMinute, DEFAULT_REQUESTS_PER_MINUTE);
    assert.equal(config.trusted, false);
  });

  test("configure updates config and returns merged result", () => {
    const updated = agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 30 });
    assert.equal(updated.requestsPerMinute, 30);
    assert.equal(updated.trusted, false); // unchanged default
  });

  test("partial update merges with existing config", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 30, trusted: true });
    const merged = agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 50 });
    assert.equal(merged.requestsPerMinute, 50);
    assert.equal(merged.trusted, true); // preserved from previous configure
  });

  test("resetConfig restores defaults", () => {
    agentRateLimiter.configure(TEST_AGENT, { requestsPerMinute: 5, trusted: true });
    agentRateLimiter.resetConfig(TEST_AGENT);
    const config = agentRateLimiter.getConfig(TEST_AGENT);
    assert.equal(config.requestsPerMinute, DEFAULT_REQUESTS_PER_MINUTE);
    assert.equal(config.trusted, false);
  });
});

describe("isAdminRequest", () => {
  test("returns false when ADMIN_SECRET not set", () => {
    delete process.env.ADMIN_SECRET;
    assert.equal(isAdminRequest("anything"), false);
  });

  test("returns false when header does not match secret", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    assert.equal(isAdminRequest("wrong-secret"), false);
    delete process.env.ADMIN_SECRET;
  });

  test("returns true when header matches ADMIN_SECRET", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    assert.equal(isAdminRequest("correct-secret"), true);
    delete process.env.ADMIN_SECRET;
  });

  test("returns false when header is undefined", () => {
    process.env.ADMIN_SECRET = "some-secret";
    assert.equal(isAdminRequest(undefined), false);
    delete process.env.ADMIN_SECRET;
  });
});
