const config = require('../config');
const allocator = require('./allocator');

/**
 * Forward-fill lookup: Find the latest value on or before the target date.
 * Assumes series is sorted chronologically ASC.
 */
function findLatestOnOrBefore(series, targetDate) {
  if (!series || series.length === 0) return null;
  let latest = null;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date <= targetDate) {
      latest = series[i];
    } else {
      break;
    }
  }
  return latest ? latest.close : (series[0]?.close ?? null);
}

/**
 * Find value at exact date or the closest preceding index in a sorted series.
 */
function findIndexOnOrBefore(series, targetDate) {
  if (!series || series.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date <= targetDate) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * Calculate 200-session Simple Moving Average up to a given index in wigSeries
 */
function calculateSma200(wigSeries, endIndex) {
  if (endIndex < 0 || endIndex >= wigSeries.length) return null;
  const startIndex = Math.max(0, endIndex - 199);
  const count = endIndex - startIndex + 1;
  let sum = 0;
  for (let i = startIndex; i <= endIndex; i++) {
    sum += wigSeries[i].close;
  }
  return Math.round((sum / count) * 100) / 100;
}

/**
 * Evaluate Pillar 1: Yield Curve Slope & Dynamics (Max 30 pts)
 */
function evaluatePillar1(pl10y, pl2y, pl10y_20d_ago) {
  if (pl10y == null || pl2y == null) return { score: 0, spread: 0, warning: null };

  const spread = Math.round((pl10y - pl2y) * 100) / 100;
  const pl10y_20d_chg = pl10y_20d_ago != null ? Math.round((pl10y - pl10y_20d_ago) * 100) / 100 : 0;

  let score = 0;
  let warning = null;

  if (spread < -0.35) {
    score = 30;
    warning = 'Głęboka inwersja krzywej dochodowości (PL10Y < PL2Y) – silny sygnał recesyjny.';
  } else if (spread < -0.10) {
    score = 22;
    warning = 'Inwersja krzywej dochodowości – rynek obligacji wycenia hamowanie gospodarki.';
  } else if (spread <= 0.15) {
    score = 12;
    warning = 'Płaska krzywa rentowności – faza przejściowa cyklu koniunkturalnego.';
  } else if (spread > 0.15 && pl10y_20d_chg > 0.50) {
    score = 15;
    warning = 'Gwałtowna wyprzedaż długu skarbowego (wzrost rentowności 10Y o >0.50 pp w 20 sesji).';
  }

  return { score, spread, warning };
}

/**
 * Evaluate Pillar 2: Sovereign Credit Risk Spread PL vs DE (Max 25 pts)
 */
function evaluatePillar2(pl10y, de10y) {
  if (pl10y == null || de10y == null) return { score: 0, spreadBps: 0, warning: null };

  const spreadBps = Math.round((pl10y - de10y) * 100);
  let score = 0;
  let warning = null;

  if (spreadBps > 400) {
    score = 25;
    warning = `Krytyczny spread kredytowy PL vs DE (${spreadBps} bps > 400) – silna presja odpływu kapitału.`;
  } else if (spreadBps > 330) {
    score = 18;
    warning = `Wysoka premia za ryzyko kraju (spread PL vs DE: ${spreadBps} bps).`;
  } else if (spreadBps > 270) {
    score = 8;
    warning = `Umiarkowanie podwyższony spread względem bundów niemieckich (${spreadBps} bps).`;
  }

  return { score, spreadBps, warning };
}

/**
 * Evaluate Pillar 3: FX Risk-Off Pressure — USD/PLN & EUR/PLN (Max 25 pts)
 */
function evaluatePillar3(usdNow, usd22dAgo, eurNow, eur22dAgo) {
  const usd30dChg = (usdNow && usd22dAgo) ? Math.round((((usdNow - usd22dAgo) / usd22dAgo) * 100) * 100) / 100 : 0;
  const eur30dChg = (eurNow && eur22dAgo) ? Math.round((((eurNow - eur22dAgo) / eur22dAgo) * 100) * 100) / 100 : 0;

  let score = 0;
  let warning = null;

  if (usd30dChg > 6.5 || eur30dChg > 4.5) {
    score = 25;
    warning = `Gwałtowna ucieczka od złotego (USD 30d: +${usd30dChg}%, EUR 30d: +${eur30dChg}%) – globalny tryb Risk-Off.`;
  } else if (usd30dChg > 4.0 || eur30dChg > 2.5) {
    score = 15;
    warning = `Wyraźne osłabienie PLN (USD 30d: +${usd30dChg}%, EUR 30d: +${eur30dChg}%) – odpływ kapitału portfelowego.`;
  } else if (usd30dChg > 2.0) {
    score = 6;
    warning = `Lekka presja podażowa na złotym (USD 30d: +${usd30dChg}%).`;
  }

  return { score, usd30dChg, eur30dChg, warning };
}

/**
 * Evaluate Pillar 4: GPW Equity Trend & Technical Regime (Max 20 pts)
 */
function evaluatePillar4(wigNow, sma200, wig20dAgo) {
  if (wigNow == null || sma200 == null) {
    return { score: 0, sma200: wigNow || 0, smaDiff: 0, warning: null };
  }

  const smaDiff = Math.round((((wigNow - sma200) / sma200) * 100) * 100) / 100;
  const wig20dChg = wig20dAgo ? Math.round((((wigNow - wig20dAgo) / wig20dAgo) * 100) * 100) / 100 : 0;

  let score = 0;
  let warning = null;

  if (smaDiff < -12.0) {
    score = 20;
    warning = `Rynek niedźwiedzia na GPW – indeks WIG głęboko poniżej SMA200 (${smaDiff}%).`;
  } else if (smaDiff < -3.0) {
    score = 12;
    warning = `Osłabienie trendu długoterminowego – WIG poniżej średniej 200-sesyjnej (${smaDiff}%).`;
  } else if (smaDiff >= -3.0 && wig20dChg < -8.0) {
    score = 10;
    warning = `Gwałtowna korekta krótkoterminowa na GPW (${wig20dChg}% w 20 sesji).`;
  }

  return { score, sma200, smaDiff, warning };
}

/**
 * Generate user-friendly advice for everyday people (No financial jargon)
 */
function generatePlainLanguageView(totalScore, p1, p2, p3, p4, metrics) {
  let trafficLight = 'safe';
  let badge = '🟢 Stan Stabilny';
  let badgeColor = 'emerald';
  let headline = '';
  let savingsAdvice = '';
  let loansAdvice = '';
  let investingAdvice = '';
  let currenciesAdvice = '';

  if (totalScore >= 76) {
    trafficLight = 'crisis';
    badge = '🔴 Alarm Kryzysowy';
    badgeColor = 'rose';
    headline = 'Duże turbulencje na rynkach finansowych. Zalecana maksymalna ostrożność i ochrona kapitału.';
    savingsAdvice = 'Ogranicz ryzyko do zera: bezpieczne obligacje Skarbu Państwa (COI, EDO, TOS) oraz konta w granicach gwarancji BFG (do 100 tys. EUR na osobę).';
    loansAdvice = 'Rynki długu są pod dużą presją. Koszt pieniądza może wzrosnąć, nie należy liczyć na szybkie obniżki rat kredytów.';
    investingAdvice = 'Tryb defensywny: nie kupuj akcji na siłę podczas spadków. Poczekaj na wygaszenie zmienności, utrzymując poduszkę gotówkową.';
    currenciesAdvice = 'Złoty gwałtownie traci. Jeśli masz wydatki w euro lub dolarach, licz się z wyższymi cenami wyjazdów i towarów importowanych.';
  } else if (totalScore >= 51) {
    trafficLight = 'warning';
    badge = '🟠 Podwyższone Ryzyko';
    badgeColor = 'orange';
    headline = 'Inwestorzy stają się nerwowi. Rośnie koszt pożyczania i widać odpływ zagranicznego kapitału.';
    savingsAdvice = 'Warto zabezpieczyć część oszczędności na dłuższy termin – sprawdź 4-letnie obligacje indeksowane inflacją (COI) lub dobre lokaty bankowe.';
    loansAdvice = 'Raty kredytów raczej nie spadną szybko. Prawdopodobna stabilizacja lub drobne wahania stawek WIBOR/WIRON.';
    investingAdvice = 'Zwiększ udział gotówki i obligacji w portfelu. Wstrzymaj się z dużymi jednorazowymi zakupami akcji – lepiej poczekać na uspokojenie nastrojów.';
    currenciesAdvice = 'Złoty jest pod lekką presją spadkową. Wakacje za granicą mogą być nieco droższe niż w poprzednich miesiącach.';
  } else if (totalScore >= 26) {
    trafficLight = 'caution';
    badge = '🟡 Umiarkowana Czujność';
    badgeColor = 'amber';
    headline = 'W gospodarce pojawiają się drobne sygnały ostrzegawcze, jednak sytuacja jest pod kontrolą.';
    savingsAdvice = 'Utrzymuj poduszkę finansową na poziomie 3–6 miesięcy wydatków. Lokaty bankowe i obligacje skarbowe dają wciąż przyzwoity procent.';
    loansAdvice = 'Stopy procentowe pozostają stabilne. Rynek nie wycenia w najbliższym czasie gwałtownych ruchów w górę ani w dół.';
    investingAdvice = 'Dobra pora na spokojne, regularne odkładanie stałych kwot (tzw. uśrednianie DCA) na konta emerytalne IKE/IKZE oraz w funduszach indeksowych.';
    currenciesAdvice = 'Kursy walut NBP (EUR i USD) poruszają się w stabilnych przedziałach. Nie ma potrzeby panicznego kupowania waluty.';
  } else {
    trafficLight = 'safe';
    badge = '🟢 Bezpiecznie i Stabilnie';
    badgeColor = 'emerald';
    headline = 'Na polskim rynku finansowym panuje spokój. Nie ma symptomów kryzysu ani paniki.';
    savingsAdvice = 'Warunki są stabilne. Jeśli chcesz mieć gwarantowany zysk, warto zablokować oprocentowanie obligacji skarbowych (np. 3-letnich TOS) przed ewentualnymi obniżkami stóp.';
    loansAdvice = 'Otoczenie sprzyja stopniowemu spadkowi kosztu kredytów w przyszłości. Brak presji na wzrost rat.';
    investingAdvice = 'Optymalne warunki dla długoterminowych inwestorów. Regularne zasilanie IKE/IKZE i funduszy akcji polskich spółek przynosi stabilne rezultaty.';
    currenciesAdvice = 'Złoty jest mocny i stabilny. Korzystne warunki do podróżowania i zakupów zagranicznych w euro oraz dolarach.';
  }

  const glossary = [
    {
      term: 'Krzywa dochodowości',
      explanation: 'Pokazuje, ile państwo płaci za pożyczkę na 2 lata vs na 10 lat. Zwykle za dłuższy okres dostajemy więcej. Gdy 2-letnie obligacje płacą więcej niż 10-letnie (inwersja), to sygnał, że gospodarka hamuje.',
    },
    {
      term: 'Spread kredytowy PL-DE',
      explanation: 'Różnica w oprocentowaniu między długiem Polski a Niemiec. Im większa, tym bardziej inwestorzy boją się o ryzyko i tym drożej Polska finansuje swoje wydatki.',
    },
    {
      term: 'Średnia SMA200 na GPW',
      explanation: 'Średnia cena polskich akcji z ostatnich 200 dni roboczych. Jeśli giełda jest powyżej tej linii – panuje hossa (wzrosty). Jeśli poniżej – rynek jest w defensywie.',
    }
  ];

  return {
    trafficLight,
    badge,
    badgeColor,
    headline,
    savingsAdvice,
    loansAdvice,
    investingAdvice,
    currenciesAdvice,
    glossary,
  };
}

/**
 * Calculate status and metrics for key GPW indices
 */
function extractGpwIndices(indicators, targetDate) {
  const { wig, wig20, mwig40, swig80, wig_banki } = indicators;

  const calculateIndexMetrics = (series, name, label) => {
    if (!series || series.length === 0) {
      return { name, label, close: null, change1d: 0, change1dPct: 0, status: 'Brak danych', statusColor: 'slate' };
    }

    const idx = findIndexOnOrBefore(series, targetDate);
    if (idx < 0) {
      return { name, label, close: null, change1d: 0, change1dPct: 0, status: 'Brak danych', statusColor: 'slate' };
    }

    const current = series[idx].close;
    const prev = idx > 0 ? series[idx - 1].close : current;
    const change1d = Math.round((current - prev) * 100) / 100;
    const change1dPct = prev ? Math.round((((current - prev) / prev) * 100) * 100) / 100 : 0;

    let status = 'Stabilny';
    let statusColor = 'emerald';

    if (change1dPct > 1.0) {
      status = 'Silny wzrost';
      statusColor = 'emerald';
    } else if (change1dPct > 0) {
      status = 'Wzrost';
      statusColor = 'emerald';
    } else if (change1dPct > -1.0) {
      status = 'Kompaktowa korekta';
      statusColor = 'amber';
    } else {
      status = 'Wyraźny spadek';
      statusColor = 'rose';
    }

    return {
      name,
      label,
      close: current,
      change1d,
      change1dPct,
      status,
      statusColor,
    };
  };

  return [
    calculateIndexMetrics(wig, 'WIG', 'Szeroki Rynek GPW'),
    calculateIndexMetrics(wig20, 'WIG20', '20 Największych Spółek (Blue Chips)'),
    calculateIndexMetrics(mwig40, 'mWIG40', 'Średnie Spółki (Wzrostowe)'),
    calculateIndexMetrics(swig80, 'sWIG80', 'Małe Spółki (Dywidendowe)'),
    calculateIndexMetrics(wig_banki, 'WIG-Banki', 'Sektor Bankowy (Kluczowy)'),
  ];
}

/**
 * Determine Status and Generate Actionable Investment Conclusions
 */
function generateConclusions(totalScore, p1, p2, p3, p4, metrics, indicators, targetDate) {
  let status = 'STABILNY';
  let tacticalStance = 'Akumulacja / Regularne DCA';

  if (totalScore >= 76) {
    status = 'ALARM KRYZYSOWY';
    tacticalStance = 'Tryb defensywny — ochrona kapitału i obligacje krótkoterminowe';
  } else if (totalScore >= 51) {
    status = 'PODWYŻSZONE RYZYKO';
    tacticalStance = 'Podwyższona czujność — selekcja dywidendowa i obligacje skarbowe';
  } else if (totalScore >= 26) {
    status = 'OSTRZEŻENIE';
    tacticalStance = 'Selektywna ostrożność — utrzymuj bufor gotówkowy';
  }

  // 1. Macro Summary (2-sentence synthesis)
  let macroSummary = '';
  if (totalScore >= 76) {
    macroSummary = `Wskaźnik presji kryzysowej osiągnął poziom alarmowy (${totalScore}/100 pkt) na skutek jednoczesnego zbiegu negatywnych impulsów na rynku długu, walutowym oraz giełdowym. Rynki wyceniają podwyższone ryzyko recesji lub gwałtowny odpływ kapitału zagranicznego z polskiego rynku.`;
  } else if (totalScore >= 51) {
    macroSummary = `Wskaźnik ryzyka makroekonomicznego wskazuje na podwyższoną presję (${totalScore}/100 pkt), głównie w obszarze ${p3.score >= 15 ? 'osłabienia waluty i odpływu zagranicznego' : (p1.score >= 15 ? 'krzywej dochodowości' : 'spready kredytowego PL-DE')}. Należy liczyć się z podwyższoną zmiennością wycen aktywów i koniecznością defensywnego pozycjonowania portfela.`;
  } else if (totalScore >= 26) {
    macroSummary = `Wskaźnik na poziomie umiarkowanym (${totalScore}/100 pkt) sygnalizuje lokalne czynniki ostrzegawcze, jednak fundamenty rynkowe pozostają w normie. Otoczenie wymaga selektywności, lecz nie wykazuje cech systemowego załamania płynności.`;
  } else {
    macroSummary = `Polski rynek finansowy znajduje się w stabilnej strefie makroekonomicznej (${totalScore}/100 pkt). Umiarkowany spread kredytowy PL-DE, stabilny złoty oraz dobra kondycja indeksu WIG sprzyjają kontynuacji planowych strategii inwestycyjnych.`;
  }

  // 2. Bonds & TFI View
  let bondsTfiView = '';
  if (p1.spread < -0.10) {
    if (metrics.pl10y > 5.5) {
      bondsTfiView = `Inwersja krzywej dochodowości (PL10Y-PL2Y = ${p1.spread} pp.) przy rentowności 10Y na poziomie ${metrics.pl10y}% tworzy okazję do 'zablokowania' wysokiego kuponu w funduszach skarbowych o stałym oprocentowaniu (duration 3-5 lat). W krótkim terminie zalecana ostrożność z uwagi na zmienność spreadu, jednak horyzont 12-24 m-cy faworyzuje długie papiery skarbowe.`;
    } else {
      bondsTfiView = `Płaska lub odwrócona krzywa sugeruje zakończenie cyklu zacieśniania polityki monetarnej. Fundusze dłużne uniwersalne i obligacji skarbowych oferują atrakcyjny profil zysku do ryzyka przy stopniowym wydłużaniu duration.`;
    }
  } else if (p2.spreadBps > 330) {
    bondsTfiView = `Wysoki spread kredytowy względem obligacji niemieckich (${p2.spreadBps} bps) nakazuje zachowanie ostrożności w segmencie długu korporacyjnego high-yield. Rekomendowane przeważenie bezpiecznych obligacji Skarbu Państwa (TFI Papierów Dłużnych Skarbowych) oraz funduszy krótkoterminowych (TFI Konserwatywne/Płynnościowe).`;
  } else {
    bondsTfiView = `Krzywa rentowności o normalnym nachyleniu oraz stabilny spread PL-DE (${p2.spreadBps} bps) sprzyjają regularnemu reinwestowaniu kuponów w funduszach polskich obligacji skarbowych i korporacyjnych o wysokim ratingu.`;
  }

  // 3. Equities GPW View
  let equitiesGpwView = '';
  if (p4.smaDiff < -12.0 || (p3.usd30dChg > 4.0 && p4.smaDiff < -3.0)) {
    equitiesGpwView = `Presja na złotym (USD/PLN 30d: ${p3.usd30dChg >= 0 ? '+' : ''}${p3.usd30dChg}%) wywołuje odpływ kapitału zagranicznego z indeksu WIG20. Przy notowaniach WIG poniżej średniej SMA200 (${p4.smaDiff}%) zaleca się wstrzymanie agresywnych zakupów lewarowanych i ograniczenie się do metodycznego uśredniania (DCA) w segmencie spółek dywidendowych oraz mWIG40.`;
  } else if (p4.smaDiff >= 0) {
    equitiesGpwView = `Indeks WIG utrzymuje się powyżej średniej kroczącej SMA200 (+${p4.smaDiff}%), co potwierdza strukturalną hossę. Korzystne warunki do selektywnej akumulacji liderów sektorowych (banki, przemysł, energetyka odnawialna). Dynamiczny wzrost USD może jednak ograniczać napływy funduszy globalnych do WIG20.`;
  } else {
    equitiesGpwView = `Kompaktowa korekta w okolice SMA200 (${p4.smaDiff}%) stwarza przestrzeń do akumulacji spółek generujących silne wolne przepływy pieniężne (FCF) i stabilne dywidendy. Utrzymuj bufor płynności na wypadek pogłębienia zmienności rynkowej.`;
  }

  // 4. Plain Language View for Everyday People (ELI5)
  const plainLanguage = generatePlainLanguageView(totalScore, p1, p2, p3, p4, metrics);

  // 5. GPW Indices Overview
  const gpwIndices = extractGpwIndices(indicators, targetDate);

  // 6. Portfolio & OKI Allocation Recommendation
  const portfolioRecommendation = allocator.getFullPortfolioRecommendation(totalScore, {
    spread_10y_2y: p1.spread,
    wig_sma200_diff: p4.smaDiff,
  });

  return {
    status,
    conclusions: {
      macro_summary: macroSummary,
      bonds_tfi_view: bondsTfiView,
      equities_gpw_view: equitiesGpwView,
      tactical_stance: tacticalStance,
      plain_language: plainLanguage,
      gpw_indices: gpwIndices,
      portfolio_recommendation: portfolioRecommendation,
    }
  };
}

/**
 * Align all indicators and compute a single day record
 */
function computeReadingForDate(targetDate, wigIndex, indicators) {
  const { usd, eur, pl10y, pl2y, de10y, wig } = indicators;

  const wigItem = wig[wigIndex];
  const wigClose = wigItem.close;

  // Align with forward-fill
  const pl10yVal = findLatestOnOrBefore(pl10y, targetDate);
  const pl2yVal = findLatestOnOrBefore(pl2y, targetDate);
  const de10yVal = findLatestOnOrBefore(de10y, targetDate);
  const usdVal = findLatestOnOrBefore(usd, targetDate);
  const eurVal = findLatestOnOrBefore(eur, targetDate);

  // Lookback values for 20d / 22d changes
  const pl10yIdx = findIndexOnOrBefore(pl10y, targetDate);
  const pl10y20dAgo = (pl10yIdx >= 20 && pl10y[pl10yIdx - 20]) ? pl10y[pl10yIdx - 20].close : pl10yVal;

  const usdIdx = findIndexOnOrBefore(usd, targetDate);
  const usd22dAgo = (usdIdx >= 22 && usd[usdIdx - 22]) ? usd[usdIdx - 22].close : (usd[0]?.close ?? usdVal);

  const eurIdx = findIndexOnOrBefore(eur, targetDate);
  const eur22dAgo = (eurIdx >= 22 && eur[eurIdx - 22]) ? eur[eurIdx - 22].close : (eur[0]?.close ?? eurVal);

  const wig20dAgo = (wigIndex >= 20 && wig[wigIndex - 20]) ? wig[wigIndex - 20].close : wigClose;
  const sma200Val = calculateSma200(wig, wigIndex);

  // Pillar 1: Yield Curve
  const p1 = evaluatePillar1(pl10yVal, pl2yVal, pl10y20dAgo);
  // Pillar 2: Sovereign Spread
  const p2 = evaluatePillar2(pl10yVal, de10yVal);
  // Pillar 3: FX Pressure
  const p3 = evaluatePillar3(usdVal, usd22dAgo, eurVal, eur22dAgo);
  // Pillar 4: GPW Equities
  const p4 = evaluatePillar4(wigClose, sma200Val, wig20dAgo);

  const totalScore = Math.min(100, Math.max(0, p1.score + p2.score + p3.score + p4.score));

  // Collect active warnings
  const warnings = [p1.warning, p2.warning, p3.warning, p4.warning].filter(Boolean);

  const metrics = {
    pl10y: pl10yVal,
    pl2y: pl2yVal,
    de10y: de10yVal,
    usd: usdVal,
    eur: eurVal,
  };

  const { status, conclusions } = generateConclusions(totalScore, p1, p2, p3, p4, metrics, indicators, targetDate);

  return {
    timestamp: targetDate,
    pl10y: pl10yVal,
    pl2y: pl2yVal,
    de10y: de10yVal,
    spread_10y_2y: p1.spread,
    spread_pl_de: p2.spreadBps,
    usd_pln: usdVal,
    usd_pln_30d_chg: p3.usd30dChg,
    eur_pln: eurVal,
    eur_pln_30d_chg: p3.eur30dChg,
    wig: wigClose,
    wig_sma200: p4.sma200,
    wig_sma200_diff: p4.smaDiff,
    risk_score: totalScore,
    score_curve: p1.score,
    score_sovereign: p2.score,
    score_fx: p3.score,
    score_equities: p4.score,
    status,
    warnings,
    warnings_json: JSON.stringify(warnings),
    conclusions,
    conclusions_json: JSON.stringify(conclusions),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Execute Historical Backfill (up to full annual trading calendar)
 */
function processHistoricalBackfill(indicators, backfillCount = config.backfillDays) {
  const { wig } = indicators;
  if (!wig || wig.length === 0) {
    throw new Error('[Analyzer] Cannot perform backfill: WIG series is empty.');
  }

  const totalWigSessions = wig.length;
  const startIndex = Math.max(0, totalWigSessions - backfillCount);

  console.log(`[Analyzer] Processing backfill for ${totalWigSessions - startIndex} trading sessions (from ${wig[startIndex].date} to ${wig[totalWigSessions - 1].date})...`);

  const results = [];
  for (let i = startIndex; i < totalWigSessions; i++) {
    const targetDate = wig[i].date;
    const reading = computeReadingForDate(targetDate, i, indicators);
    results.push(reading);
  }

  return results;
}

/**
 * Compute reading for the latest single date
 */
function processLatestReading(indicators) {
  const { wig } = indicators;
  if (!wig || wig.length === 0) {
    throw new Error('[Analyzer] WIG series is empty.');
  }
  const latestIndex = wig.length - 1;
  const targetDate = wig[latestIndex].date;
  return computeReadingForDate(targetDate, latestIndex, indicators);
}

module.exports = {
  findLatestOnOrBefore,
  calculateSma200,
  evaluatePillar1,
  evaluatePillar2,
  evaluatePillar3,
  evaluatePillar4,
  generateConclusions,
  generatePlainLanguageView,
  extractGpwIndices,
  computeReadingForDate,
  processHistoricalBackfill,
  processLatestReading,
};
