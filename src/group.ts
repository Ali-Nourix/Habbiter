/* ==========================================================================
   GROUP
   A block holding more than one tracker: a row of them, wrapping to the
   width the block has.

   Reordering is a menu action and nothing else. A pointer drag was tried and
   taken out again: a tracker in Live Preview lives inside CodeMirror, which
   has its own claim on pointer events, and a gesture that works in a browser
   harness and not in the editor is worse than no gesture at all. A click on
   a button works in both, so that is what moving one is.
   ========================================================================== */

import { MarkdownRenderChild } from "obsidian";
import type { BlockConfig, ResolvedConfig } from "./config";
import { TrackerView } from "./tracker";
import type { TrackerDeps } from "./tracker";

export interface GroupDeps {
  /** One per tracker, already resolved against the shared block options. */
  trackers: Array<{ config: ResolvedConfig; block: BlockConfig; deps: TrackerDeps }>;
  /** Persists a new order. Absent where the block cannot be written. */
  reorder?: (order: number[]) => Promise<boolean>;
}

export class TrackerGroup extends MarkdownRenderChild {
  private readonly views: TrackerView[] = [];

  constructor(
    containerEl: HTMLElement,
    private readonly deps: GroupDeps,
  ) {
    super(containerEl);
  }

  /* Built on demand rather than in onload, so the block that owns the row
     can hold on to the views it contains — a settings change has to reach
     every one of them, wherever it is nested. */
  build(): TrackerView[] {
    if (this.views.length) return this.views;

    const row = this.containerEl.createDiv({ cls: "hb-group" });
    const count = this.deps.trackers.length;

    this.deps.trackers.forEach((tracker, index) => {
      /* TrackerView makes its own container the root, so each one needs a
         container of its own or the slot and the tracker would be the same
         element and could not be styled apart. */
      const slot = row.createDiv({ cls: "hb-slot" });

      const view = new TrackerView(slot.createDiv(), {
        ...tracker.deps,
        group: this.deps.reorder
          ? { move: (by) => void this.move(index, by), position: () => ({ index, count }) }
          : undefined,
      });
      this.views.push(view);
      this.addChild(view);
    });
    return this.views;
  }

  override onload(): void {
    this.build();
  }

  private async move(from: number, by: number): Promise<void> {
    const count = this.deps.trackers.length;
    const to = from + by;
    if (to < 0 || to >= count) return;

    const order = [...Array(count).keys()];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    /* The block is the record: writing it re-renders the row in its new
       order. Nothing is shuffled in the DOM first, because that would be a
       second copy of the answer waiting to disagree with the first. */
    await this.deps.reorder?.(order);
  }
}
