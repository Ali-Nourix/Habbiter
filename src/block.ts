/* ==========================================================================
   BLOCK
   Everything one ```habbiter fence draws: the tracker or the row of them,
   and the text that goes beside them.

   The text lives in the block rather than in the note around it, and that is
   the whole point. Floating the block so the note's own paragraphs ran past
   it was the obvious way to do this and it does not survive Live Preview: a
   floated block leaves the flow of the CodeMirror line holding it, the line
   measures as empty, and the editor comes apart. Inside our own container
   there is no editor to come apart — a flex row is a flex row in reading
   view and in the editor alike.

   Obsidian renders the markdown, so what goes beside a tracker is ordinary
   markdown with ordinary links, formatting and embeds.
   ========================================================================== */

import { MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import type { App } from "obsidian";
import type { ResolvedConfig } from "./config";
import { TrackerDeck } from "./deck";
import { TrackerGroup } from "./group";
import type { GroupDeps } from "./group";
import { TrackerView } from "./tracker";

export interface BlockDeps extends GroupDeps {
  app: App;
  sourcePath: string;
  /** Markdown to set beside the trackers. Empty means there is none. */
  text: string;
  /** Which side the trackers take. Only meaningful when there is text. */
  side: ResolvedConfig["side"];
  /** Several trackers: beside each other, or stacked into a deck. */
  layout: ResolvedConfig["layout"];
}

export class TrackerBlock extends MarkdownRenderChild {
  /** The views this block built, in the block's own order. */
  readonly views: TrackerView[] = [];

  constructor(
    containerEl: HTMLElement,
    private readonly deps: BlockDeps,
  ) {
    super(containerEl);
  }

  override onload(): void {
    const { app, sourcePath, text, side, layout, trackers } = this.deps;
    const el = this.containerEl;
    el.addClass("hb-block");

    const hasText = text.trim().length > 0;
    el.dataset.side = hasText ? side : "none";

    const pair = hasText ? el.createDiv({ cls: "hb-pair" }) : el;
    const host = pair.createDiv({ cls: "hb-main" });

    if (trackers.length === 1) {
      const view = new TrackerView(host.createDiv(), { ...trackers[0].deps, compact: hasText });
      this.views.push(view);
      this.addChild(view);
    } else if (layout === "deck") {
      const deck = new TrackerDeck(host, this.deps);
      this.views.push(...deck.build());
      this.addChild(deck);
    } else {
      const group = new TrackerGroup(host, this.deps);
      this.views.push(...group.build());
      this.addChild(group);
    }

    if (!hasText) return;

    /* markdown-rendered is Obsidian's own class for a block of rendered
       markdown: taking it means the text beside a tracker is typeset by
       whatever theme is running, like the rest of the note. */
    const prose = pair.createDiv({ cls: "hb-text markdown-rendered" });
    void MarkdownRenderer.render(app, text, prose, sourcePath, this);
  }
}
