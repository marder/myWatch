const crypto = require('crypto');
const config = require('../config');

// In-memory token store for admin sessions
const activeTokens = new Set();

/**
 * Validate admin credentials
 */
function verifyCredentials(username, password) {
  if (!config.auth.adminUser || !config.auth.adminPassword) {
    console.error('[Auth] Błąd: Brak zdefiniowanego ADMIN_USER lub ADMIN_PASSWORD w pliku .env!');
    return false;
  }
  return username === config.auth.adminUser && password === config.auth.adminPassword;
}

/**
 * Generate a cryptographically secure session token
 */
function createSessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.add(token);
  return token;
}

/**
 * Invalidate a session token
 */
function revokeToken(token) {
  activeTokens.delete(token);
}

/**
 * Express middleware to protect admin endpoints
 */
function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Wymagana autoryzacja (Brak tokenu).' });
  }

  if (!activeTokens.has(token)) {
    return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token sesji.' });
  }

  next();
}

module.exports = {
  verifyCredentials,
  createSessionToken,
  revokeToken,
  requireAuth,
};
