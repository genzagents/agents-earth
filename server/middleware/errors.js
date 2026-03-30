/**
 * AgentColony v9 — Error Handling Middleware
 */

/**
 * Express error handler. Returns consistent JSON error responses.
 */
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: true,
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
}

/**
 * Create an HTTP error with status code
 */
export function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code || 'ERROR';
  return err;
}
