/* The Persian calendar is the reason this file exists: Esfand is 29 days in
   an ordinary year and 30 in a leap one, and the leap pattern is not the
   Gregorian one. Everything is round-tripped against ICU rather than against
   a table, so a wrong answer shows up as a date that will not convert back. */

import {
  addDays,
  civilOf,
  dateOf,
  defaultWeekStart,
  isoKey,
  monthLength,
  monthTitle,
  shiftMonths,
  startOfMonth,
  weekdayLabels,
} from "../src/calendar";
import { check, ok, report } from "./harness";

let date = new Date(2024, 0, 1);
let broken = 0;
for (let i = 0; i < 1500; i++) {
  const back = dateOf(civilOf(date, "persian"), "persian");
  if (isoKey(back) !== isoKey(date)) broken++;
  date = addDays(date, 1);
}
ok("1500 Persian days round-trip", broken === 0);

check("Nowruz 1403", isoKey(dateOf({ year: 1403, month: 1, day: 1 }, "persian")), "2024-03-20");
check("Nowruz 1405", isoKey(dateOf({ year: 1405, month: 1, day: 1 }, "persian")), "2026-03-21");
check(
  "21 September 2026 is 30 Shahrivar 1405",
  JSON.stringify(civilOf(new Date(2026, 8, 21), "persian")),
  JSON.stringify({ year: 1405, month: 6, day: 30 }),
);

const persianMonth = (year: number, month: number) =>
  monthLength(dateOf({ year, month, day: 1 }, "persian"), "persian");
check("Farvardin is 31 days", persianMonth(1405, 1), 31);
check("Mehr is 30 days", persianMonth(1405, 7), 30);
check("Esfand 1403 is 30 days (leap)", persianMonth(1403, 12), 30);
check("Esfand 1404 is 29 days", persianMonth(1404, 12), 29);

check("February 2024 is 29 days", monthLength(new Date(2024, 1, 10), "gregorian"), 29);
check("February 2025 is 28 days", monthLength(new Date(2025, 1, 10), "gregorian"), 28);

check("Gregorian month start", isoKey(startOfMonth(new Date(2026, 8, 21), "gregorian")), "2026-09-01");
check("Persian month start", isoKey(startOfMonth(new Date(2026, 8, 21), "persian")), "2026-08-23");

check("next Persian month", isoKey(shiftMonths(new Date(2026, 8, 21), 1, "persian")), "2026-09-23");
check("previous Persian month", isoKey(shiftMonths(new Date(2026, 8, 21), -1, "persian")), "2026-07-23");
check("four months on", isoKey(shiftMonths(new Date(2026, 10, 15), 4, "gregorian")), "2027-03-01");
check("thirteen months back", isoKey(shiftMonths(new Date(2026, 0, 15), -13, "gregorian")), "2024-12-01");

check("week starting Monday", weekdayLabels("en", 1)[0], "Mon");
check("week starting Sunday", weekdayLabels("en", 0)[0], "Sun");
check("Persian week starts Saturday", defaultWeekStart("persian", "fa"), 6);
ok("Persian month name", monthTitle(new Date(2026, 8, 21), "persian", "fa", "locale").includes("شهریور"));
ok(
  "Latin numerals override the locale",
  monthTitle(new Date(2026, 8, 21), "persian", "fa", "latin").includes("1405"),
);

report();
