/**
 * AgentRateLimiter — per-agent request rate limiting.
 *
 * Default: 60 requests/minute per agent.
 * Trusted agents get a 10× multiplier (configurable per agent).
 * Admin requests can bypass or reconfigure limits via X-Admin-Secret header.
 *
 * Usage in Fastify routes:
 *   import { agentRateLimiter } from "../middleware/AgentRateLimiter";
 *   // inside a route handler (or preHandler):
 *   const check = agentRateLimiter.check(agentId, isAdmin);
 *   if (!check.allowed) {
 *     reply.header("Retry-After", String(Math.ceil(check.retryAfterMs / 1000)));
 *     return reply.code(429).send({ error: "Rate limit exceeded", retryAfterMs: check.retryAfterMs });
 *   }
 */

export const DEFAULT_REQUESTS_PER_MINUTE = 60;
const TRUSTED_MULTIPLIER = 10;

export interface AgentRateLimitConfig {
  requestsPerMinute: number;
  trusted: boolean;
}

interface RateWindow {
  count: number;
  resetAt: number; // unix ms when the window resets
}

type CheckResult = { allowed: true } | { allowed: false; retryAfterMs: number };

class AgentRateLimiter {
  private windows = new Map<string, RateWindow>();
  private configs = new Map<string, AgentRateLimitConfig>();

  /**
   * Configure (or update) rate limit settings for an agent.
   * Partial updates are merged with the existing config.
   */
  configure(agentId: string, config: Partial<AgentRateLimitConfig>): AgentRateLimitConfig {
    const existing = this.getConfig(agentId);
    const updated: AgentRateLimitConfig = { ...existing, ...config };
    this.configs.set(agentId, updated);
    return updated;
  }

  /** Returns the effective config for an agent (defaults if not configured). */
  getConfig(agentId: string): AgentRateLimitConfig {
    return this.configs.get(agentId) ?? {
      requestsPerMinute: DEFAULT_REQUESTS_PER_MINUTE,
      trusted: false,
    };
  }

  /** Reset an agent's config to defaults. */
  resetConfig(agentId: string): void {
    this.configs.delete(agentId);
  }

  /**
   * Check whether a request from agentId is within rate limits.
   *
   * @param agentId   The agent making the request.
   * @param isAdmin   When true, request bypasses rate limiting entirely.
   */
  check(agentId: string, isAdmin = false): CheckResult {
    if (isAdmin) return { allowed: true };

    const now = Date.now();
    const config = this.getConfig(agentId);
    const limit = config.trusted
      ? config.requestsPerMinute * TRUSTED_MULTIPLIER
      : config.requestsPerMinute;

    const window = this.windows.get(agentId);

    if (!window || now >= window.resetAt) {
      this.windows.set(agentId, { count: 1, resetAt: now + 60_000 });
      return { allowed: true };
    }

    if (window.count >= limit) {
      return { allowed: false, retryAfterMs: window.resetAt - now };
    }

    window.count++;
    return { allowed: true };
  }

  /** Reset the sliding window for an agent (useful in tests). */
  resetWindow(agentId: string): void {
    this.windows.delete(agentId);
  }

  /** Snapshot of current windows (for monitoring/debugging). */
  getWindowSnapshot(agentId: string): RateWindow | undefined {
    return this.windows.get(agentId);
  }
}

export const agentRateLimiter = new AgentRateLimiter();

/** Returns true when the request carries a valid admin secret. */
export function isAdminRequest(adminSecretHeader: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return adminSecretHeader === secret;
}
