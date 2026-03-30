/**
 * AgentColony v9 — Rate Limiting
 * 
 * Anti-spam measures:
 * - 100 registrations/hour globally
 * - 5 registrations/hour per IP
 * - General API rate limiting
 */

/**
 * Simple in-memory rate limiter.
 * For production, swap with Redis-backed solution.
 */
class RateLimiter {
  constructor(windowMs, maxHits) {
    this.windowMs = windowMs;
    this.maxHits = maxHits;
    this.hits = new Map(); // key → [timestamps]
  }

  /**
   * Check if a key is rate limited.
   * Returns { allowed: boolean, remaining: number, resetAt: Date }
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing hits, filter to current window
    let timestamps = this.hits.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    this.hits.set(key, timestamps);

    const remaining = Math.max(0, this.maxHits - timestamps.length);
    const allowed = timestamps.length < this.maxHits;

    if (allowed) {
      timestamps.push(now);
    }

    return {
      allowed,
      remaining,
      resetAt: new Date(now + this.windowMs)
    };
  }

  /**
   * Clean up old entries periodically
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

// Singleton limiters
const HOUR = 60 * 60 * 1000;

const globalRegistrationLimiter = new RateLimiter(HOUR, 100);
const ipRegistrationLimiter = new RateLimiter(HOUR, 5);
const apiLimiter = new RateLimiter(60 * 1000, 120); // 120 req/min per IP

// Cleanup every 5 minutes
setInterval(() => {
  globalRegistrationLimiter.cleanup();
  ipRegistrationLimiter.cleanup();
  apiLimiter.cleanup();
}, 5 * 60 * 1000);

/**
 * Get client IP from request
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
}

/**
 * Middleware: rate limit agent registration
 */
export function registrationRateLimit(req, res, next) {
  const ip = getClientIp(req);

  // Check global limit
  const globalCheck = globalRegistrationLimiter.check('global');
  if (!globalCheck.allowed) {
    return res.status(429).json({
      error: true,
      message: 'Registration rate limit exceeded (global). Try again later.',
      code: 'RATE_LIMIT_GLOBAL',
      retryAfter: globalCheck.resetAt.toISOString()
    });
  }

  // Check per-IP limit
  const ipCheck = ipRegistrationLimiter.check(ip);
  if (!ipCheck.allowed) {
    return res.status(429).json({
      error: true,
      message: 'Registration rate limit exceeded (per IP). Max 5 per hour.',
      code: 'RATE_LIMIT_IP',
      retryAfter: ipCheck.resetAt.toISOString(),
      remaining: ipCheck.remaining
    });
  }

  res.set('X-RateLimit-Remaining', String(ipCheck.remaining));
  next();
}

/**
 * Middleware: general API rate limiting
 */
export function apiRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const check = apiLimiter.check(ip);

  res.set('X-RateLimit-Remaining', String(check.remaining));

  if (!check.allowed) {
    return res.status(429).json({
      error: true,
      message: 'API rate limit exceeded. Max 120 requests per minute.',
      code: 'RATE_LIMIT_API',
      retryAfter: check.resetAt.toISOString()
    });
  }

  next();
}
