/* ==========================================================================
   SETTINGS
   Vault-wide defaults. Every one of these can be overridden per block; what
   lives here is only what a new tracker starts out as, so a vault that wants
   Persian months and 30px cells says so once.
   ========================================================================== */

import type { CalendarSystem, Numerals } from "./calendar";
import type { Band, CellKind, Mode, Side } from "./config";

export interface HabbiterSettings {
  mode: Mode;
  cell: CellKind;
  goal: number;
  calendar: CalendarSystem;
  /** Empty means "follow the app", which is what almost everyone wants. */
  locale: string;
  numerals: Numerals;
  /** 0 = Sunday … 6 = Saturday, or "auto" to take the locale's own answer. */
  weekStart: number | "auto";
  dayNumbers: boolean;
  weekdays: boolean;
  totals: boolean;
  streak: boolean;
  /** The side of a cell in px. The visual mark, not the hit area. */
  size: number;
  /** A month of day columns is 31 wide; this is how it is made to fit. */
  band: Band;
  /** Which side a tracker takes when its block also carries text. */
  side: Side;
  /** Round cells instead of following the theme's checkbox corner. */
  round: boolean;
  /** Keep the header controls visible instead of summoning them on hover. */
  alwaysShowControls: boolean;
}

export const DEFAULT_SETTINGS: HabbiterSettings = {
  mode: "month",
  cell: "check",
  goal: 1,
  calendar: "gregorian",
  locale: "",
  numerals: "locale",
  weekStart: "auto",
  dayNumbers: true,
  weekdays: true,
  totals: false,
  streak: true,
  size: 26,
  band: "week",
  side: "start",
  round: false,
  alwaysShowControls: false,
};
