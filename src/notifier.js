const config = require('../config');
const mailer = require('./mailer');

/**
 * Format tag, emoji, and numeric priority based on risk status
 */
function getStatusVisuals(status, riskScore) {
  switch (status) {
    case 'ALARM KRYZYSOWY':
      return {
        tag: 'rotating_light,fire',
        priority: 5,
        badgeColor: '#e11d48', // rose-600
        textColor: '#ffe4e6',
        emoji: '🚨',
      };
    case 'PODWYŻSZONE RYZYKO':
      return {
        tag: 'warning,chart_with_downwards_trend',
        priority: 4,
        badgeColor: '#ea580c', // orange-600
        textColor: '#ffedd5',
        emoji: '🟠',
      };
    case 'OSTRZEŻENIE':
      return {
        tag: 'caution,eyes',
        priority: 3,
        badgeColor: '#d97706', // amber-600
        textColor: '#fef3c7',
        emoji: '🟡',
      };
    case 'STABILNY':
    default:
      return {
        tag: 'white_check_mark,chart_with_upwards_trend',
        priority: 3,
        badgeColor: '#059669', // emerald-600
        textColor: '#d1fae5',
        emoji: '🟢',
      };
  }
}

/**
 * Converts priority to integer (1..5) as required by ntfy JSON API
 */
function mapPriorityToInt(priority) {
  if (typeof priority === 'number') return Math.min(Math.max(priority, 1), 5);
  switch (String(priority).toLowerCase()) {
    case '5':
    case 'max':
    case 'urgent':
      return 5;
    case '4':
    case 'high':
      return 4;
    case '2':
    case 'low':
      return 2;
    case '1':
    case 'min':
      return 1;
    case '3':
    case 'default':
    default:
      return 3;
  }
}

/**
 * Send Push Notification via ntfy.sh (No registration required)
 * Uses native JSON body to fully support UTF-8 (emojis and Polish characters)
 */
async function sendNtfyNotification({ title, message, priority, tags, clickUrl, topic } = {}) {
  if (!config.ntfy.enabled) {
    return { skipped: true, reason: 'Powiadomienia ntfy.sh są wyłączone w konfiguracji.' };
  }

  const targetTopic = topic || config.ntfy.topic;
  if (!targetTopic) {
    throw new Error('Brak zdefiniowanego tematu ntfy.sh (NTFY_TOPIC).');
  }

  const serverUrl = config.ntfy.server.replace(/\/+$/, '');
  const tagsList = typeof tags === 'string'
    ? tags.split(',').map(t => t.trim()).filter(Boolean)
    : (Array.isArray(tags) ? tags : ['chart_with_upwards_trend']);

  const payload = {
    topic: targetTopic,
    title: title || 'Poland Macro Crisis Radar',
    message: message || 'Nowy odczyt wskaźników makro i rekomendacji portfela OKI.',
    priority: mapPriorityToInt(priority),
    tags: tagsList,
    click: clickUrl || config.ntfy.clickUrl || 'https://watch.mikrus.dev',
  };

  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ntfy.sh zwrócił status HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[Notifier] Pomyślnie wysłano powiadomienie push ntfy na temat '${targetTopic}'`);
    return {
      success: true,
      topic: targetTopic,
      url: `${serverUrl}/${targetTopic}`,
      response: data,
    };
  } catch (err) {
    console.error('[Notifier] Błąd wysyłki powiadomienia ntfy.sh:', err.message);
    throw err;
  }
}

/**
 * Send Daily Market & Macro HTML Email Digest
 */
async function sendDailyDigestEmail(reading, recipientEmail = null) {
  const targetEmail = recipientEmail || config.emailDigest.to;
  if (!targetEmail) {
    throw new Error('Brak zdefiniowanego adresu odbiorcy raportu e-mail (EMAIL_DIGEST_TO).');
  }

  const transporter = mailer.getTransporter();
  if (!transporter) {
    throw new Error('Serwer pocztowy SMTP nie został skonfigurowany. Ustaw dane serwera SMTP w pliku .env.');
  }

  const r = reading || {};
  const status = r.status || 'STABILNY';
  const riskScore = r.risk_score != null ? r.risk_score : 15;
  const dateStr = r.timestamp || new Date().toISOString().slice(0, 10);
  const visuals = getStatusVisuals(status, riskScore);

  const conclusions = r.conclusions || {};
  const rec = conclusions.portfolio_recommendation || {};
  const weights = rec.weights || { globalEquities: 50, polishEquities: 15, treasuryBonds: 30, cashAndGold: 5 };
  const val = conclusions.fundamental_valuation || {};

  const dashboardUrl = config.ntfy.clickUrl || 'https://watch.mikrus.dev';

  const mailOptions = {
    from: config.emailDigest.from || '"Poland Macro Crisis Radar" <radar@macro-radar.local>',
    to: targetEmail,
    subject: `[Raport Makro] ${visuals.emoji} Sesja ${dateStr}: ${status} (${riskScore}/100 pkt) — Wytyczne OKI`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Poland Macro Crisis Radar</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1;">
        <div style="max-width: 650px; margin: 0 auto; padding: 24px 16px;">
          
          <!-- BRAND HEADER -->
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #1e293b;">
            <h1 style="margin: 0; font-size: 20px; color: #f8fafc; font-weight: 800; letter-spacing: -0.5px;">
              Poland Macro Crisis Radar
            </h1>
            <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
              Raport zamknięcia sesji giełdowej &bull; ${dateStr}
            </p>
          </div>

          <!-- STATUS & REGIME CARD -->
          <div style="margin-top: 20px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; border-radius: 20px; background-color: ${visuals.badgeColor}; color: ${visuals.textColor}; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
              ${visuals.emoji} ${status} &bull; Ryzyko: ${riskScore} / 100
            </div>
            <h2 style="margin: 0 0 10px; font-size: 17px; color: #f8fafc; font-weight: 700;">
              ${conclusions.plain_language?.headline || conclusions.macro_summary || 'Sytuacja rynkowa pod kontrolą.'}
            </h2>
            <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
              ${rec.actionSummary || 'Kontynuuj systematyczne budowanie portfela w ramach konta OKI.'}
            </p>
          </div>

          <!-- KEY MARKET METRICS TABLE -->
          <div style="margin-top: 20px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 14px; padding: 18px;">
            <h3 style="margin: 0 0 14px; font-size: 14px; color: #f8fafc; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
              Główne Wskaźniki Rynkowe
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">WIG (Szeroki rynek GPW):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">
                  ${r.wig ? r.wig.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) : '--'} pkt
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Rentowność PL10Y (Obligacje 10-letnie):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">
                  ${r.pl10y != null ? r.pl10y.toFixed(2) : '--'}%
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Spread dochodowości 10Y - 2Y:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: ${(r.spread_10y_2y < 0) ? '#f43f5e' : '#10b981'};">
                  ${r.spread_10y_2y != null ? (r.spread_10y_2y > 0 ? '+' : '') + r.spread_10y_2y.toFixed(2) + ' pp' : '--'}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Spread suwerenny PL vs DE (Bund):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">
                  ${r.spread_pl_de != null ? r.spread_pl_de : '--'} bps
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Kursy Walut (NBP):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">
                  EUR: ${r.eur ? r.eur.toFixed(4) : '--'} | USD: ${r.usd ? r.usd.toFixed(4) : '--'}
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">Premia za Ryzyko Akcji (Model Fed ERP):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #10b981;">
                  ${val.equityRiskPremium != null ? '+' + val.equityRiskPremium.toFixed(2) + ' pp' : '+3.97 pp'} (${val.erpStance || 'ATRAKCYJNA'})
                </td>
              </tr>
            </table>
          </div>

          <!-- OKI ALLOCATION WEIGHTS -->
          <div style="margin-top: 20px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 14px; padding: 18px;">
            <h3 style="margin: 0 0 14px; font-size: 14px; color: #f8fafc; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
              Wytyczne Alokacji Portfela OKI (Konto Bez Belki)
            </h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 0;">
                  <strong style="color: #f8fafc;">Globalne Akcje (S&P 500 / Świat w PLN)</strong><br>
                  <span style="font-size: 11px; color: #64748b;">Beta ETF S&P 500 PLN-Hedged (ETFBSPXPL.PL)</span>
                </td>
                <td style="padding: 10px 0; text-align: right; font-weight: 800; font-size: 15px; color: #38bdf8;">
                  ${weights.globalEquities}%
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 0;">
                  <strong style="color: #f8fafc;">Polskie Akcje GPW (WIG20TR / mWIG40TR)</strong><br>
                  <span style="font-size: 11px; color: #64748b;">Beta ETF WIG20TR / Beta ETF mWIG40TR</span>
                </td>
                <td style="padding: 10px 0; text-align: right; font-weight: 800; font-size: 15px; color: #a855f7;">
                  ${weights.polishEquities}%
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 0;">
                  <strong style="color: #f8fafc;">Polskie Obligacje Skarbowe</strong><br>
                  <span style="font-size: 11px; color: #64748b;">Beta ETF TBSP (giełda) lub detaliczne TOS / COI (podlimit 25k)</span>
                </td>
                <td style="padding: 10px 0; text-align: right; font-weight: 800; font-size: 15px; color: #10b981;">
                  ${weights.treasuryBonds}%
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0;">
                  <strong style="color: #f8fafc;">Płynna Gotówka / Złoto</strong><br>
                  <span style="font-size: 11px; color: #64748b;">Konto oszczędnościowe BFG / Złoto fizyczne</span>
                </td>
                <td style="padding: 10px 0; text-align: right; font-weight: 800; font-size: 15px; color: #eab308;">
                  ${weights.cashAndGold}%
                </td>
              </tr>
            </table>

            <div style="margin-top: 14px; padding: 10px; background-color: #0b0f19; border-radius: 8px; font-size: 12px; color: #94a3b8; line-height: 1.4;">
              💡 <strong>Roczny limit OKI:</strong> 100 000 zł zwolnione z 19% podatku Belki (w tym maks. 25 000 zł na bezpieczne obligacje detaliczne).
            </div>
          </div>

          <!-- CTA BUTTON -->
          <div style="text-align: center; margin-top: 26px;">
            <a href="${dashboardUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
              Otwórz Pełny Dashboard Online &rarr;
            </a>
          </div>

          <!-- FOOTER & DISCLAIMER -->
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
            Projekt do użytku osobistego twórcy. Prezentowane wskaźniki i symulacje portfela w ramach OKI nie stanowią porady inwestycyjnej ani doradztwa podatkowego.
          </div>

        </div>
      </body>
      </html>
    `
  };

  const result = await transporter.sendMail(mailOptions);
  console.log(`[Notifier] Raport e-mail pomyślnie wysłany na ${targetEmail} (MessageId: ${result.messageId})`);
  return {
    success: true,
    recipient: targetEmail,
    messageId: result.messageId,
  };
}

/**
 * Dispatch all active notification channels for a newly processed reading
 */
async function dispatchSessionNotifications(reading) {
  if (!reading) return;

  const results = {};
  const status = reading.status || 'STABILNY';
  const score = reading.risk_score != null ? reading.risk_score : 15;
  const dateStr = reading.timestamp || new Date().toISOString().slice(0, 10);
  const visuals = getStatusVisuals(status, score);

  // 1. Dispatch ntfy.sh Push Notification
  if (config.ntfy?.enabled) {
    try {
      const rec = reading.conclusions?.portfolio_recommendation?.weights;
      const weightsStr = rec ? `Akcje Świat: ${rec.globalEquities}%, GPW: ${rec.polishEquities}%, Obligacje: ${rec.treasuryBonds}%, Gotówka: ${rec.cashAndGold}%` : '';

      const ntfyResult = await sendNtfyNotification({
        title: `Poland Macro Radar: ${visuals.emoji} ${status} (${score}/100)`,
        message: `Sesja ${dateStr} • WIG: ${reading.wig ? Math.round(reading.wig) : '--'} pkt\nWytyczne OKI: ${weightsStr}`,
        priority: visuals.priority,
        tags: visuals.tag,
      });
      results.ntfy = ntfyResult;
    } catch (err) {
      console.warn('[Notifier] ntfy.sh dispatch failed:', err.message);
      results.ntfy = { error: err.message };
    }
  }

  // 2. Dispatch Daily HTML Email Digest
  if (config.emailDigest?.enabled && config.emailBackup?.smtp?.host) {
    try {
      const emailResult = await sendDailyDigestEmail(reading);
      results.email = emailResult;
    } catch (err) {
      console.warn('[Notifier] Daily email digest dispatch failed:', err.message);
      results.email = { error: err.message };
    }
  }

  return results;
}

module.exports = {
  getStatusVisuals,
  sendNtfyNotification,
  sendDailyDigestEmail,
  dispatchSessionNotifications,
};
