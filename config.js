const path = require('path');
const fs = require('fs');

// Automatically load .env file if it exists
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn('[Config] Warning loading .env file:', err.message);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8000,
  dbPath: path.resolve(__dirname, './data/macro_radar.db'),
  cronSchedule: process.env.CRON_SCHEDULE || '30 18 * * 1-5',
  timezone: 'Europe/Warsaw',

  // Authentication configuration (strictly sourced from environment / .env)
  auth: {
    adminUser: process.env.ADMIN_USER || null,
    adminPassword: process.env.ADMIN_PASSWORD || null,
  },

  // Automated Email Backup configuration
  emailBackup: {
    enabled: process.env.EMAIL_BACKUP_ENABLED === 'true',
    schedule: process.env.EMAIL_BACKUP_SCHEDULE || '0 3 * * 0', // Every Sunday at 03:00 Europe/Warsaw
    to: process.env.BACKUP_EMAIL_TO || '',
    from: process.env.EMAIL_BACKUP_FROM || '"Macro Radar Backup" <backup@macro-radar.local>',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    }
  },

  fetcher: {
    timeoutMs: 12000,
    retryCount: 1,
    retryDelayMs: 1500,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    enableStooq: process.env.ENABLE_STOOQ !== 'false',
    enableTradingView: true,
    tradingViewUrls: {
      bonds: 'https://scanner.tradingview.com/bonds/scan',
      poland: 'https://scanner.tradingview.com/poland/scan',
    },
    nbpUrls: {
      usd: 'https://api.nbp.pl/api/exchangerates/rates/a/usd/last/255/?format=json',
      eur: 'https://api.nbp.pl/api/exchangerates/rates/a/eur/last/255/?format=json',
    },
    stooqBaseUrl: 'https://stooq.pl/q/d/l/?s=',
    stooqSymbols: {
      pl10y: '10ply.b',
      pl2y: '02ply.b',
      de10y: '10dey.b',
      wig: 'wig',
      wig20: 'wig20',
      mwig40: 'mwig40',
      swig80: 'swig80',
      wig_banki: 'wig_banki',
    },
    news: {
      bankierRss: 'https://www.bankier.pl/rss/wiadomosci.xml',
      tvn24Rss: 'https://tvn24.pl/biznes-najnowsze.xml',
      cacheTtlMs: 5 * 60 * 1000,
    }
  },

  backfillDays: parseInt(process.env.BACKFILL_DAYS, 10) || 250,
  wigHistoryDays: parseInt(process.env.WIG_HISTORY_DAYS, 10) || 460, // full year backfill + SMA200 lookback window

  // Risk Scoring Thresholds & Weights
  scoring: {
    pillar1_curve: {
      maxPoints: 30,
      deepInversion: -0.35,
      inversion: -0.10,
      flatMax: 0.15,
      selloff20dThreshold: 0.50
    },
    pillar2_sovereign: {
      maxPoints: 25,
      criticalBps: 400,
      highBps: 330,
      elevatedBps: 270
    },
    pillar3_fx: {
      maxPoints: 25,
      criticalUsdChg: 6.5,
      criticalEurChg: 4.5,
      elevatedUsdChg: 4.0,
      elevatedEurChg: 2.5,
      mildUsdChg: 2.0
    },
    pillar4_equities: {
      maxPoints: 20,
      bearSmaDiff: -12.0,
      weakSmaDiff: -3.0,
      correction20d: -8.0
    },
    statusBands: [
      { min: 76, max: 100, label: 'ALARM KRYZYSOWY', color: 'rose' },
      { min: 51, max: 75, label: 'PODWYŻSZONE RYZYKO', color: 'orange' },
      { min: 26, max: 50, label: 'OSTRZEŻENIE', color: 'amber' },
      { min: 0, max: 25, label: 'STABILNY', color: 'emerald' },
    ]
  }
};
