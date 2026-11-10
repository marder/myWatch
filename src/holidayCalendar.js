/**
 * Poland Macro Crisis Radar — Polish Holidays & GPW Market Schedule
 * 
 * Handles:
 * - Polish statutory non-working days (Ustawa o dniach wolnych od pracy)
 * - Warsaw Stock Exchange (GPW) non-trading schedule (Good Friday, Christmas Eve, New Year's Eve)
 * - Trading session hours calculation (09:00 - 17:05 Warsaw time)
 * - Next trading day resolution
 */

/**
 * Calculates Gregorian Easter Sunday using Meeus/Jones/Butcher algorithm
 * @param {number} year
 * @returns {Date} Date object in UTC set to Easter Sunday midnight
 */
function getEasterSunday(year) {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Add days to a Date object (in UTC)
 */
function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Formats a Date object to 'YYYY-MM-DD'
 */
function formatDateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get map of all Polish statutory & GPW trading holidays for a given year
 * @param {number} year
 * @returns {Map<string, { name: string, isStatutory: boolean, isGpwClosed: boolean }>}
 */
function getHolidaysForYear(year) {
  const holidays = new Map();

  // 1. Stałe święta ustawowe (dni ustawowo wolne od pracy w RP)
  holidays.set(`${year}-01-01`, { name: 'Nowy Rok', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-01-06`, { name: 'Święto Trzech Króli', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-05-01`, { name: 'Święto Pracy', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-05-03`, { name: 'Święto Konstytucji 3 Maja', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-08-15`, { name: 'Wniebowzięcie NMP / Święto Wojska Polskiego', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-11-01`, { name: 'Wszystkich Świętych', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-11-11`, { name: 'Narodowe Święto Niepodległości', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-12-25`, { name: 'Boże Narodzenie (I dzień)', isStatutory: true, isGpwClosed: true });
  holidays.set(`${year}-12-26`, { name: 'Boże Narodzenie (II dzień)', isStatutory: true, isGpwClosed: true });

  // 2. Dodatkowe dni wolne od sesji na GPW (zgodnie z uchwałami Zarządu GPW)
  holidays.set(`${year}-12-24`, { name: 'Wigilia Bożego Narodzenia (brak sesji GPW)', isStatutory: false, isGpwClosed: true });
  holidays.set(`${year}-12-31`, { name: 'Sylwester (brak sesji GPW)', isStatutory: false, isGpwClosed: true });

  // 3. Ruchome święta wielkanocne
  const easter = getEasterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);
  const corpusChristi = addDays(easter, 60); // Boże Ciało

  holidays.set(formatDateKey(goodFriday), { name: 'Wielki Piątek (brak sesji GPW)', isStatutory: false, isGpwClosed: true });
  holidays.set(formatDateKey(easter), { name: 'Niedziela Wielkanocna', isStatutory: true, isGpwClosed: true });
  holidays.set(formatDateKey(easterMonday), { name: 'Poniedziałek Wielkanocny', isStatutory: true, isGpwClosed: true });
  holidays.set(formatDateKey(corpusChristi), { name: 'Boże Ciało', isStatutory: true, isGpwClosed: true });

  return holidays;
}

/**
 * Check if a specific date is a Polish / GPW holiday
 * @param {string|Date} dateOrStr YYYY-MM-DD or Date
 * @returns {{ isHoliday: boolean, name: string|null, isStatutory: boolean, isGpwClosed: boolean }}
 */
function getHolidayInfo(dateOrStr) {
  let dateKey = '';
  let year = 2026;

  if (typeof dateOrStr === 'string') {
    dateKey = dateOrStr.slice(0, 10);
    year = parseInt(dateKey.slice(0, 4), 10);
  } else if (dateOrStr instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dateOrStr);
    dateKey = parts;
    year = parseInt(parts.slice(0, 4), 10);
  }

  const holidays = getHolidaysForYear(year);
  const holiday = holidays.get(dateKey);

  if (holiday) {
    return {
      isHoliday: true,
      name: holiday.name,
      isStatutory: holiday.isStatutory,
      isGpwClosed: holiday.isGpwClosed,
      dateKey,
    };
  }

  return {
    isHoliday: false,
    name: null,
    isStatutory: false,
    isGpwClosed: false,
    dateKey,
  };
}

/**
 * Check if a given date is a valid GPW trading day (not weekend and not holiday)
 * @param {Date} date
 * @returns {boolean}
 */
function isTradingDay(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const partMap = {};
  parts.forEach(p => { partMap[p.type] = p.value; });
  const weekday = partMap.weekday; // 'Sun', 'Mon', ... 'Sat'
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const dateKey = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const holiday = getHolidayInfo(dateKey);
  if (holiday.isHoliday && holiday.isGpwClosed) {
    return false;
  }

  return true;
}

/**
 * Find the next upcoming trading day
 * @param {Date} fromDate
 * @returns {string} YYYY-MM-DD
 */
function getNextTradingDay(fromDate = new Date()) {
  const cursor = new Date(fromDate.getTime());
  for (let i = 1; i <= 14; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (isTradingDay(cursor)) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Warsaw',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(cursor);
      return parts;
    }
  }
  return '';
}

/**
 * Get comprehensive market session status for current or specified moment
 * @param {Date} [referenceDate]
 */
function getMarketStatus(referenceDate = new Date()) {
  // Format in Europe/Warsaw
  const warsawFormatter = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hour12: false,
  });

  const parts = warsawFormatter.formatToParts(referenceDate);
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });

  const dateKey = `${p.year}-${p.month}-${p.day}`;
  const hour = parseInt(p.hour, 10);
  const minute = parseInt(p.minute, 10);
  const timeMinutes = hour * 60 + minute;

  // Day of week in Warsaw
  // Sunday = 0, Saturday = 6
  const enDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', weekday: 'short' }).format(referenceDate);
  const isWeekend = enDay === 'Sat' || enDay === 'Sun';

  const holidayInfo = getHolidayInfo(dateKey);
  const isHoliday = holidayInfo.isHoliday;
  const isGpwClosed = holidayInfo.isGpwClosed;

  // GPW continuous trading: 09:00 (540 min) to 17:05 (1025 min)
  const SESSION_OPEN_MIN = 9 * 60; // 09:00
  const SESSION_CLOSE_MIN = 17 * 60 + 5; // 17:05

  const isTradingHours = !isWeekend && !isGpwClosed && (timeMinutes >= SESSION_OPEN_MIN && timeMinutes < SESSION_CLOSE_MIN);

  let state = 'OPEN';
  let badgeText = 'Live';
  let badgeClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  let statusExplanation = 'Trwa regularna sesja giełdowa na GPW (notowania ciągłe 09:00 – 17:05).';

  if (isWeekend) {
    state = 'WEEKEND';
    badgeText = 'Giełda: Weekend';
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    statusExplanation = 'Dziś jest weekend — giełda GPW nie handluje. Ostatnie notowania pochodzą z piątkowej sesji.';
  } else if (isGpwClosed) {
    state = 'HOLIDAY';
    badgeText = `Święto: ${holidayInfo.name}`;
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    statusExplanation = `Dziś na GPW nie ma sesji ze względu na dzień świąteczny: ${holidayInfo.name}.`;
  } else if (timeMinutes < SESSION_OPEN_MIN) {
    state = 'PRE_MARKET';
    badgeText = 'Przed sesją';
    badgeClass = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    statusExplanation = `Giełda rozpoczyna notowania ciągłe o 09:00. Ostatnie dane pochodzą z poprzedniego dnia handlowego.`;
  } else if (timeMinutes >= SESSION_CLOSE_MIN) {
    state = 'POST_MARKET';
    badgeText = 'Po sesji';
    badgeClass = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    statusExplanation = `Sesja giełdowa na GPW zakończona o 17:05 (fixing i dogrywka zakończone).`;
  }

  const nextTradingDay = (isWeekend || isGpwClosed || timeMinutes >= SESSION_CLOSE_MIN) 
    ? getNextTradingDay(referenceDate)
    : dateKey;

  const dayNameCap = p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1);

  return {
    date: dateKey,
    time: `${p.hour}:${p.minute}`,
    dayOfWeekName: dayNameCap,
    isWeekend,
    isHoliday,
    holidayName: holidayInfo.name,
    isGpwClosed,
    isTradingHours,
    isTradingDay: !isWeekend && !isGpwClosed,
    state,
    badgeText,
    badgeClass,
    statusExplanation,
    nextTradingDay,
  };
}

module.exports = {
  getEasterSunday,
  getHolidaysForYear,
  getHolidayInfo,
  isTradingDay,
  getNextTradingDay,
  getMarketStatus,
};
