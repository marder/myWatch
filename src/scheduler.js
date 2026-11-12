const cron = require('node-cron');
const config = require('../config');
const fetcher = require('./fetcher');
const analyzer = require('./analyzer');
const db = require('./db');
const mailer = require('./mailer');
const notifier = require('./notifier');
const holidayCalendar = require('./holidayCalendar');

let isUpdating = false;

/**
 * Perform market data fetch, indicator computation, and save to SQLite.
 */
async function runUpdate() {
  if (isUpdating) {
    console.log('[Scheduler] Update already in progress. Skipping concurrent request.');
    return { success: false, message: 'Update already in progress' };
  }

  isUpdating = true;
  console.log('[Scheduler] Starting market data refresh...');
  const startTime = Date.now();

  try {
    const indicators = await fetcher.fetchAllIndicators();
    const latestReading = analyzer.processLatestReading(indicators);

    db.upsertReading(latestReading);

    // Dispatch push and email notifications
    try {
      const notifyResult = await notifier.dispatchSessionNotifications(latestReading);
      console.log('[Scheduler] Notifications dispatch result:', JSON.stringify(notifyResult));
    } catch (err) {
      console.warn('[Scheduler] Session notifications error:', err.message);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Scheduler] Successfully refreshed and saved reading for ${latestReading.timestamp} (Score: ${latestReading.risk_score}, Status: ${latestReading.status}) in ${elapsed}ms`);

    return {
      success: true,
      reading: db.getLatestReading(),
      elapsedMs: elapsed,
    };
  } catch (err) {
    console.error('[Scheduler] Error during market data refresh:', err);
    throw err;
  } finally {
    isUpdating = false;
  }
}

/**
 * Perform deep backfill for a requested number of days
 */
async function runBackfill(requestedDays) {
  const days = Math.min(Math.max(parseInt(requestedDays, 10) || config.backfillDays, 10), 300);
  console.log(`[Scheduler] Running backfill for ${days} trading sessions...`);
  const indicators = await fetcher.fetchAllIndicators();
  const backfillReadings = analyzer.processHistoricalBackfill(indicators, days);
  db.bulkUpsertReadings(backfillReadings);
  console.log(`[Scheduler] Completed backfill for ${backfillReadings.length} sessions.`);
  return {
    success: true,
    count: backfillReadings.length,
    oldest: backfillReadings[0]?.timestamp,
    latest: backfillReadings[backfillReadings.length - 1]?.timestamp,
  };
}

/**
 * Initialize node-cron schedules
 */
function startCronJob() {
  const schedule = config.cronSchedule;
  const timezone = config.timezone;

  console.log(`[Scheduler] Initializing post-market cron: '${schedule}' (${timezone}) - GPW closes at 17:05, notification at 17:10`);

  cron.schedule(schedule, async () => {
    console.log(`[Scheduler] Post-market trigger activated at ${new Date().toISOString()}`);
    const marketStatus = holidayCalendar.getMarketStatus();
    if (marketStatus.isHoliday && marketStatus.isGpwClosed) {
      console.log(`[Scheduler] Dziś na GPW nie ma sesji ze względu na święto: ${marketStatus.holidayName}. Pomijanie automatycznej aktualizacji.`);
      return;
    }
    if (marketStatus.isWeekend) {
      console.log(`[Scheduler] Dziś jest weekend — giełda GPW nie handluje. Pomijanie powiadomienia.`);
      return;
    }
    try {
      await runUpdate();
    } catch (err) {
      console.error('[Scheduler] Scheduled refresh failed:', err.message);
      try {
        const latestReading = db.getLatestReading();
        if (latestReading) {
          console.log('[Scheduler] Dispatching fallback latest reading after refresh error...');
          await notifier.dispatchSessionNotifications(latestReading);
        }
      } catch (notifyErr) {
        console.error('[Scheduler] Fallback notification also failed:', notifyErr.message);
      }
    }
  }, {
    scheduled: true,
    timezone,
  });

  // Scheduled Email Backup (e.g. weekly)
  if (config.emailBackup.enabled && config.emailBackup.to) {
    console.log(`[Scheduler] Initializing email backup cron: '${config.emailBackup.schedule}' to ${config.emailBackup.to}`);
    cron.schedule(config.emailBackup.schedule, async () => {
      console.log('[Scheduler] Triggering scheduled database backup email...');
      try {
        await mailer.sendDatabaseBackupEmail();
      } catch (err) {
        console.error('[Scheduler] Scheduled email backup failed:', err.message);
      }
    }, {
      scheduled: true,
      timezone,
    });
  }
}

module.exports = {
  startCronJob,
  runUpdate,
  runBackfill,
  isUpdating: () => isUpdating,
};
