/**
 * AgentColony v9 — Authentication Middleware
 * 
 * Token-based auth for agent actions.
 * Agents receive a token on registration and must include it
 * in the Authorization header for authenticated endpoints.
 */

import { httpError } from './errors.js';

/**
 * Middleware: require a valid agent token.
 * Attaches the agent row to req.agent if valid.
 */
export function requireAuth(db) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(httpError(401, 'Authorization header required. Use: Bearer <token>', 'AUTH_REQUIRED'));
    }

    const token = authHeader.slice(7).trim();
    if (!token || !token.startsWith('ac_live_')) {
      return next(httpError(401, 'Invalid token format', 'INVALID_TOKEN'));
    }

    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (!agent) {
      return next(httpError(401, 'Invalid or expired token', 'TOKEN_NOT_FOUND'));
    }

    if (agent.status === 'suspended') {
      return next(httpError(403, 'Agent is suspended', 'AGENT_SUSPENDED'));
    }

    req.agent = agent;
    next();
  };
}

/**
 * Middleware: optionally authenticate.
 * If a token is provided, validates it. If not, continues without auth.
 */
export function optionalAuth(db) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    if (!authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.slice(7).trim();
    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (agent) {
      req.agent = agent;
    }
    next();
  };
}
