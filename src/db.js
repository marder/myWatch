const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let isNativeSqlite = false;

function createDbInstance(dbPath) {
  try {
    const BetterSqlite = require('better-sqlite3');
    // Test if bindings exist
    const probe = new BetterSqlite(':memory:');
    probe.close();
    return new BetterSqlite(dbPath);
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    isNativeSqlite = true;
    console.log('[DB] Running on Node.js built-in DatabaseSync (node:sqlite) engine.');
    return new DatabaseSync(dbPath);
  }
}

function getDb() {
  if (db) return db;

  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = createDbInstance(config.dbPath);

  // Polyfill helper methods if using node:sqlite DatabaseSync
  if (isNativeSqlite) {
    if (typeof db.pragma !== 'function') {
      db.pragma = (str) => {
        try {
          return db.exec(`PRAGMA ${str};`);
        } catch (e) {
          console.warn('[DB] Pragma warning:', e.message);
        }
      };
    }

    if (typeof db.transaction !== 'function') {
      db.transaction = (fn) => {
        return (...args) => {
          db.exec('BEGIN IMMEDIATE;');
          try {
            const res = fn(...args);
            db.exec('COMMIT;');
            return res;
          } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
          }
        };
      };
    }
  }

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  initSchema(db);
  return db;
}

function initSchema(database) {
  const schema = `
    CREATE TABLE IF NOT EXISTS macro_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT UNIQUE NOT NULL,
      pl10y REAL,
      pl2y REAL,
      de10y REAL,
      spread_10y_2y REAL,
      spread_pl_de INTEGER,
      usd_pln REAL,
      usd_pln_30d_chg REAL,
      eur_pln REAL,
      eur_pln_30d_chg REAL,
      wig REAL,
      wig_sma200 REAL,
      wig_sma200_diff REAL,
      risk_score INTEGER,
      score_curve INTEGER,
      score_sovereign INTEGER,
      score_fx INTEGER,
      score_equities INTEGER,
      status TEXT,
      warnings_json TEXT,
      conclusions_json TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_macro_readings_timestamp ON macro_readings(timestamp);
  `;
  database.exec(schema);
}

function parseRow(row) {
  if (!row) return null;
  const parsed = { ...row };
  try {
    parsed.warnings = row.warnings_json ? JSON.parse(row.warnings_json) : [];
  } catch (e) {
    parsed.warnings = [];
  }
  try {
    parsed.conclusions = row.conclusions_json ? JSON.parse(row.conclusions_json) : {};
  } catch (e) {
    parsed.conclusions = {};
  }
  return parsed;
}

const UPSERT_SQL = `
  INSERT INTO macro_readings (
    timestamp, pl10y, pl2y, de10y, spread_10y_2y, spread_pl_de,
    usd_pln, usd_pln_30d_chg, eur_pln, eur_pln_30d_chg,
    wig, wig_sma200, wig_sma200_diff,
    risk_score, score_curve, score_sovereign, score_fx, score_equities,
    status, warnings_json, conclusions_json, updated_at
  ) VALUES (
    @timestamp, @pl10y, @pl2y, @de10y, @spread_10y_2y, @spread_pl_de,
    @usd_pln, @usd_pln_30d_chg, @eur_pln, @eur_pln_30d_chg,
    @wig, @wig_sma200, @wig_sma200_diff,
    @risk_score, @score_curve, @score_sovereign, @score_fx, @score_equities,
    @status, @warnings_json, @conclusions_json, @updated_at
  )
  ON CONFLICT(timestamp) DO UPDATE SET
    pl10y = excluded.pl10y,
    pl2y = excluded.pl2y,
    de10y = excluded.de10y,
    spread_10y_2y = excluded.spread_10y_2y,
    spread_pl_de = excluded.spread_pl_de,
    usd_pln = excluded.usd_pln,
    usd_pln_30d_chg = excluded.usd_pln_30d_chg,
    eur_pln = excluded.eur_pln,
    eur_pln_30d_chg = excluded.eur_pln_30d_chg,
    wig = excluded.wig,
    wig_sma200 = excluded.wig_sma200,
    wig_sma200_diff = excluded.wig_sma200_diff,
    risk_score = excluded.risk_score,
    score_curve = excluded.score_curve,
    score_sovereign = excluded.score_sovereign,
    score_fx = excluded.score_fx,
    score_equities = excluded.score_equities,
    status = excluded.status,
    warnings_json = excluded.warnings_json,
    conclusions_json = excluded.conclusions_json,
    updated_at = excluded.updated_at;
`;

function upsertReading(record) {
  const database = getDb();
  const stmt = database.prepare(UPSERT_SQL);
  const now = new Date().toISOString();
  stmt.run({
    timestamp: record.timestamp,
    pl10y: record.pl10y ?? null,
    pl2y: record.pl2y ?? null,
    de10y: record.de10y ?? null,
    spread_10y_2y: record.spread_10y_2y ?? null,
    spread_pl_de: record.spread_pl_de ?? null,
    usd_pln: record.usd_pln ?? null,
    usd_pln_30d_chg: record.usd_pln_30d_chg ?? null,
    eur_pln: record.eur_pln ?? null,
    eur_pln_30d_chg: record.eur_pln_30d_chg ?? null,
    wig: record.wig ?? null,
    wig_sma200: record.wig_sma200 ?? null,
    wig_sma200_diff: record.wig_sma200_diff ?? null,
    risk_score: record.risk_score ?? 0,
    score_curve: record.score_curve ?? 0,
    score_sovereign: record.score_sovereign ?? 0,
    score_fx: record.score_fx ?? 0,
    score_equities: record.score_equities ?? 0,
    status: record.status || 'STABILNY',
    warnings_json: typeof record.warnings_json === 'string' ? record.warnings_json : JSON.stringify(record.warnings || []),
    conclusions_json: typeof record.conclusions_json === 'string' ? record.conclusions_json : JSON.stringify(record.conclusions || {}),
    updated_at: record.updated_at || now,
  });
}

function bulkUpsertReadings(records) {
  const database = getDb();
  const stmt = database.prepare(UPSERT_SQL);
  const insertMany = database.transaction((items) => {
    const now = new Date().toISOString();
    for (const item of items) {
      stmt.run({
        timestamp: item.timestamp,
        pl10y: item.pl10y ?? null,
        pl2y: item.pl2y ?? null,
        de10y: item.de10y ?? null,
        spread_10y_2y: item.spread_10y_2y ?? null,
        spread_pl_de: item.spread_pl_de ?? null,
        usd_pln: item.usd_pln ?? null,
        usd_pln_30d_chg: item.usd_pln_30d_chg ?? null,
        eur_pln: item.eur_pln ?? null,
        eur_pln_30d_chg: item.eur_pln_30d_chg ?? null,
        wig: item.wig ?? null,
        wig_sma200: item.wig_sma200 ?? null,
        wig_sma200_diff: item.wig_sma200_diff ?? null,
        risk_score: item.risk_score ?? 0,
        score_curve: item.score_curve ?? 0,
        score_sovereign: item.score_sovereign ?? 0,
        score_fx: item.score_fx ?? 0,
        score_equities: item.score_equities ?? 0,
        status: item.status || 'STABILNY',
        warnings_json: typeof item.warnings_json === 'string' ? item.warnings_json : JSON.stringify(item.warnings || []),
        conclusions_json: typeof item.conclusions_json === 'string' ? item.conclusions_json : JSON.stringify(item.conclusions || {}),
        updated_at: item.updated_at || now,
      });
    }
  });
  insertMany(records);
}

function getLatestReading() {
  const database = getDb();
  const row = database.prepare('SELECT * FROM macro_readings ORDER BY timestamp DESC LIMIT 1').get();
  return parseRow(row);
}

function getHistory(limit = 60) {
  const database = getDb();
  const num = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 300);
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT * FROM macro_readings ORDER BY timestamp DESC LIMIT ?
    ) ORDER BY timestamp ASC
  `).all(num);
  return rows.map(parseRow);
}

function getRecordCount() {
  const database = getDb();
  const row = database.prepare('SELECT COUNT(*) as count FROM macro_readings').get();
  return row ? row.count : 0;
}

function getOldestAndLatestTimestamp() {
  const database = getDb();
  const row = database.prepare(`
    SELECT MIN(timestamp) as oldest, MAX(timestamp) as latest, COUNT(*) as count
    FROM macro_readings
  `).get();
  return row || { oldest: null, latest: null, count: 0 };
}

function closeDb() {
  if (db) {
    try {
      if (typeof db.close === 'function') {
        db.close();
      }
    } catch (e) {
      console.error('Error closing database:', e);
    }
    db = null;
  }
}

module.exports = {
  getDb,
  upsertReading,
  bulkUpsertReadings,
  getLatestReading,
  getHistory,
  getRecordCount,
  getOldestAndLatestTimestamp,
  closeDb,
};
