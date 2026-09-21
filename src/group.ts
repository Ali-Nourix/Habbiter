/* ==========================================================================
   GROUP
   A block holding more than one tracker: a row of them, wrapping to the
   width of the note, and reorderable by dragging one by its grip.

   Free positioning is not on offer and cannot be. A note is a markdown
   document, not a canvas — there is nowhere in it to record that something
   sits 240px from the left, and anything that faked it would come apart in
   reading view, in an export and on a phone. What a document can hold is an
   order, so that is what dragging changes, and the row lays itself out from
   it. Obsidian's own canvas is the place for free positioning.
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
  private slots: HTMLElement[] = [];
  private views: TrackerView[] = [];
  private drag: DragState | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly deps: GroupDeps,
  ) {
    super(containerEl);
  }

  override onload(): void {
    const row = this.containerEl.createDiv({ cls: "hb-group" });
    this.containerEl.addClass("hb-group-host");

    this.deps.trackers.forEach((tracker, index) => {
      /* The slot is the thing that moves; the tracker is what it holds.
         TrackerView makes its own container the root, so it needs one of
         its own or the slot and the tracker would be the same element. */
      const slot = row.createDiv({ cls: "hb-slot" });
      slot.dataset.index = String(index);
      this.slots.push(slot);

      const view = new TrackerView(slot.createDiv(), {
        ...tracker.deps,
        group: this.deps.reorder
          ? {
              grab: (event) => this.grab(event, slot),
              move: (by) => void this.moveBy(slot, by),
              position: () => ({
                index: this.slots.indexOf(slot),
                count: this.slots.length,
              }),
            }
          : undefined,
      });
      this.addChild(view);
      this.views.push(view);
    });
  }

  override onunload(): void {
    this.endDrag(false);
  }

  /* --- Dragging ---------------------------------------------------------- */

  /* Pointer events rather than HTML5 drag and drop: the editor underneath has
     its own opinions about a dragged node, and a grip that only ever moves
     one of our own siblings should not be negotiating with it. */
  private grab(event: PointerEvent, slot: HTMLElement): void {
    if (this.drag || event.button !== 0) return;
    event.preventDefault();

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    this.drag = {
      slot,
      handle,
      pointerId: event.pointerId,
      from: this.slots.indexOf(slot),
      onMove: (moveEvent: PointerEvent) => this.dragTo(moveEvent),
      onUp: () => this.endDrag(true),
      onKey: (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") this.endDrag(false);
      },
    };

    slot.addClass("is-grabbed");
    this.containerEl.addClass("is-dragging");
    handle.addEventListener("pointermove", this.drag.onMove);
    handle.addEventListener("pointerup", this.drag.onUp);
    handle.addEventListener("pointercancel", this.drag.onUp);
    window.addEventListener("keydown", this.drag.onKey);
  }

  /* The dragged slot is moved in the DOM as the pointer passes each
     neighbour, so what you are looking at during the drag is the order you
     will get — no placeholder that has to be kept in step with it. */
  private dragTo(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;

    const target = this.slotNearest(event.clientX, event.clientY, drag.slot);
    if (!target) return;

    const parent = drag.slot.parentElement;
    if (!parent) return;

    const before = target.compareDocumentPosition(drag.slot) & Node.DOCUMENT_POSITION_FOLLOWING;
    parent.insertBefore(drag.slot, before ? target : target.nextSibling);
    this.slots = Array.from(parent.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.hasClass("hb-slot"),
    );
  }

  private slotNearest(x: number, y: number, exclude: HTMLElement): HTMLElement | null {
    let best: HTMLElement | null = null;
    let bestDistance = Infinity;

    for (const slot of this.slots) {
      if (slot === exclude) continue;
      const box = slot.getBoundingClientRect();
      /* Rows wrap, so the nearest slot is a two-dimensional question. The
         vertical term is weighted up: a tracker one row down is further away
         than one the same distance along the row. */
      const dx = x - (box.left + box.width / 2);
      const dy = (y - (box.top + box.height / 2)) * 2;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slot;
      }
    }
    return best;
  }

  private endDrag(commit: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    drag.handle.removeEventListener("pointermove", drag.onMove);
    drag.handle.removeEventListener("pointerup", drag.onUp);
    drag.handle.removeEventListener("pointercancel", drag.onUp);
    window.removeEventListener("keydown", drag.onKey);
    if (drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }

    drag.slot.removeClass("is-grabbed");
    this.containerEl.removeClass("is-dragging");

    const order = this.slots.map((slot) => Number(slot.dataset.index));
    const unchanged = order.every((original, index) => original === index);
    if (!commit || unchanged) {
      if (!commit) this.restore();
      return;
    }
    void this.commit(order);
  }

  /** Escape during a drag: put the row back the way it was found. */
  private restore(): void {
    const parent = this.slots[0]?.parentElement;
    if (!parent) return;
    const inOrder = [...this.slots].sort(
      (a, b) => Number(a.dataset.index) - Number(b.dataset.index),
    );
    for (const slot of inOrder) parent.appendChild(slot);
    this.slots = inOrder;
  }

  /* --- Moving without a pointer -------------------------------------------
     A drag cannot be the only way to do this: it is unreachable from the
     keyboard and awkward on a phone. The same move is in each tracker's
     menu, and both ends arrive here. */

  private async moveBy(slot: HTMLElement, by: number): Promise<void> {
    const from = this.slots.indexOf(slot);
    const to = from + by;
    if (from < 0 || to < 0 || to >= this.slots.length) return;

    const order = this.slots.map((s) => Number(s.dataset.index));
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    await this.commit(order);
  }

  private async commit(order: number[]): Promise<void> {
    /* The block is the record. A write re-renders it, which is what puts the
       row into its new order for good; the DOM shuffling was only a preview
       of this, and is thrown away with the old render. */
    await this.deps.reorder?.(order);
  }
}

interface DragState {
  slot: HTMLElement;
  handle: HTMLElement;
  pointerId: number;
  from: number;
  onMove: (event: PointerEvent) => void;
  onUp: () => void;
  onKey: (event: KeyboardEvent) => void;
}
