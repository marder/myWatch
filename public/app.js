/**
 * Poland Macro Crisis Radar — Frontend Controller
 */

// Application State
const state = {
  latest: null,
  history: [],
  news: [],
  adminToken: sessionStorage.getItem('macro_radar_token') || null,
  charts: {
    risk: null,
    curve: null,
    fx: null,
    wig: null,
  },
  isRefreshing: false,
};

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
  try {
    const [latestRes, historyRes, newsRes, healthRes] = await Promise.all([
      fetch('/api/latest'),
      fetch('/api/history?limit=60'),
      fetch('/api/news'),
      fetch('/api/health')
    ]);

    if (!latestRes.ok) {
      throw new Error(`Błąd wczytywania najnowszego odczytu (HTTP ${latestRes.status})`);
    }

    state.latest = await latestRes.json();
    state.history = historyRes.ok ? await historyRes.json() : [];
    state.news = newsRes.ok ? await newsRes.json() : [];

    // Render components
    renderPlainLanguageSection(state.latest?.conclusions?.plain_language);
    renderGpwIndices(state.latest?.conclusions?.gpw_indices);
    renderHeroSection(state.latest);
    const allocRec = state.latest?.conclusions?.portfolio_recommendation || 
      (await fetch('/api/allocation').then(r => r.ok ? r.json() : null).catch(() => null));
    renderAllocationSection(allocRec);
    renderKpiCards(state.latest);
    renderWarnings(state.latest.warnings || []);
    renderNewsSection(state.news);
    renderHistoryTable(state.history);
    renderCharts(state.history);

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
 * Render Hero Section: Score, Gauge, Progress Bars, Conclusions
 */
function renderHeroSection(data) {
  if (!data) return;

  const headerDate = document.getElementById('header-date');
  if (headerDate) headerDate.textContent = data.timestamp || '--';

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
    updateTs.textContent = `Przeliczono: ${new Date(data.updated_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
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
 * Calculate and render monthly contribution split in PLN
 */
async function calculateAndRenderContribution(amountPln) {
  const container = document.getElementById('calc-results-container');
  if (!container) return;

  try {
    const res = await fetch('/api/allocation/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountPln })
    });

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

    const res = await fetch('/api/refresh', { method: 'POST' });
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
  } catch (err) {
    console.error('Błąd pobierania statystyk bazy:', err);
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
    sessionStorage.setItem('macro_radar_token', data.token);
    const labelEl = document.getElementById('admin-username-label');
    if (labelEl) labelEl.textContent = data.user || 'admin';
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
  sessionStorage.removeItem('macro_radar_token');
  showToast('Wylogowano z panelu bazy danych.', 'success');
  showLoginView();
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

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshClick);

  const adminModalBtn = document.getElementById('admin-modal-btn');
  if (adminModalBtn) adminModalBtn.addEventListener('click', openAdminModal);

  const closeModalBtn = document.getElementById('close-modal-btn');
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeAdminModal);

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

  // Close modal when clicking outside
  const modal = document.getElementById('admin-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAdminModal();
    });
  }

  // Check existing token
  if (state.adminToken) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    })
      .then(r => r.json())
      .then(d => {
        if (!d.authenticated) {
          state.adminToken = null;
          sessionStorage.removeItem('macro_radar_token');
        }
      })
      .catch(() => {});
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

  // Load data immediately
  loadDashboard();

  // Auto-refresh UI every 5 minutes in background
  setInterval(loadDashboard, 5 * 60 * 1000);
});
