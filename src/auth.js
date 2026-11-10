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
 * Supports Bearer tokens, HTTP Basic Auth (for curl/scripts), and query tokens
 */
function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;

  // 1. Support HTTP Basic Auth (curl -u user:password ...)
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf-8');
      const [user, ...passParts] = credentials.split(':');
      const pass = passParts.join(':');
      if (verifyCredentials(user, pass)) {
        return next();
      }
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło (Basic Auth).' });
    } catch (e) {
      return res.status(401).json({ error: 'Błąd dekodowania nagłówka Basic Auth.' });
    }
  }

  // 2. Support Bearer token (Web dashboard)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    // 3. Support Query token parameter (?token=...)
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Wymagana autoryzacja (Brak tokenu lub nagłówka Basic Auth).' });
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
