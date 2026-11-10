/**
 * Poland Macro Crisis Radar — Frontend Controller
 */

// Application State
const state = {
  latest: null,
  history: [],
  news: [],
  adminToken: localStorage.getItem('macro_radar_token') || sessionStorage.getItem('macro_radar_token') || null,
  charts: {
    risk: null,
    curve: null,
    fx: null,
    wig: null,
  },
  isRefreshing: false,
};

/**
 * Returns authentication headers for API requests
 */
function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.adminToken) {
    headers['Authorization'] = `Bearer ${state.adminToken}`;
  }
  return headers;
}

/**
 * Switch view to logged-in dashboard
 */
function showAppView() {
  document.documentElement.classList.add('is-authenticated');
  const loginScreen = document.getElementById('login-screen');
  const appContent = document.getElementById('app-content');
  if (loginScreen) loginScreen.classList.add('hidden');
  if (appContent) appContent.classList.remove('hidden');
}

/**
 * Switch view to login screen
 */
function showLoginScreen() {
  document.documentElement.classList.remove('is-authenticated');
  const loginScreen = document.getElementById('login-screen');
  const appContent = document.getElementById('app-content');
  if (appContent) appContent.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');
  const errorEl = document.getElementById('gate-login-error');
  if (errorEl) errorEl.classList.add('hidden');
}

/**
 * Handle session expiration or unauthorized response
 */
function handleAuthRequired() {
  document.documentElement.classList.remove('is-authenticated');
  state.adminToken = null;
  localStorage.removeItem('macro_radar_token');
  sessionStorage.removeItem('macro_radar_token');
  showLoginScreen();
  showToast('Wymagane logowanie do serwisu.', 'error');
}

// Color & Status Mapping
const STATUS_CONFIG = {
  'STABILNY': {
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-400',
    textColor: 'text-emerald-400'
  },
  'OSTRZEŻENIE': {
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-400',
    textColor: 'text-amber-400'
  },
  'PODWYŻSZONE RYZYKO': {
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    barClass: 'bg-orange-500',
    dotClass: 'bg-orange-400',
    textColor: 'text-orange-400'
  },
  'ALARM KRYZYSOWY': {
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse',
    barClass: 'bg-rose-500',
    dotClass: 'bg-rose-400',
    textColor: 'text-rose-400'
  }
};

/**
 * Toast Notification Helper
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');

  toastText.textContent = message;

  if (type === 'success') {
    toastIcon.innerHTML = `
      <svg class="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>`;
    toast.className = 'fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 bg-slate-900 border border-emerald-500/40 text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3';
  } else {
    toastIcon.innerHTML = `
      <svg class="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>`;
    toast.className = 'fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 bg-slate-900 border border-rose-500/40 text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3';
  }

  setTimeout(() => {
    toast.className = 'fixed bottom-5 right-5 z-50 transform translate-y-20 opacity-0 transition-all duration-300 pointer-events-none bg-slate-900 border border-slate-700 text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3';
  }, 4000);
}

/**
 * Format relative time (e.g. "15 min temu", "2 godz. temu")
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'przed chwilą';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} godz. temu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} dni temu`;
}

/**
 * Fetch latest reading, historical time series, and economic news
 */
async function loadDashboard() {
  if (!state.adminToken) {
    showLoginScreen();
    return;
  }

  try {
    const headers = getAuthHeaders();
    const [latestRes, historyRes, newsRes, healthRes] = await Promise.all([
      fetch('/api/latest', { headers }),
      fetch('/api/history?limit=60', { headers }),
      fetch('/api/news', { headers }),
      fetch('/api/health')
    ]);

    if (latestRes.status === 401 || historyRes.status === 401) {
      handleAuthRequired();
      return;
    }

    if (!latestRes.ok) {
      throw new Error(`Błąd wczytywania najnowszego odczytu (HTTP ${latestRes.status})`);
    }

    state.latest = await latestRes.json();
    state.history = historyRes.ok ? await historyRes.json() : [];
    state.news = newsRes.ok ? await newsRes.json() : [];

    // Render components defensively so a single element never blocks the whole view
    try { renderPlainLanguageSection(state.latest?.conclusions?.plain_language); } catch (e) { console.warn('renderPlainLanguageSection:', e); }
    try { renderGpwIndices(state.latest?.conclusions?.gpw_indices); } catch (e) { console.warn('renderGpwIndices:', e); }
    try { renderHeroSection(state.latest); } catch (e) { console.warn('renderHeroSection:', e); }

    let allocRec = state.latest?.conclusions?.portfolio_recommendation;
    if (!allocRec) {
      try {
        allocRec = await fetch('/api/allocation', { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
      } catch (e) {}
    }

    try { renderAllocationSection(allocRec); } catch (e) { console.warn('renderAllocationSection:', e); }
    try { renderFundamentalValuation(state.latest?.conclusions?.fundamental_valuation); } catch (e) { console.warn('renderFundamentalValuation:', e); }
    try { renderKpiCards(state.latest); } catch (e) { console.warn('renderKpiCards:', e); }
    try { renderWarnings(state.latest.warnings || []); } catch (e) { console.warn('renderWarnings:', e); }
    try { renderNewsSection(state.news); } catch (e) { console.warn('renderNewsSection:', e); }
    try { renderHistoryTable(state.history); } catch (e) { console.warn('renderHistoryTable:', e); }
    try { renderCharts(state.history); } catch (e) { console.warn('renderCharts:', e); }

    if (healthRes.ok) {
      const health = await healthRes.json();
      const footerUptime = document.getElementById('footer-uptime');
      if (footerUptime) {
        const mins = Math.floor(health.uptimeSeconds / 60);
        footerUptime.textContent = `Uptime: ${mins} min (${health.recordsCount} odczytów w bazie)`;
      }
    }
  } catch (err) {
    console.error('Błąd ładowania pulpitu:', err);
    showToast(`Błąd ładowania danych: ${err.message}`, 'error');
  }
}

/**
 * Render "Prostym językiem / Dla każdego" Section
 */
function renderPlainLanguageSection(plain) {
  if (!plain) return;

  const badgeEl = document.getElementById('plain-badge');
  if (badgeEl) {
    let colorClasses = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (plain.trafficLight === 'caution') colorClasses = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (plain.trafficLight === 'warning') colorClasses = 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    if (plain.trafficLight === 'crisis') colorClasses = 'bg-rose-500/15 text-rose-300 border-rose-500/30 animate-pulse';

    badgeEl.className = `px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-sm ${colorClasses}`;
    badgeEl.textContent = plain.badge || '🟢 Stan Stabilny';
  }

  const headlineEl = document.getElementById('plain-headline');
  if (headlineEl) {
    headlineEl.textContent = plain.headline || 'W gospodarce panuje stabilizacja.';
  }

  const savingsEl = document.getElementById('plain-savings');
  if (savingsEl) savingsEl.textContent = plain.savingsAdvice || '--';

  const loansEl = document.getElementById('plain-loans');
  if (loansEl) loansEl.textContent = plain.loansAdvice || '--';

  const investingEl = document.getElementById('plain-investing');
  if (investingEl) investingEl.textContent = plain.investingAdvice || '--';

  const currenciesEl = document.getElementById('plain-currencies');
  if (currenciesEl) currenciesEl.textContent = plain.currenciesAdvice || '--';

  const glossaryEl = document.getElementById('plain-glossary');
  if (glossaryEl && Array.isArray(plain.glossary)) {
    glossaryEl.innerHTML = plain.glossary.map(item => `
      <div class="bg-slate-900/90 border border-slate-800 p-3 rounded-lg">
        <h4 class="text-xs font-bold text-sky-400 mb-1">${item.term}</h4>
        <p class="text-[11px] text-slate-300 leading-relaxed">${item.explanation}</p>
      </div>
    `).join('');
  }
}

/**
 * Render GPW Indices Overview Cards
 */
function renderGpwIndices(indices) {
  const container = document.getElementById('gpw-indices-container');
  if (!container) return;

  if (!indices || indices.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-slate-500">Brak danych indeksów GPW.</div>`;
    return;
  }

  container.innerHTML = indices.map((idx, index) => {
    const isUp = idx.change1dPct >= 0;
    const sign = isUp ? '+' : '';
    const pillColor = isUp
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    const formattedClose = idx.close != null ? Math.round(idx.close).toLocaleString('pl-PL') : '--';
    const spanColClass = index === 4 ? 'col-span-2 sm:col-span-1' : '';

    return `
      <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 sm:p-3.5 hover:border-slate-700 transition flex flex-col justify-between ${spanColClass}">
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-black tracking-wider text-white">${idx.name}</span>
            <span class="text-[10px] font-mono-numbers px-1.5 py-0.5 rounded border ${pillColor}">
              ${sign}${idx.change1dPct != null ? idx.change1dPct.toFixed(2) : 0}%
            </span>
          </div>
          <p class="text-[10px] text-slate-400 mb-1.5 truncate">${idx.label}</p>
        </div>
        <div>
          <div class="text-base sm:text-xl font-bold font-mono-numbers text-slate-100 mb-1">
            ${formattedClose} <span class="text-[10px] font-normal text-slate-500">pkt</span>
          </div>
          <div class="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-900 pt-1">
            <span>Sesja:</span>
            <span class="font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'}">${idx.status || 'Stabilny'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render Economic News Section
 */
function renderNewsSection(newsList) {
  const container = document.getElementById('news-grid-container');
  if (!container) return;

  if (!newsList || newsList.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-6 text-xs text-slate-500">Brak aktualnych wiadomości gospodarczych.</div>`;
    return;
  }

  const items = newsList.slice(0, 6);

  container.innerHTML = items.map(news => {
    const relTime = formatRelativeTime(news.pubDate);
    return `
      <a href="${news.link}" target="_blank" rel="noopener noreferrer" 
         class="group bg-slate-950/60 border border-slate-800/80 hover:border-sky-500/50 rounded-xl p-4 shadow-sm transition-all duration-200 flex flex-col justify-between hover:bg-slate-900/70">
        <div>
          <div class="flex items-center justify-between text-[11px] mb-2">
            <span class="font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">${news.source || 'Bankier.pl'}</span>
            <span class="text-slate-400 font-mono-numbers text-[10px]">${relTime}</span>
          </div>
          <h3 class="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors leading-snug line-clamp-2 mb-2">
            ${news.title}
          </h3>
          <p class="text-[11px] text-slate-400 leading-relaxed line-clamp-3 mb-3">
            ${news.description || ''}
          </p>
        </div>
        <div class="flex items-center justify-end text-[11px] font-medium text-sky-400 group-hover:text-sky-300 pt-2 border-t border-slate-800/60">
          <span>Czytaj artykuł</span>
          <svg class="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Client fallback for Easter calculation
 */
function getClientEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function getClientHolidayInfo(dateKey) {
  const year = parseInt(dateKey.slice(0, 4), 10);
  const fixed = {
    '01-01': 'Nowy Rok',
    '01-06': 'Święto Trzech Króli',
    '05-01': 'Święto Pracy',
    '05-03': 'Święto Konstytucji 3 Maja',
    '08-15': 'Wniebowzięcie NMP / Święto Wojska Polskiego',
    '11-01': 'Wszystkich Świętych',
    '11-11': 'Narodowe Święto Niepodległości',
    '12-24': 'Wigilia (brak sesji GPW)',
    '12-25': 'Boże Narodzenie (I dzień)',
    '12-26': 'Boże Narodzenie (II dzień)',
    '12-31': 'Sylwester (brak sesji GPW)',
  };

  const md = dateKey.slice(5, 10);
  if (fixed[md]) {
    return { isHoliday: true, name: fixed[md] };
  }

  const easter = getClientEasterSunday(year);
  const addDays = (d, n) => {
    const res = new Date(d.getTime());
    res.setUTCDate(res.getUTCDate() + n);
    return res;
  };
  const fmt = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const goodFridayStr = fmt(addDays(easter, -2));
  const easterStr = fmt(easter);
  const easterMondayStr = fmt(addDays(easter, 1));
  const corpusChristiStr = fmt(addDays(easter, 60));

  if (dateKey === goodFridayStr) return { isHoliday: true, name: 'Wielki Piątek (brak sesji GPW)' };
  if (dateKey === easterStr) return { isHoliday: true, name: 'Niedziela Wielkanocna' };
  if (dateKey === easterMondayStr) return { isHoliday: true, name: 'Poniedziałek Wielkanocny' };
  if (dateKey === corpusChristiStr) return { isHoliday: true, name: 'Boże Ciało' };

  return { isHoliday: false, name: null };
}

/**
 * Helper: Check market trading session, weekend and Polish holiday status
 */
function getMarketSessionInfo(sessionDateStr, marketStatus) {
  let sessionDayName = '';
  if (sessionDateStr) {
    try {
      const sDate = new Date(sessionDateStr + 'T12:00:00Z');
      const dayRaw = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(sDate);
      sessionDayName = dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1).replace('.', '');
    } catch (e) {}
  }

  if (marketStatus) {
    return {
      isWeekendNow: !!marketStatus.isWeekend,
      isHolidayNow: !!marketStatus.isHoliday,
      holidayName: marketStatus.holidayName,
      isGpwClosed: !!marketStatus.isGpwClosed,
      isTradingHours: !!marketStatus.isTradingHours,
      state: marketStatus.state,
      sessionDayName,
      badgeText: marketStatus.badgeText,
      statusExplanation: marketStatus.statusExplanation,
      nextTradingDay: marketStatus.nextTradingDay,
    };
  }

  // Fallback client-side calculation
  const now = new Date();
  const warsawNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  const currentDayOfWeek = warsawNow.getDay();
  const isWeekendNow = currentDayOfWeek === 0 || currentDayOfWeek === 6;

  const y = warsawNow.getFullYear();
  const m = String(warsawNow.getMonth() + 1).padStart(2, '0');
  const d = String(warsawNow.getDate()).padStart(2, '0');
  const dateKey = `${y}-${m}-${d}`;
  const holiday = getClientHolidayInfo(dateKey);

  const hours = warsawNow.getHours();
  const minutes = warsawNow.getMinutes();
  const timeMin = hours * 60 + minutes;
  const isTradingHours = !isWeekendNow && !holiday.isHoliday && (timeMin >= 540 && timeMin < 1025);

  let state = 'OPEN';
  if (isWeekendNow) state = 'WEEKEND';
  else if (holiday.isHoliday) state = 'HOLIDAY';
  else if (timeMin < 540) state = 'PRE_MARKET';
  else if (timeMin >= 1025) state = 'POST_MARKET';

  return {
    isWeekendNow,
    isHolidayNow: holiday.isHoliday,
    holidayName: holiday.name,
    isGpwClosed: holiday.isHoliday,
    isTradingHours,
    state,
    sessionDayName,
  };
}

/**
 * Render Hero Section: Score, Gauge, Progress Bars, Conclusions
 */
function renderHeroSection(data) {
  if (!data) return;

  const sessionInfo = getMarketSessionInfo(data.timestamp, data.market_status);
  const headerDate = document.getElementById('header-date');
  const headerDot = document.getElementById('header-market-dot');
  const headerWeekendTag = document.getElementById('header-weekend-tag');
  const liveBadge = document.getElementById('live-indicator-badge');

  if (headerDate) {
    const daySuffix = sessionInfo.sessionDayName ? ` (${sessionInfo.sessionDayName})` : '';
    headerDate.textContent = `${data.timestamp || '--'}${daySuffix}`;
  }

  if (sessionInfo.isWeekendNow) {
    if (headerWeekendTag) {
      headerWeekendTag.classList.remove('hidden');
      headerWeekendTag.textContent = '⏸️ Weekend';
      headerWeekendTag.title = 'Weekend — giełda GPW nie handluje';
    }
    if (headerDot) {
      headerDot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
      headerDot.title = 'Dziś jest weekend — giełda GPW nie pracuje (ostatnia sesja z piątku)';
    }
    if (liveBadge) {
      liveBadge.textContent = 'Giełda: Weekend';
      liveBadge.className = 'hidden md:inline-flex text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30';
    }
  } else if (sessionInfo.isHolidayNow) {
    if (headerWeekendTag) {
      headerWeekendTag.classList.remove('hidden');
      headerWeekendTag.textContent = `🏛️ Święto: ${sessionInfo.holidayName}`;
      headerWeekendTag.title = `Dziś na GPW nie ma sesji ze względu na święto: ${sessionInfo.holidayName}`;
    }
    if (headerDot) {
      headerDot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
      headerDot.title = `Dziś na GPW nie ma sesji ze względu na święto: ${sessionInfo.holidayName}`;
    }
    if (liveBadge) {
      liveBadge.textContent = 'Giełda: Święto';
      liveBadge.className = 'hidden md:inline-flex text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30';
    }
  } else {
    if (headerWeekendTag) headerWeekendTag.classList.add('hidden');
    if (sessionInfo.isTradingHours) {
      if (headerDot) {
        headerDot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse';
        headerDot.title = 'Sesja giełdowa na GPW w toku (notowania ciągłe 09:00 - 17:05)';
      }
      if (liveBadge) {
        liveBadge.textContent = 'Live';
        liveBadge.className = 'hidden md:inline-flex text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20';
      }
    } else {
      if (headerDot) {
        headerDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
        headerDot.title = sessionInfo.state === 'PRE_MARKET' ? 'Przed sesją (początek notowań o 09:00)' : 'Po sesji GPW (zakończona o 17:05)';
      }
      if (liveBadge) {
        liveBadge.textContent = sessionInfo.state === 'PRE_MARKET' ? 'Przed sesją' : 'Po sesji';
        liveBadge.className = 'hidden md:inline-flex text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30';
      }
    }
  }

  const statusCfg = STATUS_CONFIG[data.status] || STATUS_CONFIG['STABILNY'];
  const statusPill = document.getElementById('status-pill');
  if (statusPill) {
    statusPill.className = `text-xs font-bold px-3 py-1 rounded-full border ${statusCfg.badgeClass}`;
    statusPill.textContent = data.status || 'STABILNY';
  }

  const scoreVal = document.getElementById('risk-score-value');
  if (scoreVal) {
    scoreVal.textContent = data.risk_score != null ? data.risk_score : '--';
    scoreVal.className = `text-4xl sm:text-6xl font-black font-mono-numbers tracking-tight ${statusCfg.textColor}`;
  }

  const p1Val = data.score_curve || 0;
  document.getElementById('p1-pts').textContent = p1Val;
  document.getElementById('p1-bar').style.width = `${Math.min(100, (p1Val / 30) * 100)}%`;

  const p2Val = data.score_sovereign || 0;
  document.getElementById('p2-pts').textContent = p2Val;
  document.getElementById('p2-bar').style.width = `${Math.min(100, (p2Val / 25) * 100)}%`;

  const p3Val = data.score_fx || 0;
  document.getElementById('p3-pts').textContent = p3Val;
  document.getElementById('p3-bar').style.width = `${Math.min(100, (p3Val / 25) * 100)}%`;

  const p4Val = data.score_equities || 0;
  document.getElementById('p4-pts').textContent = p4Val;
  document.getElementById('p4-bar').style.width = `${Math.min(100, (p4Val / 20) * 100)}%`;

  const updateTs = document.getElementById('update-timestamp');
  if (updateTs && data.updated_at) {
    const d = new Date(data.updated_at);
    const formattedDate = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    let marketSuffix = '';
    if (sessionInfo.isWeekendNow) {
      marketSuffix = ' (Weekend • giełda zamknięta)';
    } else if (sessionInfo.isHolidayNow) {
      marketSuffix = ` (Dziś święto: ${sessionInfo.holidayName} • GPW nie handluje)`;
    }
    updateTs.textContent = `Ostatnia aktualizacja: ${formattedDate}, ${formattedTime}${marketSuffix}`;
  }

  const conclusions = data.conclusions || {};
  const tacticalBadge = document.getElementById('tactical-stance-badge');
  if (tacticalBadge) {
    tacticalBadge.textContent = conclusions.tactical_stance || 'Akumulacja / Regularne DCA';
  }

  const macroSummary = document.getElementById('macro-summary');
  if (macroSummary) {
    macroSummary.textContent = conclusions.macro_summary || 'Brak bieżącej syntezy makroekonomicznej.';
  }

  const bondsView = document.getElementById('bonds-tfi-view');
  if (bondsView) {
    bondsView.textContent = conclusions.bonds_tfi_view || 'Brak szczegółowej diagnozy rynku długu skarbowego.';
  }

  const equitiesView = document.getElementById('equities-gpw_view') || document.getElementById('equities-gpw-view');
  if (equitiesView) {
    equitiesView.textContent = conclusions.equities_gpw_view || 'Brak szczegółowej diagnozy indeksu WIG.';
  }
}

/**
 * Render Warnings List
 */
function renderWarnings(warnings) {
  const container = document.getElementById('warnings-container');
  if (!container) return;

  if (!warnings || warnings.length === 0) {
    container.innerHTML = `
      <div class="flex items-center space-x-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span class="font-medium">Brak aktywnych sygnałów ostrzegawczych — parametry makroekonomiczne w bezpiecznym przedziale.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = warnings.map(warning => `
    <div class="flex items-start space-x-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
      <svg class="w-4 h-4 shrink-0 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span class="leading-relaxed">${warning}</span>
    </div>
  `).join('');
}

/**
 * Render OKI Portfolio Allocation Section & Core Instruments
 */
function renderAllocationSection(rec) {
  if (!rec) return;

  // 1. Stance badge & regime label
  const stanceBadge = document.getElementById('alloc-stance-badge');
  if (stanceBadge) {
    stanceBadge.textContent = rec.strategyStance || 'Zrównoważona Akumulacja';
    if (rec.regime === 'ALARM KRYZYSOWY') {
      stanceBadge.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-sm bg-rose-500/15 text-rose-300 border-rose-500/30 animate-pulse';
    } else if (rec.regime === 'PODWYŻSZONE RYZYKO') {
      stanceBadge.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-sm bg-orange-500/15 text-orange-300 border-orange-500/30';
    } else if (rec.regime === 'OSTRZEŻENIE') {
      stanceBadge.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-sm bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else {
      stanceBadge.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-sm bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    }
  }

  const regimeLabel = document.getElementById('alloc-regime-label');
  if (regimeLabel) {
    regimeLabel.textContent = rec.regime || 'STABILNY';
  }

  const actionSummary = document.getElementById('alloc-action-summary');
  if (actionSummary) {
    actionSummary.textContent = rec.actionSummary || 'Brak wytycznych alokacyjnych.';
  }

  // 2. Weights & Visual Progress Bar
  const weights = rec.weights || { globalEquities: 50, polishEquities: 15, treasuryBonds: 30, cashAndGold: 5 };
  
  const wGlobal = weights.globalEquities ?? 50;
  const wGpw = weights.polishEquities ?? 15;
  const wBonds = weights.treasuryBonds ?? 30;
  const wCash = weights.cashAndGold ?? 5;

  const wGlobalEl = document.getElementById('weight-global-pct');
  const wGpwEl = document.getElementById('weight-gpw-pct');
  const wBondsEl = document.getElementById('weight-bonds-pct');
  const wCashEl = document.getElementById('weight-cash-pct');

  if (wGlobalEl) wGlobalEl.textContent = wGlobal;
  if (wGpwEl) wGpwEl.textContent = wGpw;
  if (wBondsEl) wBondsEl.textContent = wBonds;
  if (wCashEl) wCashEl.textContent = wCash;

  const barGlobal = document.getElementById('alloc-bar-global');
  const barGpw = document.getElementById('alloc-bar-gpw');
  const barBonds = document.getElementById('alloc-bar-bonds');
  const barCash = document.getElementById('alloc-bar-cash');

  if (barGlobal) barGlobal.style.width = `${wGlobal}%`;
  if (barGpw) barGpw.style.width = `${wGpw}%`;
  if (barBonds) barBonds.style.width = `${wBonds}%`;
  if (barCash) barCash.style.width = `${wCash}%`;

  // 3. Render 4 Core Instrument Cards
  const instrumentsGrid = document.getElementById('alloc-instruments-grid');
  if (instrumentsGrid && rec.buckets) {
    instrumentsGrid.innerHTML = rec.buckets.map(bucket => {
      const inst = bucket.instrument || {};
      const secInst = bucket.secondaryInstrument;
      return `
        <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div class="flex items-center justify-between gap-1 mb-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">${bucket.category}</span>
              <span class="text-xs font-black font-mono-numbers px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ${bucket.weightPct}%
              </span>
            </div>
            
            <h4 class="text-sm font-bold text-white mb-0.5">${inst.name || 'Instrument'}</h4>
            <div class="flex items-center gap-1.5 mb-2">
              <span class="text-[11px] font-mono-numbers px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-400 font-bold">
                ${inst.ticker || '--'}
              </span>
              ${inst.eligibleOki ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">Konto OKI</span>' : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">Poza OKI</span>'}
            </div>

            <p class="text-xs text-slate-300 leading-relaxed mb-3">
              ${inst.description || ''}
            </p>

            ${secInst ? `
              <div class="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 mb-3">
                <strong class="text-slate-300">Alternatywa detaliczna:</strong> ${secInst.name} (<span class="text-sky-400 font-mono-numbers">${secInst.ticker}</span>)
              </div>
            ` : ''}
          </div>

          <div class="pt-3 border-t border-slate-800/80 mt-2">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Rekomendacja na dziś:</div>
            <p class="text-xs text-indigo-300 font-medium leading-relaxed">
              ${bucket.actionAdvice || 'Kontynuuj regularne zasilanie portfela.'}
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Initial calculation with current input amount
  const inputEl = document.getElementById('calc-amount-input');
  const initialAmount = inputEl ? parseFloat(inputEl.value) || 1500 : 1500;
  calculateAndRenderContribution(initialAmount);
}

/**
 * Render Fundamental Valuation & Equity Risk Premium (Model Fed ERP)
 */
function renderFundamentalValuation(val) {
  const v = val || {
    wigPe: 10.4,
    wigPbv: 1.15,
    dividendYield: 4.60,
    earningsYield: 9.62,
    pl10yYield: 5.65,
    equityRiskPremium: 3.97,
    erpStance: 'BARDZO ATRAKCYJNA',
    erpColor: 'emerald',
    erpAdvice: 'Wyceny akcji na GPW zapewniają wysoką premię za ryzyko ponad bezpieczne obligacje skarbowe 10Y. Sprzyja długoterminowej akumulacji akcji w OKI.',
    nbpRate: 5.75,
    cpiInflation: 4.90,
    realRate: 0.85,
  };

  const peEl = document.getElementById('val-pe-wig');
  const eyEl = document.getElementById('val-ey-wig');
  const pl10yEl = document.getElementById('val-pl10y');
  const realRateEl = document.getElementById('val-real-rate');
  const badgeEl = document.getElementById('erp-stance-badge');
  const adviceEl = document.getElementById('erp-advice-text');

  if (peEl) peEl.textContent = `${v.wigPe != null ? v.wigPe.toFixed(1) : '10.4'}x`;
  if (eyEl) eyEl.textContent = `${v.earningsYield != null ? v.earningsYield.toFixed(2) : '9.62'}%`;
  if (pl10yEl) pl10yEl.textContent = `${v.pl10yYield != null ? v.pl10yYield.toFixed(2) : '5.65'}%`;
  if (realRateEl) {
    const r = v.realRate != null ? v.realRate : 0.85;
    realRateEl.textContent = `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`;
    realRateEl.className = r >= 0 ? 'text-emerald-400 font-mono-numbers text-sm sm:text-base' : 'text-rose-400 font-mono-numbers text-sm sm:text-base';
  }

  if (badgeEl) {
    const erp = v.equityRiskPremium != null ? v.equityRiskPremium : 3.97;
    const sign = erp >= 0 ? '+' : '';
    badgeEl.textContent = `ERP: ${sign}${erp.toFixed(2)} pp (${v.erpStance || 'ATRAKCYJNA'})`;
    if (erp >= 3.5) {
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-xs font-bold font-mono-numbers bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0';
    } else if (erp >= 1.5) {
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-xs font-bold font-mono-numbers bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0';
    } else if (erp >= 0) {
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-xs font-bold font-mono-numbers bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0';
    } else {
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-xs font-bold font-mono-numbers bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0';
    }
  }

  if (adviceEl && v.erpAdvice) {
    adviceEl.textContent = v.erpAdvice;
  }
}

/**
 * Initialize and sync Interactive OKI Limits Tracker (100k & 25k limits)
 */
function initOkiTracker() {
  const inputTotal = document.getElementById('oki-input-total');
  const inputRetail = document.getElementById('oki-input-retail');

  const savedTotal = parseFloat(localStorage.getItem('oki_tracker_total')) || 0;
  const savedRetail = parseFloat(localStorage.getItem('oki_tracker_retail')) || 0;

  if (inputTotal) inputTotal.value = savedTotal > 0 ? savedTotal : '';
  if (inputRetail) inputRetail.value = savedRetail > 0 ? savedRetail : '';

  updateOkiTracker(savedTotal, savedRetail);

  const handleUpdate = () => {
    const valTotal = Math.max(0, parseFloat(inputTotal?.value) || 0);
    const valRetail = Math.max(0, parseFloat(inputRetail?.value) || 0);
    localStorage.setItem('oki_tracker_total', valTotal);
    localStorage.setItem('oki_tracker_retail', valRetail);
    updateOkiTracker(valTotal, valRetail);
  };

  if (inputTotal) {
    inputTotal.addEventListener('input', handleUpdate);
    inputTotal.addEventListener('change', handleUpdate);
  }
  if (inputRetail) {
    inputRetail.addEventListener('input', handleUpdate);
    inputRetail.addEventListener('change', handleUpdate);
  }
}

function updateOkiTracker(depositedTotal, depositedRetail) {
  const TOTAL_LIMIT = 100000;
  const RETAIL_SUBLIMIT = 25000;

  const totalUsed = Math.min(TOTAL_LIMIT, Math.max(0, depositedTotal || 0));
  const retailUsed = Math.min(RETAIL_SUBLIMIT, Math.max(0, depositedRetail || 0));

  const totalPct = Math.min(100, Math.round((totalUsed / TOTAL_LIMIT) * 100));
  const retailPct = Math.min(100, Math.round((retailUsed / RETAIL_SUBLIMIT) * 100));

  const totalRem = Math.max(0, TOTAL_LIMIT - totalUsed);
  const retailRem = Math.max(0, RETAIL_SUBLIMIT - retailUsed);

  const totalUsedText = document.getElementById('oki-total-used-text');
  const totalPctText = document.getElementById('oki-total-pct');
  const totalBar = document.getElementById('oki-total-bar');
  const totalRemText = document.getElementById('oki-total-rem-text');

  if (totalUsedText) totalUsedText.textContent = totalUsed.toLocaleString('pl-PL');
  if (totalPctText) totalPctText.textContent = `${totalPct}%`;
  if (totalBar) totalBar.style.width = `${totalPct}%`;
  if (totalRemText) totalRemText.textContent = `${totalRem.toLocaleString('pl-PL')} zł`;

  const retailUsedText = document.getElementById('oki-retail-used-text');
  const retailPctText = document.getElementById('oki-retail-pct');
  const retailBar = document.getElementById('oki-retail-bar');
  const retailRemText = document.getElementById('oki-retail-rem-text');

  if (retailUsedText) retailUsedText.textContent = retailUsed.toLocaleString('pl-PL');
  if (retailPctText) retailPctText.textContent = `${retailPct}%`;
  if (retailBar) retailBar.style.width = `${retailPct}%`;
  if (retailRemText) retailRemText.textContent = `${retailRem.toLocaleString('pl-PL')} zł`;
}

/**
 * Calculate and render monthly contribution split in PLN
 */
async function calculateAndRenderContribution(amountPln) {
  const container = document.getElementById('calc-results-container');
  if (!container) return;

  try {
    const res = await fetch('/api/allocation/calculate', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ amountPln })
    });

    if (res.status === 401) {
      handleAuthRequired();
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    renderCalculationResults(data);
  } catch (err) {
    console.warn('Fallback to client-side allocation calculation:', err);
    // Client-side fallback if server endpoint is temporarily unreachable
    const total = Math.max(0, parseFloat(amountPln) || 0);
    const weights = state.latest?.conclusions?.portfolio_recommendation?.weights || {
      globalEquities: 50,
      polishEquities: 15,
      treasuryBonds: 30,
      cashAndGold: 5
    };

    const fallbackData = {
      totalAmountPln: total,
      regime: state.latest?.status || 'STABILNY',
      split: [
        {
          name: 'Globalne Akcje (ETF w PLN)',
          instrumentName: 'Beta ETF S&P 500 PLN-Hedged (lub inPZU Global Equity PLN)',
          ticker: 'ETFBSPXPL.PL',
          percent: weights.globalEquities,
          amountPln: Math.round((total * (weights.globalEquities / 100)) * 100) / 100,
          note: 'Zgodny z OKI — notowany na GPW w PLN',
        },
        {
          name: 'Polskie Akcje (GPW)',
          instrumentName: 'Beta ETF WIG20TR / mWIG40TR',
          ticker: 'ETFBW20TR / ETFBM40TR',
          percent: weights.polishEquities,
          amountPln: Math.round((total * (weights.polishEquities / 100)) * 100) / 100,
          note: 'Kup na GPW w ramach OKI',
        },
        {
          name: 'Obligacje Skarbowe',
          instrumentName: 'Beta ETF TBSP (giełda) lub TOS/COI (detal)',
          ticker: 'ETFBSTBSP / TOS / COI',
          percent: weights.treasuryBonds,
          amountPln: Math.round((total * (weights.treasuryBonds / 100)) * 100) / 100,
          note: 'W OKI: TBSP na giełdzie lub TOS/COI w podlimicie 25k',
        },
        {
          name: 'Płynna Gotówka / Złoto',
          instrumentName: 'Konto Oszczędnościowe BFG / Złoto',
          ticker: 'Konto / Złoto fizyczne',
          percent: weights.cashAndGold,
          amountPln: Math.round((total * (weights.cashAndGold / 100)) * 100) / 100,
          note: 'Zasil konto oszczędnościowe lub zachowaj bufor',
        }
      ],
      okiAdvice: 'W koncie OKI wypełnij sublimit 25 tys. zł bezpiecznymi obligacjami detalicznymi (TOS/COI), a pozostałe min. 75 tys. zł ulokuj w notowanym na GPW w PLN funduszu Beta ETF S&P 500 PLN-Hedged (ETFBSPXPL.PL) oraz hurtowym ETF-ie obligacji skarbowych TBSP na giełdzie (ETFBSTBSP.PL).'
    };
    renderCalculationResults(fallbackData);
  }
}

/**
 * Render the calculation result cards/table
 */
function renderCalculationResults(data) {
  const container = document.getElementById('calc-results-container');
  if (!container || !data || !data.split) return;

  const total = (data.totalAmountPln || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  container.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2.5 sm:space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs border-b border-slate-800 pb-2">
        <span class="text-slate-400">Podział miesięcznej kwoty: <strong class="text-white font-mono-numbers text-sm">${total} PLN</strong></span>
        <span class="text-[11px] font-mono-numbers px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 w-fit">
          Reżim: ${data.regime || 'STABILNY'}
        </span>
      </div>

      <div class="divide-y divide-slate-800/60 space-y-2">
        ${data.split.map(item => `
          <div class="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-white">${item.name}</span>
                <span class="text-[10px] font-mono-numbers text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">${item.ticker}</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-snug">${item.instrumentName} • <span class="text-slate-500">${item.note}</span></p>
            </div>
            <div class="text-left sm:text-right shrink-0">
              <div class="text-sm font-black font-mono-numbers text-emerald-400">
                ${(item.amountPln || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
              </div>
              <div class="text-[10px] font-mono-numbers text-slate-400">${item.percent}% wpłaty</div>
            </div>
          </div>
        `).join('')}
      </div>

      ${data.okiAdvice ? `
        <div class="pt-2.5 mt-1 border-t border-slate-800/80 text-[11px] text-indigo-200/90 flex items-start gap-1.5">
          <span class="text-indigo-400 shrink-0">📌</span>
          <span class="leading-relaxed">${data.okiAdvice}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render 4 KPI metric cards
 */
function renderKpiCards(data) {
  if (!data) return;

  // KPI 1: Curve PL10Y - PL2Y
  const kpiCurveVal = document.getElementById('kpi-curve-val');
  const kpiCurveSub = document.getElementById('kpi-curve-sub');
  if (kpiCurveVal) {
    const spread = data.spread_10y_2y != null ? data.spread_10y_2y : 0;
    kpiCurveVal.textContent = (spread >= 0 ? `+${spread.toFixed(2)}` : spread.toFixed(2));
    kpiCurveVal.className = `text-2xl font-bold font-mono-numbers ${spread < 0 ? 'text-rose-400' : 'text-slate-100'}`;
  }
  if (kpiCurveSub) {
    kpiCurveSub.textContent = `10Y: ${data.pl10y != null ? data.pl10y.toFixed(2) + '%' : '--'} | 2Y: ${data.pl2y != null ? data.pl2y.toFixed(2) + '%' : '--'}`;
  }

  // KPI 2: Sovereign Spread PL - DE
  const kpiSpreadVal = document.getElementById('kpi-spread-val');
  const kpiSpreadSub = document.getElementById('kpi-spread-sub');
  if (kpiSpreadVal) {
    const bps = data.spread_pl_de != null ? data.spread_pl_de : '--';
    kpiSpreadVal.textContent = bps;
    kpiSpreadVal.className = `text-2xl font-bold font-mono-numbers ${bps > 330 ? 'text-amber-400' : 'text-slate-100'}`;
  }
  if (kpiSpreadSub) {
    kpiSpreadSub.textContent = `PL 10Y: ${data.pl10y != null ? data.pl10y.toFixed(2) + '%' : '--'} | DE 10Y: ${data.de10y != null ? data.de10y.toFixed(2) + '%' : '--'}`;
  }

  // KPI 3: FX Pressure
  const kpiUsdVal = document.getElementById('kpi-usd-val');
  const kpiUsdChg = document.getElementById('kpi-usd-chg');
  const kpiEurSub = document.getElementById('kpi-eur-sub');
  if (kpiUsdVal) {
    kpiUsdVal.textContent = data.usd_pln != null ? data.usd_pln.toFixed(4) : '--';
  }
  if (kpiUsdChg) {
    const chg = data.usd_pln_30d_chg != null ? data.usd_pln_30d_chg : 0;
    const sign = chg >= 0 ? '+' : '';
    kpiUsdChg.textContent = `30d: ${sign}${chg.toFixed(2)}%`;
    kpiUsdChg.className = `text-xs px-1.5 py-0.5 rounded font-mono-numbers ${chg > 4.0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'}`;
  }
  if (kpiEurSub) {
    const eurChg = data.eur_pln_30d_chg != null ? data.eur_pln_30d_chg : 0;
    const sign = eurChg >= 0 ? '+' : '';
    kpiEurSub.textContent = `EUR/PLN: ${data.eur_pln != null ? data.eur_pln.toFixed(4) : '--'} (${sign}${eurChg.toFixed(2)}%)`;
  }

  // KPI 4: Equity Trend WIG
  const kpiWigVal = document.getElementById('kpi-wig-val');
  const kpiWigSub = document.getElementById('kpi-wig-sub');
  if (kpiWigVal) {
    kpiWigVal.textContent = data.wig != null ? Math.round(data.wig).toLocaleString('pl-PL') : '--';
  }
  if (kpiWigSub) {
    const diff = data.wig_sma200_diff != null ? data.wig_sma200_diff : 0;
    const sign = diff >= 0 ? '+' : '';
    const sma = data.wig_sma200 != null ? Math.round(data.wig_sma200).toLocaleString('pl-PL') : '--';
    kpiWigSub.textContent = `SMA200: ${sma} (${sign}${diff.toFixed(2)}%)`;
    kpiWigSub.className = `text-xs font-mono-numbers ${diff < -3.0 ? 'text-amber-400' : 'text-slate-400'}`;
  }
}

/**
 * Render Historical Table (last 10 sessions)
 */
function renderHistoryTable(history) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-500">Brak zarejestrowanych sesji.</td></tr>`;
    return;
  }

  const last10 = [...history].slice(-10).reverse();

  tbody.innerHTML = last10.map(row => {
    const statusCfg = STATUS_CONFIG[row.status] || STATUS_CONFIG['STABILNY'];
    const curve = row.spread_10y_2y != null ? (row.spread_10y_2y >= 0 ? `+${row.spread_10y_2y.toFixed(2)}` : row.spread_10y_2y.toFixed(2)) : '--';
    const usdChg = row.usd_pln_30d_chg != null ? (row.usd_pln_30d_chg >= 0 ? `+${row.usd_pln_30d_chg.toFixed(1)}%` : `${row.usd_pln_30d_chg.toFixed(1)}%`) : '--';
    const eurChg = row.eur_pln_30d_chg != null ? (row.eur_pln_30d_chg >= 0 ? `+${row.eur_pln_30d_chg.toFixed(1)}%` : `${row.eur_pln_30d_chg.toFixed(1)}%`) : '--';
    const smaDiff = row.wig_sma200_diff != null ? (row.wig_sma200_diff >= 0 ? `+${row.wig_sma200_diff.toFixed(2)}%` : `${row.wig_sma200_diff.toFixed(2)}%`) : '--';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3 font-semibold text-slate-300">${row.timestamp}</td>
        <td class="py-2.5 px-3 font-bold ${statusCfg.textColor}">${row.risk_score} <span class="text-slate-500 font-normal text-[10px]">/ 100</span></td>
        <td class="py-2.5 px-3">
          <span class="inline-flex text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}">
            ${row.status}
          </span>
        </td>
        <td class="py-2.5 px-3 ${row.spread_10y_2y < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}">${curve} pp.</td>
        <td class="py-2.5 px-3 text-slate-300">${row.spread_pl_de} bps</td>
        <td class="py-2.5 px-3 text-slate-300">${row.usd_pln?.toFixed(4)} <span class="text-[10px] text-slate-400">(${usdChg})</span></td>
        <td class="py-2.5 px-3 text-slate-300">${row.eur_pln?.toFixed(4)} <span class="text-[10px] text-slate-400">(${eurChg})</span></td>
        <td class="py-2.5 px-3 text-slate-200">${Math.round(row.wig || 0).toLocaleString('pl-PL')}</td>
        <td class="py-2.5 px-3 ${row.wig_sma200_diff < -3 ? 'text-amber-400' : 'text-emerald-400'}">${smaDiff}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Common Chart.js dark-mode options
 */
function getCommonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500,
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#94a3b8',
          boxWidth: 12,
          font: { family: 'Inter', size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: 'Inter', weight: 'bold' },
        bodyFont: { family: 'JetBrains Mono' },
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
      }
    }
  };
}

/**
 * Render all 4 interactive Chart.js charts
 */
function renderCharts(history) {
  if (!history || history.length === 0) return;

  const labels = history.map(h => h.timestamp ? h.timestamp.slice(5) : '');

  // Chart 1: Risk Index History (0 - 100)
  const ctxRisk = document.getElementById('chart-risk');
  if (ctxRisk) {
    if (state.charts.risk) state.charts.risk.destroy();

    const riskValues = history.map(h => h.risk_score);
    const chartContext = ctxRisk.getContext('2d');
    const gradient = chartContext.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
    gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)');

    const opts = getCommonChartOptions();
    opts.scales.y.min = 0;
    opts.scales.y.max = 100;

    state.charts.risk = new Chart(ctxRisk, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Indeks Ryzyka (0-100)',
          data: riskValues,
          borderColor: '#f43f5e',
          borderWidth: 2.2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 1,
          pointHoverRadius: 5,
        }]
      },
      options: opts
    });
  }

  // Chart 2: Yield Curve Slope (PL10Y - PL2Y)
  const ctxCurve = document.getElementById('chart-curve');
  if (ctxCurve) {
    if (state.charts.curve) state.charts.curve.destroy();

    const curveValues = history.map(h => h.spread_10y_2y);
    const zeroLine = history.map(() => 0);

    state.charts.curve = new Chart(ctxCurve, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Spread PL10Y - PL2Y (pp.)',
            data: curveValues,
            borderColor: '#818cf8',
            borderWidth: 2.2,
            backgroundColor: 'rgba(129, 140, 248, 0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 1,
            pointHoverRadius: 5,
          },
          {
            label: 'Próg inwersji (0.00)',
            data: zeroLine,
            borderColor: '#f43f5e',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: getCommonChartOptions()
    });
  }

  // Chart 3: USD/PLN and EUR/PLN
  const ctxFx = document.getElementById('chart-fx');
  if (ctxFx) {
    if (state.charts.fx) state.charts.fx.destroy();

    const usdValues = history.map(h => h.usd_pln);
    const eurValues = history.map(h => h.eur_pln);

    state.charts.fx = new Chart(ctxFx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'USD/PLN',
            data: usdValues,
            borderColor: '#38bdf8',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 1,
            pointHoverRadius: 5,
          },
          {
            label: 'EUR/PLN',
            data: eurValues,
            borderColor: '#fbbf24',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 1,
            pointHoverRadius: 5,
          }
        ]
      },
      options: getCommonChartOptions()
    });
  }

  // Chart 4: WIG vs SMA200
  const ctxWig = document.getElementById('chart-wig');
  if (ctxWig) {
    if (state.charts.wig) state.charts.wig.destroy();

    const wigValues = history.map(h => h.wig);
    const smaValues = history.map(h => h.wig_sma200);

    state.charts.wig = new Chart(ctxWig, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Indeks WIG',
            data: wigValues,
            borderColor: '#34d399',
            borderWidth: 2.2,
            tension: 0.2,
            pointRadius: 1,
            pointHoverRadius: 5,
          },
          {
            label: 'Średnia SMA200',
            data: smaValues,
            borderColor: '#f59e0b',
            borderWidth: 1.8,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.2,
          }
        ]
      },
      options: getCommonChartOptions()
    });
  }
}

/**
 * Handle Manual Refresh Click
 */
async function handleRefreshClick() {
  if (state.isRefreshing) return;

  const btn = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  const label = document.getElementById('refresh-label');

  try {
    state.isRefreshing = true;
    btn.disabled = true;
    label.textContent = 'Pobieranie...';
    icon.classList.add('animate-spin');

    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      handleAuthRequired();
      return;
    }

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    showToast(`Zaktualizowano dane makro, GPW i newsy (${result.elapsedMs || 0} ms)!`, 'success');
    await loadDashboard();
  } catch (err) {
    console.error('Błąd odświeżania:', err);
    showToast(`Błąd odświeżania: ${err.message}`, 'error');
  } finally {
    state.isRefreshing = false;
    btn.disabled = false;
    label.textContent = 'Odśwież dane';
    icon.classList.remove('animate-spin');
  }
}

// ==========================================
// ADMIN & DATABASE MANAGEMENT LOGIC
// ==========================================

function openAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.classList.remove('hidden');

  if (state.adminToken) {
    showAdminDashboard();
  } else {
    showLoginView();
  }
}

function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.classList.add('hidden');
}

function showLoginView() {
  document.getElementById('admin-login-view').classList.remove('hidden');
  document.getElementById('admin-dashboard-view').classList.add('hidden');
  document.getElementById('login-error').classList.add('hidden');
}

function showAdminDashboard() {
  document.getElementById('admin-login-view').classList.add('hidden');
  document.getElementById('admin-dashboard-view').classList.remove('hidden');
  loadAdminStats();
}

async function loadAdminStats() {
  if (!state.adminToken) return;

  try {
    const res = await fetch('/api/admin/db/stats', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });

    if (res.status === 401) {
      // Token expired
      state.adminToken = null;
      sessionStorage.removeItem('macro_radar_token');
      showLoginView();
      return;
    }

    const stats = await res.json();
    document.getElementById('admin-stat-count').textContent = `${stats.recordsCount || 0} sesji`;
    document.getElementById('admin-stat-size').textContent = `${stats.sizeKb || 0} KB`;
    document.getElementById('admin-stat-range').textContent = `${stats.oldestTimestamp || '--'} do ${stats.latestTimestamp || '--'}`;

    const smtpBadge = document.getElementById('smtp-status-badge');
    if (smtpBadge) {
      if (stats.smtpConfigured) {
        smtpBadge.className = 'text-[10px] px-2 py-0.5 rounded border text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
        smtpBadge.textContent = 'SMTP Skonfigurowane';
      } else {
        smtpBadge.className = 'text-[10px] px-2 py-0.5 rounded border text-amber-400 border-amber-500/30 bg-amber-500/10';
        smtpBadge.textContent = 'SMTP Nieskonfigurowane (brak hosta)';
      }
    }

    if (stats.emailBackupTo) {
      const emailInput = document.getElementById('email-backup-input');
      if (emailInput && !emailInput.value) {
        emailInput.value = stats.emailBackupTo;
      }
    }

    const ntfyBadge = document.getElementById('ntfy-status-badge');
    const ntfyLink = document.getElementById('ntfy-topic-link');
    if (stats.ntfyTopic) {
      if (ntfyLink) {
        ntfyLink.textContent = stats.ntfyTopic;
        ntfyLink.href = stats.ntfyUrl || `https://ntfy.sh/${stats.ntfyTopic}`;
      }
      if (ntfyBadge) {
        ntfyBadge.textContent = 'ntfy.sh Aktywne';
        ntfyBadge.className = 'text-[10px] px-2 py-0.5 rounded border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shrink-0';
      }
    }

    const emailDigestBadge = document.getElementById('email-digest-badge');
    const testEmailInput = document.getElementById('test-email-digest-input');
    if (stats.emailDigestTo) {
      if (emailDigestBadge) emailDigestBadge.textContent = stats.emailDigestTo;
      if (testEmailInput && !testEmailInput.value) testEmailInput.value = stats.emailDigestTo;
    }
  } catch (err) {
    console.error('Błąd pobierania statystyk bazy:', err);
  }
}

async function handleGateLogin(e) {
  e.preventDefault();
  const userEl = document.getElementById('gate-login-user');
  const passEl = document.getElementById('gate-login-pass');
  const errorEl = document.getElementById('gate-login-error');
  const submitBtn = document.getElementById('gate-login-submit');

  const username = userEl ? userEl.value.trim() : '';
  const password = passEl ? passEl.value.trim() : '';

  if (errorEl) errorEl.classList.add('hidden');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70');
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nieprawidłowe dane logowania');
    }

    state.adminToken = data.token;
    localStorage.setItem('macro_radar_token', data.token);
    sessionStorage.setItem('macro_radar_token', data.token);

    const userLabel = document.getElementById('header-user-label');
    if (userLabel) userLabel.textContent = data.user || 'Użytkownik';
    const adminUserLabel = document.getElementById('admin-username-label');
    if (adminUserLabel) adminUserLabel.textContent = data.user || 'Użytkownik';

    showToast('Zalogowano pomyślnie!', 'success');
    showAppView();
    await loadDashboard();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-70');
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const errorEl = document.getElementById('login-error');

  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nieprawidłowe dane logowania');
    }

    state.adminToken = data.token;
    localStorage.setItem('macro_radar_token', data.token);
    sessionStorage.setItem('macro_radar_token', data.token);
    const labelEl = document.getElementById('admin-username-label');
    if (labelEl) labelEl.textContent = data.user || 'Użytkownik';
    const userLabel = document.getElementById('header-user-label');
    if (userLabel) userLabel.textContent = data.user || 'Użytkownik';
    showToast('Zalogowano pomyślnie jako administrator!', 'success');
    showAdminDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  if (state.adminToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
    } catch (e) {}
  }
  state.adminToken = null;
  localStorage.removeItem('macro_radar_token');
  sessionStorage.removeItem('macro_radar_token');
  closeAdminModal();
  showLoginScreen();
  showToast('Wylogowano z serwisu.', 'success');
}

async function handleDownloadDatabase() {
  if (!state.adminToken) return;

  const btn = document.getElementById('btn-download-db');
  btn.disabled = true;
  btn.classList.add('opacity-50');

  try {
    const res = await fetch('/api/admin/db/download', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `macro_radar_backup_${dateStr}.db`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Plik bazy danych został pobrany na dysk!', 'success');
  } catch (err) {
    showToast(`Błąd pobierania bazy: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

async function handleSendEmailBackup() {
  if (!state.adminToken) return;

  const btn = document.getElementById('btn-send-email-backup');
  const emailInput = document.getElementById('email-backup-input');
  const recipientEmail = emailInput.value.trim();

  if (!recipientEmail) {
    showToast('Podaj adres e-mail odbiorcy backupu.', 'error');
    return;
  }

  btn.disabled = true;
  btn.classList.add('opacity-50');

  try {
    const res = await fetch('/api/admin/db/email-backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.adminToken}`
      },
      body: JSON.stringify({ recipientEmail })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }

    showToast(data.message || 'Kopia bazy została wysłana na e-mail!', 'success');
  } catch (err) {
    showToast(`Błąd wysyłki e-mail: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

async function handleRunBackfill() {
  if (!state.adminToken) return;

  const select = document.getElementById('backfill-days-select');
  const days = select.value;
  const btn = document.getElementById('btn-run-backfill');

  btn.disabled = true;
  btn.classList.add('opacity-50');

  try {
    showToast(`Rozpoczęto pobieranie i przeliczanie ${days} sesji giełdowych...`, 'success');

    const res = await fetch('/api/admin/db/backfill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.adminToken}`
      },
      body: JSON.stringify({ days })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    showToast(`Zakończono backfill: zapisano ${data.count} sesji w bazie!`, 'success');
    await loadAdminStats();
    await loadDashboard();
  } catch (err) {
    showToast(`Błąd backfillu: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

async function handleTestNtfy() {
  if (!state.adminToken) return;
  const btn = document.getElementById('btn-test-ntfy');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }

  try {
    const res = await fetch('/api/admin/notify/ntfy-test', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showToast('Powiadomienie testowe ntfy.sh zostało wysłane na Twój kanał!', 'success');
  } catch (err) {
    showToast(`Błąd wysyłki ntfy: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

async function handleTestEmailDigest() {
  if (!state.adminToken) return;
  const btn = document.getElementById('btn-test-email-digest');
  const emailInput = document.getElementById('test-email-digest-input');
  const recipientEmail = emailInput ? emailInput.value.trim() : '';

  if (!recipientEmail) {
    showToast('Podaj adres e-mail odbiorcy raportu.', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }

  try {
    const res = await fetch('/api/admin/notify/email-test', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ recipientEmail })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    showToast(`Raport HTML został pomyślnie wysłany na adres: ${recipientEmail}`, 'success');
  } catch (err) {
    showToast(`Błąd wysyłki e-mail: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize OKI Tracker
  initOkiTracker();

  // Gate login form & header logout
  const gateLoginForm = document.getElementById('gate-login-form');
  if (gateLoginForm) gateLoginForm.addEventListener('submit', handleGateLogin);

  const headerLogoutBtn = document.getElementById('header-logout-btn');
  if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout);

  // Navigation buttons
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshClick);

  const adminModalBtn = document.getElementById('admin-modal-btn');
  if (adminModalBtn) adminModalBtn.addEventListener('click', openAdminModal);

  const closeModalBtn = document.getElementById('close-modal-btn');
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeAdminModal);

  const closeModalFooterBtn = document.getElementById('btn-modal-close-footer');
  if (closeModalFooterBtn) closeModalFooterBtn.addEventListener('click', closeAdminModal);

  // Admin form and action events
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const downloadDbBtn = document.getElementById('btn-download-db');
  if (downloadDbBtn) downloadDbBtn.addEventListener('click', handleDownloadDatabase);

  const sendEmailBtn = document.getElementById('btn-send-email-backup');
  if (sendEmailBtn) sendEmailBtn.addEventListener('click', handleSendEmailBackup);

  const runBackfillBtn = document.getElementById('btn-run-backfill');
  if (runBackfillBtn) runBackfillBtn.addEventListener('click', handleRunBackfill);

  const testNtfyBtn = document.getElementById('btn-test-ntfy');
  if (testNtfyBtn) testNtfyBtn.addEventListener('click', handleTestNtfy);

  const testEmailBtn = document.getElementById('btn-test-email-digest');
  if (testEmailBtn) testEmailBtn.addEventListener('click', handleTestEmailDigest);

  // Close modal when clicking outside
  const modal = document.getElementById('admin-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAdminModal();
    });
  }

  // OKI Calculator events
  const calcBtn = document.getElementById('btn-calc-split');
  const calcInput = document.getElementById('calc-amount-input');
  if (calcBtn && calcInput) {
    calcBtn.addEventListener('click', () => {
      const amount = parseFloat(calcInput.value) || 0;
      calculateAndRenderContribution(amount);
    });

    calcInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        const amount = parseFloat(calcInput.value) || 0;
        calculateAndRenderContribution(amount);
      }
    });
  }

  // Calculator presets
  const presetBtns = document.querySelectorAll('.btn-preset-amount');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseFloat(btn.dataset.amount) || 1500;
      if (calcInput) calcInput.value = amount;
      calculateAndRenderContribution(amount);
    });
  });

  // Verify authentication state and mount view immediately without flicker
  if (state.adminToken) {
    showAppView();
    loadDashboard();
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    })
      .then(r => r.ok ? r.json() : { authenticated: false })
      .then(d => {
        if (d && d.authenticated) {
          const userLabel = document.getElementById('header-user-label');
          if (userLabel) userLabel.textContent = d.user || 'Użytkownik';
          const adminUserLabel = document.getElementById('admin-username-label');
          if (adminUserLabel) adminUserLabel.textContent = d.user || 'Użytkownik';
        } else {
          handleAuthRequired();
        }
      })
      .catch(() => {
        handleAuthRequired();
      });
  } else {
    showLoginScreen();
  }

  // Auto-refresh UI every 5 minutes in background only when authenticated
  setInterval(() => {
    if (state.adminToken) {
      loadDashboard();
    }
  }, 5 * 60 * 1000);
});
