/* ==========================================================================
   STORE
   Where the ticks live.

   Deliberately not in the note. Writing a value back into the fence on every
   click means editing the file the cursor is sitting in, and the cost of that
   — a jumped caret mid-sentence, a sync conflict between two devices that
   both ticked today — is paid at exactly the moment the plugin is supposed to
   be invisible. So a tracker keeps an id and the ticks live in the plugin's
   own data file, which Obsidian Sync carries like any other plugin state.

   Absent and zero mean the same thing, and only one of them is ever written:
   an untouched year of a daily habit costs nothing.
   ========================================================================== */

import { debounce } from "obsidian";
import type { Debouncer } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import type { HabbiterSettings } from "./settings";

/** Row label → column key → value. The single row of a month tracker is "@". */
export type TrackerRows = Record<string, Record<string, number>>;

export const MONTH_ROW_KEY = "@";

export interface HabbiterData {
  settings: HabbiterSettings;
  trackers: Record<string, TrackerRows>;
}

interface Persistence {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

const SAVE_DELAY_MS = 400;

export class Store {
  settings: HabbiterSettings = { ...DEFAULT_SETTINGS };

  private trackers: Record<string, TrackerRows> = {};
  private readonly listeners = new Set<(id: string) => void>();
  private readonly flush: Debouncer<[], Promise<void>>;

  constructor(private readonly host: Persistence) {
    /* Ticking a week of boxes is seven clicks in five seconds; it should be
       one write. resetTimer keeps the window rolling while the run continues. */
    this.flush = debounce(() => this.write(), SAVE_DELAY_MS, true);
  }

  async load(): Promise<void> {
    const raw = (await this.host.loadData()) as Partial<HabbiterData> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) };
    this.trackers = isRecord(raw?.trackers) ? (raw.trackers as Record<string, TrackerRows>) : {};
  }

  /** Called on unload, when there is no later chance to write. */
  async flushNow(): Promise<void> {
    this.flush.cancel();
    await this.write();
  }

  async saveSettings(): Promise<void> {
    await this.write();
  }

  onChange(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string, row: string, column: string): number {
    return this.trackers[id]?.[row]?.[column] ?? 0;
  }

  set(id: string, row: string, column: string, value: number): void {
    const rows = (this.trackers[id] ??= {});
    const cells = (rows[row] ??= {});

    if (value > 0) {
      cells[column] = value;
    } else {
      delete cells[column];
      if (Object.keys(cells).length === 0) delete rows[row];
      if (Object.keys(rows).length === 0) delete this.trackers[id];
    }

    this.flush();
    this.announce(id);
  }

  /** Every column that holds a value, for streaks and totals across months. */
  columnsOf(id: string, row: string): string[] {
    return Object.keys(this.trackers[id]?.[row] ?? {});
  }

  clearColumns(id: string, columns: string[]): void {
    const rows = this.trackers[id];
    if (!rows) return;
    for (const row of Object.keys(rows)) {
      for (const column of columns) delete rows[row][column];
      if (Object.keys(rows[row]).length === 0) delete rows[row];
    }
    if (Object.keys(rows).length === 0) delete this.trackers[id];
    this.flush();
    this.announce(id);
  }

  /* Rows and columns are keyed by their label so that reordering them in the
     block keeps the data attached to the right habit. The price is that a
     rename looks like a delete, which the builder pays off by calling this
     with the positional diff of what the author just edited. */
  renameRow(id: string, from: string, to: string): void {
    const rows = this.trackers[id];
    if (!rows || from === to || !rows[from]) return;
    rows[to] = { ...rows[to], ...rows[from] };
    delete rows[from];
    this.flush();
  }

  renameColumn(id: string, from: string, to: string): void {
    const rows = this.trackers[id];
    if (!rows || from === to) return;
    for (const cells of Object.values(rows)) {
      if (!(from in cells)) continue;
      cells[to] = cells[from];
      delete cells[from];
    }
    this.flush();
  }

  private announce(id: string): void {
    for (const listener of this.listeners) listener(id);
  }

  private async write(): Promise<void> {
    const data: HabbiterData = { settings: this.settings, trackers: this.trackers };
    await this.host.saveData(data);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
