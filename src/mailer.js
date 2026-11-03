const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./db');

/**
 * Create SMTP transporter
 */
function getTransporter() {
  const smtp = config.emailBackup.smtp;
  if (!smtp || !smtp.host) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: parseInt(smtp.port, 10) || 587,
    secure: smtp.secure || false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {
      rejectUnauthorized: smtp.rejectUnauthorized !== false,
    }
  });
}

/**
 * Send database backup email with attached SQLite database file
 */
async function sendDatabaseBackupEmail(recipientEmail = null) {
  const targetEmail = recipientEmail || config.emailBackup.to;
  if (!targetEmail) {
    throw new Error('Brak zdefiniowanego adresu odbiorcy (BACKUP_EMAIL_TO).');
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Serwer pocztowy SMTP nie został skonfigurowany. Ustaw dane serwera SMTP w config.js lub w zmiennych środowiskowych.');
  }

  // Ensure WAL is flushed to disk before backup
  const database = db.getDb();
  try {
    database.pragma('wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.warn('[Mailer] WAL checkpoint warning:', err.message);
  }

  const dbPath = config.dbPath;
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Plik bazy danych nie istnieje pod ścieżką: ${dbPath}`);
  }

  const stats = fs.statSync(dbPath);
  const sizeKb = (stats.size / 1024).toFixed(1);
  const info = db.getOldestAndLatestTimestamp();
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `macro_radar_backup_${dateStr}.db`;

  const mailOptions = {
    from: config.emailBackup.from || '"Poland Macro Crisis Radar" <backup@macro-radar.local>',
    to: targetEmail,
    subject: `[Kopia Zapasowa] Baza danych Poland Macro Crisis Radar (${dateStr})`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; color: #1e293b;">
        <h2 style="color: #0284c7; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          Poland Macro Crisis Radar — Kopia Bazy Danych
        </h2>
        <p>Przesyłamy automatyczną kopię zapasową bazy danych SQLite z aplikacji <strong>Poland Macro Crisis Radar</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr style="background: #f8fafc;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Data utworzenia kopii:</strong></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${new Date().toLocaleString('pl-PL')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Rozmiar pliku:</strong></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${sizeKb} KB</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Liczba zarejestrowanych sesji:</strong></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${info.count}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Zakres danych:</strong></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">od ${info.oldest || '--'} do ${info.latest || '--'}</td>
          </tr>
        </table>
        <p style="font-size: 13px; color: #64748b;">
          Plik SQLite <code>${fileName}</code> znajduje się w załączniku tej wiadomości. Można go otworzyć w dowolnej przeglądarce SQLite (np. DB Browser for SQLite, DBeaver) lub przenieść na inny serwer.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: fileName,
        path: dbPath,
      }
    ]
  };

  const result = await transporter.sendMail(mailOptions);
  console.log(`[Mailer] Backup email successfully sent to ${targetEmail} (MessageId: ${result.messageId})`);
  return {
    success: true,
    recipient: targetEmail,
    messageId: result.messageId,
    fileSizeKb: sizeKb,
  };
}

module.exports = {
  getTransporter,
  sendDatabaseBackupEmail,
};
