/* ==========================================================================
   DECK
   Several trackers in one block, stacked, one in front. Swipe across the
   front one to bring the next up.

   A swipe is never the only way through. It is a pointer gesture, and this
   runs inside CodeMirror, which has its own claim on the pointer — so the
   arrows, the dots and the keyboard all do the same job, and if the gesture
   ever misbehaves in the editor the deck still works. The same reason the
   drag that used to reorder a row is gone.

   And a tap has to stay a tap: a drag only begins once the pointer has
   travelled far enough, and further across than down. Ticking a box is what
   somebody came here to do; nothing may get in front of it.
   ========================================================================== */

import { MarkdownRenderChild, setIcon, setTooltip } from "obsidian";
import { TrackerView } from "./tracker";
import type { GroupDeps } from "./group";

/* How far across before a press is a swipe rather than a tap, and how far
   before letting go commits to the next card. */
const DRAG_STARTS_AT = 8;
const COMMIT_FRACTION = 0.28;

export class TrackerDeck extends MarkdownRenderChild {
  private readonly views: TrackerView[] = [];
  private cards: HTMLElement[] = [];
  private dots: HTMLElement[] = [];
  private deckEl!: HTMLElement;
  private active = 0;
  private drag: Drag | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly deps: GroupDeps,
  ) {
    super(containerEl);
  }

  build(): TrackerView[] {
    if (this.views.length) return this.views;

    const root = this.containerEl.createDiv({ cls: "hb-deckroot" });
    this.deckEl = root.createDiv({ cls: "hb-deck" });

    const count = this.deps.trackers.length;

    this.deps.trackers.forEach((tracker, index) => {
      const card = this.deckEl.createDiv({ cls: "hb-card" });
      card.setAttribute("role", "tabpanel");
      this.cards.push(card);

      /* A card is a widget: as wide as the grid it shows and no wider.
         Without this the card takes the width of the tracker's header —
         its title, its month and its streak on one line — and the calendar
         sits at one end of a card half again as wide as it needs to be. */
      const view = new TrackerView(card.createDiv(), {
        ...tracker.deps,
        compact: true,
        /* Which card is in front is a swipe away; which card is on top of
           the stack is an order, and it is reordered the same way a row is. */
        group: this.deps.reorder
          ? { move: (by) => void this.move(index, by), position: () => ({ index, count }) }
          : undefined,
      });
      this.views.push(view);
      this.addChild(view);
    });

    this.buildControls(root);
    this.layOut();
    this.listen();
    return this.views;
  }

  override onload(): void {
    this.build();
  }

  /* --- The controls ------------------------------------------------------ */

  private buildControls(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "hb-deckbar" });

    this.addStep(bar, "chevron-left", "Previous tracker", -1);

    /* Tabs rather than a row of decorative dots: it is the pattern a screen
       reader already knows, and it puts the arrow keys on the dots where
       they are free — inside a tracker they belong to its cells. */
    const tabs = bar.createDiv({ cls: "hb-dots", attr: { role: "tablist" } });
    this.deps.trackers.forEach((tracker, index) => {
      const title = tracker.config.title || `Tracker ${index + 1}`;
      const dot = tabs.createEl("button", {
        cls: "hb-dot",
        attr: { type: "button", role: "tab", "aria-label": title },
      });
      setTooltip(dot, title, { placement: "top" });
      dot.addEventListener("click", () => this.goTo(index));
      dot.addEventListener("keydown", (event) => {
        const by = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!by) return;
        event.preventDefault();
        this.step(by * this.reading());
        this.dots[this.active]?.focus();
      });
      this.dots.push(dot);
    });

    this.addStep(bar, "chevron-right", "Next tracker", 1);
  }

  private addStep(parent: HTMLElement, icon: string, label: string, by: number): void {
    const button = parent.createEl("button", {
      cls: "hb-tool hb-deckstep is-nav",
      attr: { type: "button", "aria-label": label },
    });
    setIcon(button, icon);
    setTooltip(button, label, { placement: "top" });
    button.addEventListener("click", () => this.step(by * this.reading()));
  }

  /** +1 where the text runs left to right, -1 where it runs the other way. */
  private reading(): number {
    return getComputedStyle(this.containerEl).direction === "rtl" ? -1 : 1;
  }

  /* --- Where each card sits ---------------------------------------------- */

  private goTo(index: number): void {
    const next = Math.min(this.cards.length - 1, Math.max(0, index));
    if (next === this.active) return;
    this.active = next;
    this.layOut();
  }

  private step(by: number): void {
    this.goTo(this.active + by);
  }

  /* Moving a card through the stack, from the menu. The block is the record,
     so this writes it and lets the re-render put the cards in their new
     order — there is no second copy of the order to fall out of step. */
  private async move(from: number, by: number): Promise<void> {
    const to = from + by;
    if (to < 0 || to >= this.cards.length) return;
    const order = [...Array(this.cards.length).keys()];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    await this.deps.reorder?.(order);
  }

  /* Depth is all the styling needs: how far behind the front a card is, and
     whether it has been gone past. The transitions are on the cards, so
     setting a number here is the whole animation. */
  private layOut(): void {
    this.cards.forEach((card, index) => {
      const depth = index - this.active;
      card.style.setProperty("--hb-depth", String(depth));
      card.toggleClass("is-front", depth === 0);
      card.toggleClass("is-gone", depth < 0);
      /* Only the front card is reachable — by pointer, by tab, by a screen
         reader. inert says all three at once. */
      card.toggleAttribute("inert", depth !== 0);
      card.setAttribute("aria-hidden", String(depth !== 0));
    });

    this.dots.forEach((dot, index) => {
      dot.toggleClass("is-active", index === this.active);
      dot.setAttribute("aria-selected", String(index === this.active));
      dot.tabIndex = index === this.active ? 0 : -1;
    });

    this.deckEl.style.setProperty("--hb-swipe", "0");
    this.deckEl.style.setProperty("--hb-pull", "0");
  }

  /* --- The swipe ---------------------------------------------------------- */

  private listen(): void {
    this.deckEl.addEventListener("pointerdown", (event) => this.press(event));
  }

  private press(event: PointerEvent): void {
    if (event.button !== 0 || this.drag) return;
    /* Not captured and not prevented yet: until this turns out to be a
       swipe it is somebody reaching for a checkbox. */
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, live: false };

    const move = (e: PointerEvent) => this.moved(e);
    const up = (e: PointerEvent) => this.released(e, move, up);
    this.deckEl.addEventListener("pointermove", move);
    this.deckEl.addEventListener("pointerup", up);
    this.deckEl.addEventListener("pointercancel", up);
  }

  private moved(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (!drag.live) {
      /* Across, and more across than down — otherwise it is a scroll, and
         the page is entitled to it. */
      if (Math.abs(dx) < DRAG_STARTS_AT || Math.abs(dx) <= Math.abs(dy)) return;
      drag.live = true;
      this.deckEl.setPointerCapture(drag.id);
      this.deckEl.addClass("is-swiping");
    }

    event.preventDefault();
    /* Clamped: a drag that carries on past the width of the deck should
       not carry the card on with it. */
    const travel = Math.max(-1, Math.min(1, dx / this.reach()));
    this.deckEl.style.setProperty("--hb-swipe", String(travel));
    this.deckEl.style.setProperty("--hb-pull", String(Math.abs(travel)));
  }

  private released(
    event: PointerEvent,
    move: (e: PointerEvent) => void,
    up: (e: PointerEvent) => void,
  ): void {
    const drag = this.drag;
    this.drag = null;
    this.deckEl.removeEventListener("pointermove", move);
    this.deckEl.removeEventListener("pointerup", up);
    this.deckEl.removeEventListener("pointercancel", up);
    if (!drag) return;

    if (drag.live) {
      if (this.deckEl.hasPointerCapture(drag.id)) this.deckEl.releasePointerCapture(drag.id);
      this.deckEl.removeClass("is-swiping");

      const travelled = (event.clientX - drag.x) / this.reach();
      /* Past the threshold it commits; short of it the card springs back,
         which is the same transition running to a depth that did not
         change. */
      if (Math.abs(travelled) > COMMIT_FRACTION) {
        this.step(travelled < 0 ? this.reading() : -this.reading());
      }
    }
    this.layOut();
  }

  private reach(): number {
    return Math.max(120, this.deckEl.getBoundingClientRect().width);
  }
}

interface Drag {
  id: number;
  x: number;
  y: number;
  /** False until the press has travelled far enough to be a swipe. */
  live: boolean;
}
