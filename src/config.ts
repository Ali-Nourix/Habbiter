/* ==========================================================================
   BLOCK CONFIG
   The YAML inside a ```habbiter fence, in both directions.

   Two shapes, deliberately: BlockConfig is what the note holds — only the
   choices the author actually made — and ResolvedConfig is that laid over the
   vault defaults. Keeping them apart is what lets a block stay three lines
   long and still follow a settings change later.
   ========================================================================== */

import { parseYaml, stringifyYaml } from "obsidian";
import type { CalendarSystem, Numerals } from "./calendar";
import { defaultWeekStart } from "./calendar";
import type { HabbiterSettings } from "./settings";

export const BLOCK_LANGUAGE = "habbiter";

export type Mode = "month" | "grid";
export type CellKind = "check" | "count";

export interface BlockConfig {
  id?: string;
  title?: string;
  mode?: Mode;
  cell?: CellKind;
  goal?: number;
  calendar?: CalendarSystem;
  locale?: string;
  numerals?: Numerals;
  /** "current", or a year-month in the block's own calendar: "1405-06". */
  month?: string;
  weekStart?: number | "auto";
  dayNumbers?: boolean;
  weekdays?: boolean;
  totals?: boolean;
  streak?: boolean;
  size?: number;
  rows?: string[];
  columns?: string[] | number | "days";
}

/** Grid columns, after the shorthands have been worked out. */
export type ColumnPlan =
  | { kind: "labels"; labels: string[] }
  | { kind: "days" };

export interface ResolvedConfig {
  id: string;
  title: string;
  mode: Mode;
  cell: CellKind;
  goal: number;
  calendar: CalendarSystem;
  locale: string;
  numerals: Numerals;
  month: string;
  weekStart: number;
  dayNumbers: boolean;
  weekdays: boolean;
  totals: boolean;
  streak: boolean;
  size: number;
  round: boolean;
  alwaysShowControls: boolean;
  rows: string[];
  columns: ColumnPlan;
}

/* --- Reading ------------------------------------------------------------- */

export interface ParseResult {
  config: BlockConfig;
  error?: string;
}

export function parseBlock(source: string): ParseResult {
  const text = source.trim();
  if (!text) return { config: {} };

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { config: {}, error: error instanceof Error ? error.message : String(error) };
  }
  if (raw === null || raw === undefined) return { config: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { config: {}, error: "Expected a list of `key: value` options." };
  }
  return { config: readConfig(raw as Record<string, unknown>) };
}

function readConfig(raw: Record<string, unknown>): BlockConfig {
  const config: BlockConfig = {};

  const id = asString(raw.id);
  if (id) config.id = id;

  const title = asString(raw.title ?? raw.name);
  if (title !== undefined) config.title = title;

  const mode = asEnum(raw.mode, ["month", "grid"] as const);
  if (mode) config.mode = mode;

  const cell = asEnum(raw.cell ?? raw.type, ["check", "count"] as const);
  if (cell) config.cell = cell;

  const goal = asNumber(raw.goal ?? raw.target);
  if (goal !== undefined) config.goal = clamp(Math.round(goal), 1, 999);

  const calendar = asEnum(raw.calendar, ["gregorian", "persian"] as const);
  if (calendar) config.calendar = calendar;

  const locale = asString(raw.locale);
  if (locale !== undefined) config.locale = locale;

  const numerals = asEnum(raw.numerals, ["locale", "latin"] as const);
  if (numerals) config.numerals = numerals;

  const month = asString(raw.month);
  if (month) config.month = month;

  const weekStart = readWeekStart(raw.weekStart ?? raw.weekstart ?? raw["week-start"]);
  if (weekStart !== undefined) config.weekStart = weekStart;

  const size = asNumber(raw.size);
  if (size !== undefined) config.size = clamp(Math.round(size), MIN_SIZE, MAX_SIZE);

  const flags: Array<[keyof BlockConfig, unknown]> = [
    ["dayNumbers", raw.dayNumbers ?? raw.days ?? raw["day-numbers"]],
    ["weekdays", raw.weekdays],
    ["totals", raw.totals],
    ["streak", raw.streak],
  ];
  for (const [key, value] of flags) {
    const flag = asBoolean(value);
    if (flag !== undefined) (config as Record<string, unknown>)[key] = flag;
  }

  const rows = asStringList(raw.rows ?? raw.habits);
  if (rows) config.rows = rows;

  config.columns = readColumns(raw.columns ?? raw.cols);
  if (config.columns === undefined) delete config.columns;

  return config;
}

function readColumns(value: unknown): BlockConfig["columns"] {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(Math.round(value), 1, MAX_COLUMNS);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    if (text.toLowerCase() === "days") return "days";
    /* A bare number in YAML quotes is still a count, not a one-column grid
       labelled "7" — nobody means the latter. */
    if (/^\d+$/.test(text)) return clamp(Number(text), 1, MAX_COLUMNS);
  }
  const labels = asStringList(value);
  return labels && labels.length ? labels : undefined;
}

function readWeekStart(value: unknown): number | "auto" | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return ((value % 7) + 7) % 7;
  const text = asString(value)?.trim().toLowerCase();
  if (!text) return undefined;
  if (text === "auto") return "auto";
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const index = names.findIndex((name) => name.startsWith(text.slice(0, 3)));
  if (index >= 0) return index;
  if (/^\d$/.test(text)) return Number(text) % 7;
  return undefined;
}

/* --- Resolving ----------------------------------------------------------- */

export const MIN_SIZE = 20;
export const MAX_SIZE = 44;
export const MAX_COLUMNS = 60;
export const MAX_ROWS = 40;

export function resolveConfig(block: BlockConfig, settings: HabbiterSettings): ResolvedConfig {
  const mode = block.mode ?? settings.mode;
  const calendar = block.calendar ?? settings.calendar;
  const locale = block.locale ?? settings.locale;
  const weekStartSetting = block.weekStart ?? settings.weekStart;

  const rows = (block.rows ?? []).map((row) => row.trim()).filter(Boolean).slice(0, MAX_ROWS);

  return {
    id: block.id ?? "",
    title: block.title ?? "",
    mode,
    cell: block.cell ?? settings.cell,
    goal: Math.max(1, block.goal ?? settings.goal),
    calendar,
    locale,
    numerals: block.numerals ?? settings.numerals,
    month: block.month ?? "current",
    weekStart:
      weekStartSetting === "auto" ? defaultWeekStart(calendar, locale) : weekStartSetting,
    dayNumbers: block.dayNumbers ?? settings.dayNumbers,
    weekdays: block.weekdays ?? settings.weekdays,
    totals: block.totals ?? settings.totals,
    streak: block.streak ?? settings.streak,
    size: clamp(block.size ?? settings.size, MIN_SIZE, MAX_SIZE),
    round: settings.round,
    alwaysShowControls: settings.alwaysShowControls,
    /* A grid with no rows would draw nothing at all, which reads as a broken
       block rather than an empty one. One unnamed row is the honest minimum. */
    rows: mode === "grid" && rows.length === 0 ? [""] : rows,
    columns: resolveColumns(block.columns, mode),
  };
}

function resolveColumns(columns: BlockConfig["columns"], mode: Mode): ColumnPlan {
  if (mode === "month") return { kind: "days" };
  if (columns === "days") return { kind: "days" };
  if (typeof columns === "number") {
    return {
      kind: "labels",
      labels: Array.from({ length: clamp(columns, 1, MAX_COLUMNS) }, (_, i) => String(i + 1)),
    };
  }
  if (Array.isArray(columns) && columns.length) {
    return { kind: "labels", labels: columns.slice(0, MAX_COLUMNS) };
  }
  return { kind: "days" };
}

/* --- Writing ------------------------------------------------------------- */

/* Key order is the order the builder asks the questions in, so a block reads
   the way it was filled in. Anything left at the vault default is left out
   entirely: a block should say what its author chose and nothing more. */
const KEY_ORDER: Array<keyof BlockConfig> = [
  "id",
  "title",
  "mode",
  "cell",
  "goal",
  "rows",
  "columns",
  "calendar",
  "month",
  "weekStart",
  "locale",
  "numerals",
  "dayNumbers",
  "weekdays",
  "totals",
  "streak",
  "size",
];

export function serializeConfig(config: BlockConfig): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const value = config[key];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    ordered[key] = value;
  }
  return stringifyYaml(ordered).trimEnd();
}

export function toCodeBlock(config: BlockConfig): string {
  return "```" + BLOCK_LANGUAGE + "\n" + serializeConfig(config) + "\n```";
}

/** Drops anything matching the vault default, so blocks stay short. */
export function pruneToDefaults(
  config: BlockConfig,
  settings: HabbiterSettings,
): BlockConfig {
  /* Read the effective values first. Pruning changes what the block says, so
     deciding "is this grid mode?" from the half-pruned object gets it wrong
     exactly when the mode matched the default and was dropped. */
  const mode = config.mode ?? settings.mode;
  const cell = config.cell ?? settings.cell;

  const pruned: BlockConfig = { ...config };
  const sharedKeys = [
    "mode",
    "cell",
    "calendar",
    "locale",
    "numerals",
    "weekStart",
    "dayNumbers",
    "weekdays",
    "totals",
    "streak",
    "size",
  ] as const;

  for (const key of sharedKeys) {
    if (pruned[key] === settings[key]) delete pruned[key];
  }
  if (cell === "check" || pruned.goal === settings.goal) delete pruned.goal;
  if (mode === "month") {
    delete pruned.rows;
    delete pruned.columns;
  }
  if (pruned.month === "current") delete pruned.month;
  return pruned;
}

export function newTrackerId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `hb-${Date.now().toString(36)}${random}`;
}

/* --- Coercion -----------------------------------------------------------
   People hand-edit these blocks, so every reader here takes the shape YAML
   happened to produce rather than insisting on the canonical one. */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const text = asString(value)?.trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "on") return true;
  if (text === "false" || text === "no" || text === "off") return false;
  return undefined;
}

function asEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  const text = asString(value)?.trim().toLowerCase();
  return allowed.find((option) => option === text);
}

/** Accepts a YAML list, or one string holding commas or line breaks. */
function asStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item) ?? "").map((item) => item.trim());
  }
  const text = asString(value);
  if (text === undefined) return undefined;
  if (!text.trim()) return [];
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
