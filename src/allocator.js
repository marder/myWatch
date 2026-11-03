/**
 * Portfolio Allocator & OKI Investment Engine
 * Translates Macro Risk Score into concrete portfolio weights and actionable instruments.
 */

// Master catalog of recommended core instruments for Polish investors (OKI / IKE / IKZE)
const INSTRUMENTS = {
  globalEquities: {
    name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
    ticker: 'VWCE.DE / VWRA.L',
    category: 'Globalne Akcje (Szeroki Świat)',
    description: 'Szeroki koszyk ponad 3 600 spółek z rynków rozwiniętych i wschodzących (Apple, Microsoft, Nvidia, TSMC, itp.). Akumulujący – reinwestuje dywidendy bez podatku.',
    role: 'Główny motor długoterminowego wzrostu majątku i ochrona przed inflacją.',
    assetType: 'ETF Akcyjny',
    eligibleOki: true,
  },
  polishEquitiesWig20: {
    name: 'Beta ETF WIG20TR',
    ticker: 'ETFBW20TR.PL',
    category: 'Polskie Akcje (GPW Blue Chips)',
    description: '20 największych spółek GPW (Orlen, PKO BP, Dino, KGHM) w wersji Total Return (reinwestującej dywidendy).',
    role: 'Ekspozycja na polski rynek i korzyści z wysokich dywidend krajowych liderów.',
    assetType: 'ETF Akcyjny GPW',
    eligibleOki: true,
  },
  polishEquitiesMwig40: {
    name: 'Beta ETF mWIG40TR',
    ticker: 'ETFBM40TR.PL',
    category: 'Polskie Średnie Spółki (Wzrost)',
    description: '40 średnich spółek z GPW – tradycyjnie najbardziej rentowny i zwinny segment polskiej gospodarki.',
    role: 'Dodatkowy potencjał wzrostu gospodarczego Polski.',
    assetType: 'ETF Akcyjny GPW',
    eligibleOki: true,
  },
  treasuryBondsTfsp: {
    name: 'Beta ETF TBSP (Polskie Obligacje Skarbowe)',
    ticker: 'ETFBSTBSP.PL',
    category: 'Obligacje Skarbowe Hurtowe (Rynek)',
    description: 'Indeks polskich obligacji skarbowych o stałym oprocentowaniu (Treasury BondSpot Poland). Zyskuje na wartości przy cięciach stóp przez NBP.',
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
 * Determine dynamic asset weights based on Risk Score and macro parameters
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
      bondsBreakdown: {
        marketEtfTbsp: 30, // Płynne obligacje
        retailInflationCoi: 35, // Antyinflacyjne EDO / COI
      },
      actionSummary: 'Tryb w pełni defensywny. Wstrzymaj zakupy akcji polskich i ogranicz globalne ETF do minimum. Zwiększ udział bezpiecznych obligacji skarbowych i gotówki.'
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
      bondsBreakdown: {
        marketEtfTbsp: 30,
        retailInflationCoi: 25,
      },
      actionSummary: 'Na rynkach rośnie nerwowość. Przeważaj obligacje skarbowe, gromadź bufor gotówki i wstrzymaj się z jednorazowymi dużymi zakupami akcji.'
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
      bondsBreakdown: {
        marketEtfTbsp: 25,
        retailInflationCoi: 15,
      },
      actionSummary: 'Umiarkowana zmienność. Realizuj systematyczne comiesięczne zakupy (DCA) w proporcji 50% akcje i 40% obligacje, zachowując 10% bufora.'
    };
  }

  // Reżim Stabilny (Domyślny dla 41-latka nastawionego na obniżone ryzyko)
  return {
    regime: 'STABILNY',
    strategyStance: 'Planowy Wzrost & Regularne DCA',
    weights: {
      globalEquities: 50,
      polishEquities: 15,
      treasuryBonds: 30,
      cashAndGold: 5,
    },
    bondsBreakdown: {
      marketEtfTbsp: 20,
      retailInflationCoi: 10,
    },
    actionSummary: 'Sprzyjające otoczenie makro. Bezpieczny moment na planowe, comiesięczne dopłaty do globalnego koszyka ETF i liderów GPW przy zachowaniu 30% w obligacjach.'
  };
}

/**
 * Generate full actionable recommendation object
 */
function getFullPortfolioRecommendation(riskScore, latestReading = {}) {
  const allocation = getTargetAllocationWeights(riskScore);

  // Concrete instrument buckets
  const buckets = [
    {
      category: '1. Globalny Koszyk Akcji (ETF)',
      weightPct: allocation.weights.globalEquities,
      instrument: INSTRUMENTS.globalEquities,
      actionAdvice: riskScore > 50 
        ? 'Kupuj wyłącznie w małych, regularnych transzach (DCA), nie rób dużych dopłat.' 
        : 'Główny cel dopłat. Kupuj regularnie co miesiąc bez prób zgadywania dołka.',
    },
    {
      category: '2. Polskie Akcje GPW (Liderzy & Dywidendy)',
      weightPct: allocation.weights.polishEquities,
      instrument: latestReading.wig_sma200_diff < -3.0 ? INSTRUMENTS.polishEquitiesMwig40 : INSTRUMENTS.polishEquitiesWig20,
      actionAdvice: allocation.weights.polishEquities === 0
        ? 'Wstrzymaj zakupy akcji polskich do czasu powrotu indeksu WIG powyżej średniej SMA200.'
        : 'Inwestuj w wersje Total Return (TR) reinwestujące dywidendy.',
    },
    {
      category: '3. Obligacje Skarbowe (Stabilizacja & Kupon)',
      weightPct: allocation.weights.treasuryBonds,
      instrument: latestReading.spread_10y_2y < -0.10 ? INSTRUMENTS.retailBondsTos : INSTRUMENTS.treasuryBondsTfsp,
      secondaryInstrument: INSTRUMENTS.retailBondsCoi,
      actionAdvice: latestReading.spread_10y_2y < -0.10
        ? 'Krzywa jest płaska/odwrócona. Zablokuj wysoki kupon w stałoprocentowych papierach (TOS / TBSP) przed obniżkami stóp.'
        : 'W OKI do 25 tys. zł użyj obligacji detalicznych TOS/COI, powyżej 25 tys. zł kupuj Beta ETF TBSP na giełdzie.',
    },
    {
      category: '4. Bezpieczna Płynność & Złoto',
      weightPct: allocation.weights.cashAndGold,
      instrument: riskScore >= 50 ? INSTRUMENTS.goldProtection : INSTRUMENTS.cashLiquidity,
      actionAdvice: riskScore >= 50
        ? 'Trzymaj poduszkę płynnościową na koncie oszczędnościowym i rozważ 5-10% ekspozycji na złoto.'
        : 'Trzymaj standardowy bufor płynności na nieprzewidziane wydatki.',
    }
  ];

  // Specific guidance for the new OKI account (Osobiste Konto Inwestycyjne)
  const okiGuidance = {
    totalLimitPln: 100000,
    savingsSublimitPln: 25000,
    capitalMarketMinPln: 75000,
    keyRules: [
      'Zwolnienie z podatku Belki (19%) do kwoty 100 000 zł łącznej wartości aktywów.',
      'Sublimit 25 000 zł na bezpieczną część oszczędnościową (lokaty, obligacje detaliczne COI/TOS).',
      'Pozostałe co najmniej 75 000 zł musi pracować na rynku kapitałowym (ETF-y akcyjne, obligacyjne TBSP na GPW, akcje).',
      'Brak zamrożenia środków – zyski można wypłacić w dowolnej chwili bez utraty ulgi podatkowej.',
      'Od nadwyżki ponad 100 000 zł naliczany jest nowy podatek od wartości aktywów.',
    ],
    tacticalTipFor41Yo: 'Mając 41 lat, w OKI wypełnij sublimit 25 tys. zł bezpiecznymi obligacjami detalicznymi (TOS/COI), a pozostałe 75 tys. zł podziel na ETF All-World (ok. 50-60 tys. zł) oraz ETF na polskie obligacje skarbowe TBSP na giełdzie (15-25 tys. zł). W ten sposób w 100% wykorzystasz ulgę bez podatku Belki przy minimalnym ryzyku!'
  };

  return {
    riskScore,
    regime: allocation.regime,
    strategyStance: allocation.strategyStance,
    actionSummary: allocation.actionSummary,
    weights: allocation.weights,
    buckets,
    okiGuidance,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate concrete monthly contribution split in PLN
 */
function calculateContributionSplit(amountPln, riskScore, latestReading = {}) {
  const total = Math.max(0, parseFloat(amountPln) || 0);
  const recommendation = getFullPortfolioRecommendation(riskScore, latestReading);
  const weights = recommendation.weights;

  const split = [
    {
      name: 'Globalne Akcje (ETF)',
      instrumentName: 'Vanguard FTSE All-World (VWCE)',
      ticker: 'VWCE.DE',
      percent: weights.globalEquities,
      amountPln: Math.round((total * (weights.globalEquities / 100)) * 100) / 100,
      note: 'Kup na rachunku maklerskim / OKI',
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
  ];

  return {
    totalAmountPln: total,
    regime: recommendation.regime,
    strategyStance: recommendation.strategyStance,
    split,
    okiAdvice: recommendation.okiGuidance.tacticalTipFor41Yo,
  };
}

module.exports = {
  INSTRUMENTS,
  getTargetAllocationWeights,
  getFullPortfolioRecommendation,
  calculateContributionSplit,
};
