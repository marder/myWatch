/**
 * Portfolio Allocator & OKI Investment Engine
 * Translates Macro Risk Score into concrete portfolio weights and actionable instruments.
 */

// Master catalog of recommended core instruments for Polish investors (OKI / IKE / IKZE)
const INSTRUMENTS = {
  globalEquities: {
    name: 'Beta ETF S&P 500 PLN-Hedged',
    ticker: 'ETFBSPXPL.PL',
    category: 'Globalne Akcje (S&P 500 w PLN / Hedged)',
    description: 'Zgodny z wymogami OKI — notowany na GPW w polskich złotych (PLN), z zabezpieczeniem ryzyka walutowego lub w strukturze funduszu FIO.',
    role: 'Główny motor długoterminowego wzrostu majątku i ekspozycja globalna w ramach konta OKI bez podatku Belki.',
    assetType: 'ETF Akcyjny GPW (PLN)',
    eligibleOki: true,
  },
  polishEquitiesWig20: {
    name: 'Beta ETF WIG20TR',
    ticker: 'ETFBW20TR.PL',
    category: 'Polskie Akcje (GPW Blue Chips)',
    description: '20 największych spółek GPW w wersji Total Return (reinwestującej dywidendy). Zgodny z wymogami OKI (notowany na GPW w PLN).',
    role: 'Ekspozycja na polski rynek i korzyści z wysokich dywidend krajowych liderów.',
    assetType: 'ETF Akcyjny GPW',
    eligibleOki: true,
  },
  polishEquitiesMwig40: {
    name: 'Beta ETF mWIG40TR',
    ticker: 'ETFBM40TR.PL',
    category: 'Polskie Średnie Spółki (Wzrost)',
    description: '40 średnich spółek z GPW – tradycyjnie najbardziej rentowny i zwinny segment polskiej gospodarki. Zgodny z wymogami OKI (notowany na GPW w PLN).',
    role: 'Dodatkowy potencjał wzrostu gospodarczego Polski.',
    assetType: 'ETF Akcyjny GPW',
    eligibleOki: true,
  },
  treasuryBondsTfsp: {
    name: 'Beta ETF TBSP (Polskie Obligacje Skarbowe)',
    ticker: 'ETFBSTBSP.PL',
    category: 'Obligacje Skarbowe Hurtowe (Rynek)',
    description: 'Indeks polskich obligacji skarbowych (Treasury BondSpot Poland) notowany na GPW w PLN. Wolny od podlimitu 25k zł – pozwala wykorzystać pełne 100 000 zł ulgi w OKI.',
    role: 'Kluczowy instrument dłużny w OKI do wykorzystania pełnego limitu 100 tys. zł (poza podlimitem 25k).',
    assetType: 'ETF Dłużny GPW',
    eligibleOki: true,
  },
  retailBondsTos: {
    name: 'Obligacje Skarbowe 3-letnie (TOS)',
    ticker: 'TOS (Skarb Państwa)',
    category: 'Obligacje Detaliczne Stałoprocentowe',
    description: 'Gwarantowane przez Skarb Państwa obligacje o stałym oprocentowaniu ze stałą kapitalizacją odsetek.',
    role: 'Zablokowanie wysokiego oprocentowania na 3 lata (w ramach podlimitu 25 tys. zł w OKI).',
    assetType: 'Obligacje Detaliczne',
    eligibleOki: true,
    sublimitNote: 'Zaliczane do podlimitu oszczędnościowego 25 000 zł w OKI',
  },
  retailBondsCoi: {
    name: 'Obligacje Skarbowe 4-letnie Indeksowane Inflacją (COI)',
    ticker: 'COI (Skarb Państwa)',
    category: 'Obligacje Detaliczne Antyinflacyjne',
    description: 'Marża gwarantowana + stopa inflacji GUS. Oprocentowanie rośnie wraz z inflacją.',
    role: 'Tarcza antyinflacyjna w okresach podwyższonej presji cenowej (w ramach podlimitu 25k zł w OKI).',
    assetType: 'Obligacje Detaliczne',
    eligibleOki: true,
    sublimitNote: 'Zaliczane do podlimitu oszczędnościowego 25 000 zł w OKI',
  },
  goldProtection: {
    name: 'Złoto Inwestycyjne (Fizyczne / ETC z fizycznym zabezpieczeniem)',
    ticker: '4GLD.DE (Xetra-Gold) / Sztabki i monety bulionowe',
    category: 'Metale Szlachetne (Zabezpieczenie)',
    description: 'Klasyczna polisa ubezpieczeniowa portfela na wypadek głębokich kryzysów geopolitycznych i załamania walut fiducjarnych.',
    role: 'Ochrona siły nabywczej przy skrajnym ryzyku rynkowym.',
    assetType: 'ETC / Złoto Fizyczne',
    eligibleOki: false, // Physical gold outside OKI, ETC available in DM
  },
  cashLiquidity: {
    name: 'Konta Oszczędnościowe / Lokaty Płynnościowe',
    ticker: 'Gotówka / Depozyt Bankowy',
    category: 'Płynna Gotówka',
    description: 'Depozyty w bankach objętych gwarancjami Bankowego Funduszu Gwarancyjnego (BFG do 100 000 EUR na osobę).',
    role: 'Bieżąca poduszka finansowa i suchy proch na dokupowanie przecenionych aktywów.',
    assetType: 'Pieniądz Płynny',
    eligibleOki: true,
    sublimitNote: 'Zaliczane do podlimitu oszczędnościowego 25 000 zł w OKI',
  }
};

/**
 * Determine dynamic asset weights based on Risk Score and macro parameters.
 * Separates target weights for accumulated portfolio capital (Capital Preservation)
 * from new monthly DCA contribution weights (Contrarian Accumulation).
 * Strictly respects the 25,000 PLN (25%) OKI savings sublimit vs 75,000 PLN capital market portion.
 */
function getTargetAllocationWeights(riskScore) {
  if (riskScore >= 76) {
    // Reżim Kryzysowy
    return {
      regime: 'ALARM KRYZYSOWY',
      strategyStance: 'Obrona Kapitału i Maksymalna Płynność',
      weights: {
        globalEquities: 10,
        polishEquities: 0,
        treasuryBonds: 65,
        cashAndGold: 25,
      },
      dcaWeights: {
        globalEquities: 20,
        polishEquities: 10,
        treasuryBonds: 50,
        cashAndGold: 20,
      },
      bondsBreakdown: {
        marketEtfTbsp: 45, // Giełdowy Beta ETF TBSP (w ramach min. 75k rynku kapitałowego OKI)
        retailInflationCoi: 20, // Detaliczne COI/TOS (mieszczące się w podlimicie 25k zł OKI)
      },
      actionSummary: 'Tryb defensywny dla zgromadzonego majątku: chroń kapitał w obligacjach skarbowych (w OKI do 25 tys. zł w detalicznych COI/TOS, a nadwyżkę w giełdowym Beta ETF TBSP). Nowe miesięczne wpłaty DCA dziel ostrożnie, wykorzystując przeceny w małych transzach.'
    };
  }

  if (riskScore >= 51) {
    // Reżim Podwyższonego Ryzyka
    return {
      regime: 'PODWYŻSZONE RYZYKO',
      strategyStance: 'Ostrożność i Przeważenie Długu Skarbowego',
      weights: {
        globalEquities: 25,
        polishEquities: 5,
        treasuryBonds: 55,
        cashAndGold: 15,
      },
      dcaWeights: {
        globalEquities: 30,
        polishEquities: 10,
        treasuryBonds: 45,
        cashAndGold: 15,
      },
      bondsBreakdown: {
        marketEtfTbsp: 35, // Giełdowy ETF TBSP bez limitu 25k
        retailInflationCoi: 20, // Detaliczne COI/TOS w ramach podlimitu 25k zł
      },
      actionSummary: 'Na rynkach rośnie nerwowość. Przeważaj obligacje skarbowe (pamiętając o limicie 25 tys. zł na część detaliczną w OKI – nadwyżkę kieruj w Beta ETF TBSP na GPW) i wstrzymaj się z jednorazowymi dużymi zakupami akcji.'
    };
  }

  if (riskScore >= 26) {
    // Reżim Ostrzeżenia
    return {
      regime: 'OSTRZEŻENIE',
      strategyStance: 'Zrównoważona Akumulacja z Buforem',
      weights: {
        globalEquities: 40,
        polishEquities: 10,
        treasuryBonds: 40,
        cashAndGold: 10,
      },
      dcaWeights: {
        globalEquities: 40,
        polishEquities: 10,
        treasuryBonds: 40,
        cashAndGold: 10,
      },
      bondsBreakdown: {
        marketEtfTbsp: 25,
        retailInflationCoi: 15,
      },
      actionSummary: 'Umiarkowana zmienność. Realizuj systematyczne comiesięczne zakupy (DCA) w proporcji 50% akcje (w PLN na GPW) i 40% obligacje skarbowe, zachowując 10% bufora płynnościowego.'
    };
  }

  // Reżim Stabilny (Domyślny dla inwestora nastawionego na obniżone ryzyko)
  return {
    regime: 'STABILNY',
    strategyStance: 'Planowy Wzrost & Regularne DCA',
    weights: {
      globalEquities: 50,
      polishEquities: 15,
      treasuryBonds: 30,
      cashAndGold: 5,
    },
    dcaWeights: {
      globalEquities: 50,
      polishEquities: 15,
      treasuryBonds: 30,
      cashAndGold: 5,
    },
    bondsBreakdown: {
      marketEtfTbsp: 20,
      retailInflationCoi: 10,
    },
    actionSummary: 'Sprzyjające otoczenie makro. Bezpieczny moment na planowe, comiesięczne dopłaty do globalnego koszyka ETF w PLN (ETFBSPXPL.PL) i liderów GPW przy zachowaniu 30% w obligacjach.'
  };
}

/**
 * Generate full actionable recommendation object
 */
function getFullPortfolioRecommendation(riskScore, latestReading = {}) {
  const allocation = getTargetAllocationWeights(riskScore);

  const isCurveInverted = (latestReading.spread_10y_2y ?? 0) < -0.10;
  const isBondSelloff = (latestReading.pl10y_20d_chg ?? 0) > 0.40;

  let bondsActionAdvice = 'W OKI do 25 tys. zł użyj obligacji detalicznych TOS/COI, a powyżej 25 tys. zł kupuj giełdowy Beta ETF TBSP (ETFBSTBSP.PL), który nie podlega podlimitowi oszczędnościowemu.';
  if (isBondSelloff) {
    bondsActionAdvice = 'Uwaga na ryzyko stopy procentowej (wzrost rentowności 10Y): w pierwszej kolejności wypełnij podlimit 25 tys. zł obligacjami antyinflacyjnymi COI, a giełdowy Beta ETF TBSP dokupuj stopniowo małymi transzami.';
  } else if (isCurveInverted) {
    bondsActionAdvice = 'Krzywa dochodowości jest odwrócona: zablokuj wysoki stały kupon w 3-letnich obligacjach TOS (w podlimicie 25 tys. zł OKI) oraz w giełdowym Beta ETF TBSP (powyżej 25 tys. zł) przed obniżkami stóp NBP.';
  }

  // Concrete instrument buckets
  const buckets = [
    {
      category: '1. Globalny Koszyk Akcji (ETF w PLN)',
      weightPct: allocation.weights.globalEquities,
      instrument: INSTRUMENTS.globalEquities,
      secondaryInstrument: {
        name: 'inPZU Akcje Rynków Rozwiniętych O (inPZU Global Equity PLN)',
        ticker: 'inPZU FIO',
      },
      actionAdvice: riskScore > 50 
        ? 'Kupuj wyłącznie w małych, regularnych transzach (DCA), nie rób dużych jednorazowych dopłat.' 
        : 'Główny motor wzrostu w OKI. Kupuj regularnie co miesiąc bez prób zgadywania dołka.',
    },
    {
      category: '2. Polskie Akcje GPW (Liderzy & Dywidendy)',
      weightPct: allocation.weights.polishEquities,
      instrument: latestReading.wig_sma200_diff < -3.0 ? INSTRUMENTS.polishEquitiesMwig40 : INSTRUMENTS.polishEquitiesWig20,
      actionAdvice: allocation.weights.polishEquities === 0
        ? 'Dla zgromadzonego kapitału wstrzymaj duże zakupy; w nowych wpłatach DCA uśredniaj wyłącznie małymi transzami (do 10% wpłaty).'
        : 'Inwestuj na GPW w wersje Total Return (TR) automatycznie reinwestujące dywidendy bez podatku Belki.',
    },
    {
      category: '3. Obligacje Skarbowe (Stabilizacja & Kupon)',
      weightPct: allocation.weights.treasuryBonds,
      instrument: INSTRUMENTS.treasuryBondsTfsp,
      secondaryInstrument: isCurveInverted ? INSTRUMENTS.retailBondsTos : INSTRUMENTS.retailBondsCoi,
      actionAdvice: bondsActionAdvice,
    },
    {
      category: '4. Bezpieczna Płynność & Złoto',
      weightPct: allocation.weights.cashAndGold,
      instrument: riskScore >= 50 ? INSTRUMENTS.goldProtection : INSTRUMENTS.cashLiquidity,
      actionAdvice: riskScore >= 50
        ? 'Utrzymuj poduszkę płynnościową na koncie BFG (w ramach podlimitu 25k w OKI) i rozważ 5-10% ekspozycji na złoto fizyczne poza OKI.'
        : 'Trzymaj standardowy bufor płynności na okazje rynkowe i nieprzewidziane wydatki.',
    }
  ];

  // Specific guidance for the new OKI account (Osobiste Konto Inwestycyjne)
  const okiGuidance = {
    totalLimitPln: 100000,
    savingsSublimitPln: 25000,
    capitalMarketMinPln: 75000,
    keyRules: [
      'Zwolnienie z podatku Belki (19%) do kwoty 100 000 zł łącznej wartości aktywów.',
      'Sublimit 25 000 zł na bezpieczną część oszczędnościową (lokaty + obligacje detaliczne COI/TOS łącznie).',
      'Pozostałe co najmniej 75 000 zł musi pracować na rynku kapitałowym w PLN (ETF-y akcyjne i obligacyjne TBSP na GPW, akcje, FIO).',
      'Brak zamrożenia środków – kapitał i zyski można wypłacić w dowolnej chwili bez utraty ulgi podatkowej.',
      'Od nadwyżki ponad 100 000 zł naliczany jest niski podatek od wartości aktywów (ok. 0,8-0,9% rocznie).',
    ],
    tacticalTip: 'W koncie OKI wypełnij sublimit 25 tys. zł bezpiecznymi obligacjami detalicznymi (TOS/COI), a pozostałe min. 75 tys. zł ulokuj w notowanym na GPW w PLN funduszu Beta ETF S&P 500 PLN-Hedged (ETFBSPXPL.PL) oraz hurtowym ETF-ie obligacji skarbowych TBSP na giełdzie (ETFBSTBSP.PL). Nawet w reżimie defensywnym nadwyżkę obligacji ponad 25 tys. zł trzymaj w ETFBSTBSP.PL, aby nie przekroczyć podlimitu oszczędnościowego!'
  };

  return {
    riskScore,
    regime: allocation.regime,
    strategyStance: allocation.strategyStance,
    actionSummary: allocation.actionSummary,
    weights: allocation.weights,
    dcaWeights: allocation.dcaWeights,
    bondsBreakdown: allocation.bondsBreakdown,
    buckets,
    okiGuidance,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate concrete monthly contribution split in PLN.
 * Uses dcaWeights so monthly regular savers continue contrarian accumulation during market dips
 * while respecting OKI sublimit rules.
 */
function calculateContributionSplit(amountPln, riskScore, latestReading = {}) {
  const total = Math.max(0, parseFloat(amountPln) || 0);
  const allocation = getTargetAllocationWeights(riskScore);
  const recommendation = getFullPortfolioRecommendation(riskScore, latestReading);
  const weights = allocation.dcaWeights || allocation.weights;
  const isCrisisDca = riskScore >= 76;

  const split = [
    {
      name: 'Globalne Akcje (ETF w PLN)',
      instrumentName: 'Beta ETF S&P 500 PLN-Hedged (lub inPZU Global Equity PLN)',
      ticker: 'ETFBSPXPL.PL',
      percent: weights.globalEquities,
      amountPln: Math.round((total * (weights.globalEquities / 100)) * 100) / 100,
      note: isCrisisDca
        ? 'Kontrariańska transza DCA na wyprzedaży (GPW w PLN)'
        : 'Zgodny z OKI — notowany na GPW w PLN',
    },
    {
      name: 'Polskie Akcje (GPW)',
      instrumentName: 'Beta ETF WIG20TR / mWIG40TR',
      ticker: 'ETFBW20TR / ETFBM40TR',
      percent: weights.polishEquities,
      amountPln: Math.round((total * (weights.polishEquities / 100)) * 100) / 100,
      note: isCrisisDca
        ? 'Mała transza akumulacyjna DCA przy niskich wycenach'
        : 'Kup na GPW w ramach części kapitałowej OKI',
    },
    {
      name: 'Obligacje Skarbowe',
      instrumentName: 'Beta ETF TBSP (giełda) lub TOS/COI (podlimit 25k)',
      ticker: 'ETFBSTBSP / TOS / COI',
      percent: weights.treasuryBonds,
      amountPln: Math.round((total * (weights.treasuryBonds / 100)) * 100) / 100,
      note: 'Do 25k zł w OKI: TOS/COI; powyżej 25k zł: giełdowy ETFBSTBSP.PL',
    },
    {
      name: 'Płynna Gotówka / Złoto',
      instrumentName: 'Konto Oszczędnościowe BFG / Złoto',
      ticker: 'Konto OKI / Złoto fizyczne',
      percent: weights.cashAndGold,
      amountPln: Math.round((total * (weights.cashAndGold / 100)) * 100) / 100,
      note: riskScore >= 51
        ? 'Bufor płynności BFG (w limicie 25k OKI) lub złoto fizyczne poza OKI'
        : 'Zasil konto oszczędnościowe lub zachowaj bufor płynności',
    }
  ];

  return {
    totalAmountPln: total,
    regime: recommendation.regime,
    strategyStance: recommendation.strategyStance,
    split,
    okiAdvice: recommendation.okiGuidance.tacticalTip,
  };
}

module.exports = {
  INSTRUMENTS,
  getTargetAllocationWeights,
  getFullPortfolioRecommendation,
  calculateContributionSplit,
};
