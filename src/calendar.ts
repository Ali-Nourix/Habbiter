/* ==========================================================================
   CALENDAR
   Day arithmetic for the two calendars a tracker can be drawn in.

   Storage never sees any of this: a cell is always keyed by its Gregorian
   ISO date, so switching a tracker from Gregorian to Persian re-labels the
   grid without orphaning a single tick.
   ========================================================================== */

export type CalendarSystem = "gregorian" | "persian";
export type Numerals = "locale" | "latin";

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/* Persian month lengths are fixed — 31×6, 30×5, then Esfand at 29 or 30 — so
   the day-of-year of any month's first day is a constant, not a lookup. */
const PERSIAN_MONTH_STARTS = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];

const MS_PER_DAY = 86_400_000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function today(): Date {
  return startOfDay(new Date());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/* Rounded, not truncated: the two midnights are an hour apart across a
   daylight-saving boundary and integer division would lose the day. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* The storage key. Built by hand rather than via toISOString(), which would
   convert to UTC and hand back yesterday for anyone east of Greenwich. */
export function isoKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function fromIsoKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/* --- Conversion ---------------------------------------------------------- */

const civilFormatters = new Map<CalendarSystem, Intl.DateTimeFormat>();

function civilFormatter(system: CalendarSystem): Intl.DateTimeFormat {
  let fmt = civilFormatters.get(system);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      calendar: system === "persian" ? "persian" : "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    civilFormatters.set(system, fmt);
  }
  return fmt;
}

export function civilOf(date: Date, system: CalendarSystem): CivilDate {
  if (system === "gregorian") {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  const parts = civilFormatter(system).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

function persianDayEstimate(civil: CivilDate): number {
  return Math.round(civil.year * 365.2425) + PERSIAN_MONTH_STARTS[civil.month - 1] + civil.day;
}

export function dateOf(civil: CivilDate, system: CalendarSystem): Date {
  if (system === "gregorian") {
    return new Date(civil.year, civil.month - 1, civil.day);
  }

  /* 1 Farvardin always lands within a day or two of 21 March, and inside one
     Persian year the fixed month lengths make the estimated gap exact — so
     the first jump gets within a day and the second closes it. The loop is
     bounded only so a surprising ICU calendar can't spin here forever. */
  let guess = startOfDay(new Date(civil.year + 621, 2, 21));
  for (let i = 0; i < 8; i++) {
    const at = civilOf(guess, system);
    if (at.year === civil.year && at.month === civil.month && at.day === civil.day) break;
    const gap = persianDayEstimate(civil) - persianDayEstimate(at);
    if (gap === 0) break;
    guess = addDays(guess, gap);
  }
  return guess;
}

export function startOfMonth(date: Date, system: CalendarSystem): Date {
  const civil = civilOf(date, system);
  return dateOf({ ...civil, day: 1 }, system);
}

export function monthLength(date: Date, system: CalendarSystem): number {
  const first = startOfMonth(date, system);
  const civil = civilOf(first, system);
  const next =
    civil.month === 12
      ? dateOf({ year: civil.year + 1, month: 1, day: 1 }, system)
      : dateOf({ year: civil.year, month: civil.month + 1, day: 1 }, system);
  return daysBetween(first, next);
}

/* Stepping by whole months has to go through the civil date: "a month later"
   is 29, 30 or 31 days depending on where you are in which calendar. */
export function shiftMonths(date: Date, months: number, system: CalendarSystem): Date {
  const civil = civilOf(startOfMonth(date, system), system);
  const zeroBased = civil.month - 1 + months;
  return dateOf(
    {
      year: civil.year + Math.floor(zeroBased / 12),
      month: ((zeroBased % 12) + 12) % 12 + 1,
      day: 1,
    },
    system,
  );
}

/* --- Labels -------------------------------------------------------------- */

export function resolveLocale(locale: string): string {
  if (locale.trim()) return locale.trim();
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
}

function intlCalendar(system: CalendarSystem): string {
  return system === "persian" ? "persian" : "gregory";
}

/* Intl formatters are expensive to build and a month grid asks for one per
   cell, so they are built once per distinct shape and kept. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, fmt);
  }
  return fmt;
}

export function monthTitle(
  date: Date,
  system: CalendarSystem,
  locale: string,
  numerals: Numerals,
  /* Short where the tracker is one of a row: "Sep 2026" leaves room for the
     controls on a widget the width of its own grid. */
  short = false,
): string {
  return dateFormatter(resolveLocale(locale), {
    calendar: intlCalendar(system),
    numberingSystem: numerals === "latin" ? "latn" : undefined,
    year: "numeric",
    month: short ? "short" : "long",
  }).format(date);
}

export function dayTitle(
  date: Date,
  system: CalendarSystem,
  locale: string,
  numerals: Numerals,
): string {
  return dateFormatter(resolveLocale(locale), {
    calendar: intlCalendar(system),
    numberingSystem: numerals === "latin" ? "latn" : undefined,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/* Weekday names in grid order. 7 January 2024 was a Sunday, which makes it a
   convenient zero for walking the week regardless of today's date. */
export function weekdayLabels(locale: string, weekStart: number, narrow = false): string[] {
  const fmt = dateFormatter(resolveLocale(locale), { weekday: narrow ? "narrow" : "short" });
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(sunday, (weekStart + i) % 7)));
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, locale: string, numerals: Numerals): string {
  const key = numerals === "latin" ? "en" : resolveLocale(locale);
  let fmt = numberFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(key, { useGrouping: false });
    numberFormatters.set(key, fmt);
  }
  return fmt.format(value);
}

/* 0 = Sunday … 6 = Saturday, to match Date.getDay(). Intl reports 1-7 with
   Monday first, so Sunday comes back as 7 and has to wrap. */
export function defaultWeekStart(system: CalendarSystem, locale: string): number {
  type WeekInfo = { firstDay?: number };
  type LocaleWithWeekInfo = Intl.Locale & {
    getWeekInfo?: () => WeekInfo;
    weekInfo?: WeekInfo;
  };
  try {
    const resolved = new Intl.Locale(resolveLocale(locale)) as LocaleWithWeekInfo;
    const info = resolved.getWeekInfo?.() ?? resolved.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* Older ICU builds have no week info; the calendar default below is the
       right answer for both of the calendars this plugin draws. */
  }
  return system === "persian" ? 6 : 1;
}
