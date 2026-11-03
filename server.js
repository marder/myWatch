const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./config');
const db = require('./src/db');
const fetcher = require('./src/fetcher');
const analyzer = require('./src/analyzer');
const allocator = require('./src/allocator');
const scheduler = require('./src/scheduler');
const auth = require('./src/auth');
const mailer = require('./src/mailer');

const app = express();
const startTime = Date.now();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Wymagane podanie loginu i hasła.' });
  }

  if (!auth.verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
  }

  const token = auth.createSessionToken();
  res.json({
    success: true,
    token,
    user: username,
    message: 'Zalogowano pomyślnie jako administrator.',
  });
});

/**
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', auth.requireAuth, (req, res) => {
  const token = req.headers.authorization?.slice(7).trim();
  if (token) {
    auth.revokeToken(token);
  }
  res.json({ success: true, message: 'Wylogowano pomyślnie.' });
});

/**
 * GET /api/auth/me
 */
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.slice(7).trim();
  // Check if token exists
  try {
    auth.requireAuth(req, res, () => {
      res.json({ authenticated: true, user: config.auth.adminUser });
    });
  } catch (e) {
    res.json({ authenticated: false });
  }
});

// ==========================================
// ADMIN DATABASE MANAGEMENT ENDPOINTS (PROTECTED)
// ==========================================

/**
 * GET /api/admin/db/download
 * Flushes SQLite WAL and sends macro_radar.db as an attachment
 */
app.get('/api/admin/db/download', auth.requireAuth, (req, res) => {
  try {
    const database = db.getDb();
    // Flush WAL to main DB file before export
    database.pragma('wal_checkpoint(TRUNCATE)');

    const dbPath = config.dbPath;
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Plik bazy danych nie istnieje.' });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const downloadName = `macro_radar_backup_${dateStr}.db`;

    res.download(dbPath, downloadName, (err) => {
      if (err) {
        console.error('[Admin] Błąd podczas wysyłania pliku bazy:', err);
      } else {
        console.log(`[Admin] Wyeksportowano kopię bazy danych (${downloadName})`);
      }
    });
  } catch (err) {
    console.error('Error in /api/admin/db/download:', err);
    res.status(500).json({ error: 'Nie udało się przygotować pliku bazy danych do pobrania', message: err.message });
  }
});

/**
 * POST /api/admin/db/email-backup
 * Triggers an immediate database backup to email
 * Body: { recipientEmail? }
 */
app.post('/api/admin/db/email-backup', auth.requireAuth, async (req, res) => {
  try {
    const { recipientEmail } = req.body || {};
    const result = await mailer.sendDatabaseBackupEmail(recipientEmail);
    res.json({
      success: true,
      message: `Kopia bazy danych została pomyślnie wysłana na adres: ${result.recipient}`,
      details: result,
    });
  } catch (err) {
    console.error('Error in /api/admin/db/email-backup:', err);
    res.status(500).json({
      error: 'Błąd podczas wysyłki kopii bazy danych na e-mail',
      message: err.message,
    });
  }
});

/**
 * POST /api/admin/db/backfill
 * Runs custom backfill for N days (e.g. 60, 120, 250)
 * Body: { days }
 */
app.post('/api/admin/db/backfill', auth.requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.body?.days, 10) || 60;
    const result = await scheduler.runBackfill(days);
    res.json(result);
  } catch (err) {
    console.error('Error in /api/admin/db/backfill:', err);
    res.status(500).json({ error: 'Błąd podczas uruchamiania backfillu', message: err.message });
  }
});

/**
 * GET /api/admin/db/stats
 * Detailed database and backup status
 */
app.get('/api/admin/db/stats', auth.requireAuth, (req, res) => {
  try {
    const dbPath = config.dbPath;
    let sizeKb = 0;
    if (fs.existsSync(dbPath)) {
      sizeKb = (fs.statSync(dbPath).size / 1024).toFixed(1);
    }
    const info = db.getOldestAndLatestTimestamp();

    res.json({
      dbPath,
      sizeKb: parseFloat(sizeKb),
      recordsCount: info.count,
      oldestTimestamp: info.oldest,
      latestTimestamp: info.latest,
      smtpConfigured: Boolean(config.emailBackup.smtp?.host && config.emailBackup.to),
      emailBackupTo: config.emailBackup.to || null,
      emailBackupSchedule: config.emailBackup.schedule,
    });
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania statystyk bazy', message: err.message });
  }
});

// ==========================================
// PUBLIC FINANCIAL ANALYTICS REST API
// ==========================================

/**
 * GET /api/latest
 * Returns the most recent reading with parsed warnings, conclusions, plain language, and GPW indices
 */
app.get('/api/latest', (req, res) => {
  try {
    const latest = db.getLatestReading();
    if (!latest) {
      return res.status(404).json({ error: 'Brak danych. Baza danych może być w trakcie inicjalizacji.' });
    }
    // Ensure portfolio_recommendation is always present even on legacy records
    if (latest.conclusions && !latest.conclusions.portfolio_recommendation) {
      latest.conclusions.portfolio_recommendation = allocator.getFullPortfolioRecommendation(latest.risk_score, latest);
    }
    res.json(latest);
  } catch (err) {
    console.error('Error fetching /api/latest:', err);
    res.status(500).json({ error: 'Nie udało się pobrać najnowszego odczytu', message: err.message });
  }
});

/**
 * GET /api/history?limit=60
 * Returns the last `limit` readings ordered by timestamp ASC for charting
 */
app.get('/api/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 60;
    const history = db.getHistory(limit);
    res.json(history);
  } catch (err) {
    console.error('Error fetching /api/history:', err);
    res.status(500).json({ error: 'Nie udało się pobrać historii odczytów', message: err.message });
  }
});

/**
 * POST /api/refresh
 * Triggers an immediate fetch & calculation for the latest market data
 */
app.post('/api/refresh', async (req, res) => {
  try {
    const result = await scheduler.runUpdate();
    if (!result.success) {
      return res.status(429).json({ error: result.message });
    }
    res.json({
      success: true,
      data: result.reading,
      elapsedMs: result.elapsedMs,
    });
  } catch (err) {
    console.error('Error in /api/refresh:', err);
    res.status(500).json({ error: 'Ręczne odświeżenie nie powiodło się', message: err.message });
  }
});

/**
 * GET /api/news
 * Returns top economic news with titles, descriptions, and direct URLs
 */
app.get('/api/news', async (req, res) => {
  try {
    const news = await fetcher.fetchEconomicNews();
    res.json(news);
  } catch (err) {
    console.error('Error in /api/news:', err);
    res.status(500).json({ error: 'Nie udało się pobrać wiadomości gospodarczych', message: err.message });
  }
});

/**
 * GET /api/gpw-indices
 * Returns key GPW indices overview (WIG, WIG20, mWIG40, sWIG80, WIG-Banki)
 */
app.get('/api/gpw-indices', (req, res) => {
  try {
    const latest = db.getLatestReading();
    const gpwIndices = latest?.conclusions?.gpw_indices || [];
    res.json(gpwIndices);
  } catch (err) {
    console.error('Error in /api/gpw-indices:', err);
    res.status(500).json({ error: 'Nie udało się pobrać notowań GPW', message: err.message });
  }
});

/**
 * GET /api/allocation
 * Returns dynamic OKI portfolio allocation weights and concrete instruments
 */
app.get('/api/allocation', (req, res) => {
  try {
    const latest = db.getLatestReading();
    const riskScore = latest ? latest.risk_score : 15;
    const recommendation = allocator.getFullPortfolioRecommendation(riskScore, latest || {});
    res.json(recommendation);
  } catch (err) {
    console.error('Error in /api/allocation:', err);
    res.status(500).json({ error: 'Nie udało się wygenerować rekomendacji alokacji', message: err.message });
  }
});

/**
 * POST /api/allocation/calculate
 * Calculates monthly contribution breakdown in PLN across specific instruments
 * Body: { amountPln: number }
 */
app.post('/api/allocation/calculate', (req, res) => {
  try {
    const amountPln = parseFloat(req.body?.amountPln) || 0;
    const latest = db.getLatestReading();
    const riskScore = latest ? latest.risk_score : 15;
    const split = allocator.calculateContributionSplit(amountPln, riskScore, latest || {});
    res.json(split);
  } catch (err) {
    console.error('Error in /api/allocation/calculate:', err);
    res.status(500).json({ error: 'Błąd podczas kalkulacji podziału wpłaty', message: err.message });
  }
});

/**
 * GET /api/health
 * Returns status, record count, latest timestamp, and uptime
 */
app.get('/api/health', (req, res) => {
  try {
    const info = db.getOldestAndLatestTimestamp();
    res.json({
      status: 'OK',
      recordsCount: info.count,
      lastTimestamp: info.latest,
      oldestTimestamp: info.oldest,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

/**
 * Fallback to index.html for SPA-style routing if needed
 */
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

/**
 * Startup backfill and server launch
 */
async function startServer() {
  db.getDb();

  const count = db.getRecordCount();
  console.log(`[Startup] Current database record count: ${count}`);

  if (count < 30) {
    console.log(`[Startup] Database has fewer than 30 records. Initiating ${config.backfillDays}-day historical backfill...`);
    try {
      await scheduler.runBackfill(config.backfillDays);
      console.log(`[Startup] Historical backfill complete!`);
    } catch (err) {
      console.error('[Startup] Failed to complete historical backfill:', err);
    }
  }

  scheduler.startCronJob();

  const server = app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(` Poland Macro Crisis Radar server is listening`);
    console.log(` Local URL: http://localhost:${config.port}`);
    console.log(` Database:  ${config.dbPath}`);
    console.log(` Admin:     ${config.auth.adminUser ? config.auth.adminUser + ' / [PROTECTED]' : '[BRAK SKONFIGUROWANYCH DANYCH W .ENV]'}`);
    console.log(` Cron:      ${config.cronSchedule} (${config.timezone})`);
    console.log(`=======================================================`);
  });

  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    server.close(() => {
      db.closeDb();
      console.log('[Server] Closed all connections. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
