/* ==========================================================================
   VALUE SOURCE
   The renderer reads and writes cells through this rather than through the
   store directly, which is what lets the builder's live preview be the real
   component — clickable, with its own throwaway values — instead of a picture
   of one that drifts from the thing it is previewing.
   ========================================================================== */

import type { Store } from "./store";

export interface ValueSource {
  get(row: string, column: string): number;
  set(row: string, column: string, value: number): void;
  /** Every column ever written for this row, for streaks that cross months. */
  columnsOf(row: string): string[];
  readonly persistent: boolean;
}

export class StoreValues implements ValueSource {
  readonly persistent = true;

  constructor(
    private readonly store: Store,
    private readonly id: string,
  ) {}

  get(row: string, column: string): number {
    return this.store.get(this.id, row, column);
  }

  set(row: string, column: string, value: number): void {
    this.store.set(this.id, row, column, value);
  }

  columnsOf(row: string): string[] {
    return this.store.columnsOf(this.id, row);
  }
}

export class MemoryValues implements ValueSource {
  readonly persistent = false;

  private readonly rows = new Map<string, Map<string, number>>();

  get(row: string, column: string): number {
    return this.rows.get(row)?.get(column) ?? 0;
  }

  set(row: string, column: string, value: number): void {
    let cells = this.rows.get(row);
    if (!cells) {
      cells = new Map();
      this.rows.set(row, cells);
    }
    if (value > 0) cells.set(column, value);
    else cells.delete(column);
  }

  columnsOf(row: string): string[] {
    return [...(this.rows.get(row)?.keys() ?? [])];
  }
}
