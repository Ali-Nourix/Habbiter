/* ==========================================================================
   HABBITER
   Habit and tracker grids that live inside a note.

   A tracker is a ```habbiter fence holding its own configuration and an id.
   The ticks themselves are kept in the plugin's data file under that id —
   see store.ts for why the note is the wrong place for them.
   ========================================================================== */

import { Notice, Plugin, TFile } from "obsidian";
import type { Editor, MarkdownPostProcessorContext, Menu } from "obsidian";
import { BuilderModal } from "./builder";
import {
  BLOCK_LANGUAGE,
  buildGroup,
  newTrackerId,
  parseBlock,
  resolveConfig,
  serializeBlock,
  toCodeBlock,
  trackersOf,
} from "./config";
import type { BlockConfig, BlockDocument } from "./config";
import { TrackerGroup } from "./group";
import { HabbiterSettingTab } from "./settings-tab";
import { Store } from "./store";
import { TrackerView } from "./tracker";
import { StoreValues } from "./values";

/* An opening fence may carry extra backticks and trailing text; a closing
   one is backticks and nothing else. */
const OPENING_FENCE = new RegExp(`^\\s*\`{3,}\\s*${BLOCK_LANGUAGE}\\s*$`);
const CLOSING_FENCE = /^\s*`{3,}\s*$/;

interface MountedTracker {
  view: TrackerView;
  block: BlockConfig;
}

/** The whole of a block, so a write can put back what it did not change. */
interface BlockHandle {
  doc: BlockDocument;
  write: (next: BlockDocument) => Promise<boolean>;
}

export default class HabbiterPlugin extends Plugin {
  store!: Store;

  private readonly mounted = new Set<MountedTracker>();
  /* Blocks whose id is being written. Without this, the render triggered by
     our own edit races the edit and hands the same block a second id. */
  private readonly claiming = new Set<string>();

  override async onload(): Promise<void> {
    this.store = new Store(this);
    await this.store.load();

    this.addSettingTab(new HabbiterSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (source, el, ctx) =>
      this.renderBlock(source, el, ctx),
    );

    this.register(
      this.store.onChange(() => {
        /* The tracker you are clicking has already repainted itself, and a
           full redraw would cut its animation short — so only the copies
           you are not touching are brought up to date. */
        for (const entry of this.mounted) {
          if (!entry.view.containerEl.contains(document.activeElement)) entry.view.refresh();
        }
      }),
    );

    this.addCommand({
      id: "insert-tracker",
      name: "Insert tracker",
      editorCallback: (editor) => this.openBuilderForInsert(editor),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) =>
        this.addEditorMenuItem(menu, editor),
      ),
    );
  }

  override async onunload(): Promise<void> {
    await this.store.flushNow();
  }

  refreshAll(): void {
    for (const entry of this.mounted) {
      entry.view.refresh({ config: resolveConfig(entry.block, this.store.settings) });
    }
  }

  /* --- Rendering --------------------------------------------------------- */

  private async renderBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    const { doc, error } = parseBlock(source);
    if (error) {
      renderError(el, error);
      return;
    }

    /* Writing the ids back re-renders the block, which is when it gets drawn
       for real — so there is nothing to do here but wait for it. */
    if (await this.claimIds(doc, el, ctx)) return;

    const handle: BlockHandle = {
      doc,
      write: (next) => this.writeBlock(el, ctx, next),
    };
    const anchored = trackersOf(doc).map((tracker, index) => ({
      tracker,
      index,
      id: tracker.id ?? fallbackId(ctx.sourcePath, tracker, index),
      unanchored: !tracker.id,
    }));

    const mounted = anchored.map(({ tracker, index, id, unanchored }) => {
      const block: BlockConfig = { ...tracker, id };
      return {
        config: resolveConfig(block, this.store.settings),
        block,
        deps: {
          config: resolveConfig(block, this.store.settings),
          block,
          values: new StoreValues(this.store, id),
          writeBlock: (next: BlockConfig) => this.writeTracker(handle, index, next),
          openBuilder: () => this.openBuilderForEdit(handle, index, block),
          addBeside: () => this.openBuilderForAdd(handle, index),
          removeFromGroup: () => void this.removeTracker(handle, index),
          unanchored,
        },
      };
    });

    if (mounted.length === 1) {
      const only = mounted[0];
      const view = new TrackerView(el, only.deps);
      this.track(view, only.block);
      ctx.addChild(view);
      return;
    }

    const group = new TrackerGroup(el, {
      trackers: mounted,
      reorder: (order) => this.writeOrder(handle, order),
    });
    ctx.addChild(group);
  }

  private track(view: TrackerView, block: BlockConfig): void {
    const entry: MountedTracker = { view, block };
    this.mounted.add(entry);
    view.register(() => this.mounted.delete(entry));
  }

  /* --- Changing one tracker inside a block --------------------------------- */

  private writeTracker(
    handle: BlockHandle,
    index: number,
    next: BlockConfig,
  ): Promise<boolean> {
    const trackers = trackersOf(handle.doc);
    trackers[index] = next;
    return handle.write(buildGroup(trackers, this.store.settings));
  }

  private writeOrder(handle: BlockHandle, order: number[]): Promise<boolean> {
    const trackers = trackersOf(handle.doc);
    return handle.write(buildGroup(order.map((i) => trackers[i]), this.store.settings));
  }

  /* --- Writing the fence -------------------------------------------------- */

  /** True when ids were written and a re-render is on its way. */
  private async claimIds(
    doc: BlockDocument,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<boolean> {
    const trackers = trackersOf(doc);
    if (trackers.every((tracker) => tracker.id)) return false;

    const info = ctx.getSectionInfo(el);
    if (!info) return false;

    const claim = `${ctx.sourcePath}:${info.lineStart}`;
    if (this.claiming.has(claim)) return true;
    this.claiming.add(claim);

    try {
      const named = trackers.map((tracker) => ({ ...tracker, id: tracker.id ?? newTrackerId() }));
      return await this.writeBlock(el, ctx, buildGroup(named, this.store.settings));
    } finally {
      this.claiming.delete(claim);
    }
  }

  private async writeBlock(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    next: BlockDocument,
  ): Promise<boolean> {
    const info = ctx.getSectionInfo(el);
    const file = this.app.vault.getFileByPath(ctx.sourcePath);
    if (!info || !(file instanceof TFile)) return false;

    let written = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split("\n");
      /* The section info was read before this callback was queued, so the
         file may have moved underneath it — and what these line numbers
         point at is about to be replaced wholesale. Refusing to write
         unless it is still a habbiter fence, opening and closing, beats
         writing a tracker over whatever is standing there now. */
      if (!OPENING_FENCE.test(lines[info.lineStart] ?? "")) return data;
      if (!CLOSING_FENCE.test(lines[info.lineEnd] ?? "")) return data;

      lines.splice(info.lineStart, info.lineEnd - info.lineStart + 1, toCodeBlock(next));
      written = true;
      return lines.join("\n");
    });
    return written;
  }

  /* --- Creating and editing ------------------------------------------------ */

  private addEditorMenuItem(menu: Menu, editor: Editor): void {
    menu.addItem((item) =>
      item
        .setTitle("Insert habit tracker…")
        .setIcon("calendar-check")
        .onClick(() => this.openBuilderForInsert(editor)),
    );
  }

  private openBuilderForInsert(editor: Editor): void {
    new BuilderModal(this.app, {
      settings: this.store.settings,
      initial: { id: newTrackerId() },
      intent: "insert",
      onSubmit: (config) =>
        insertAtCursor(editor, toCodeBlock({ shared: config, group: null })),
    }).open();
  }

  /* Added after the one it was asked for, not at the end: "beside this" is
     a position, and a row of eight is where that starts to matter. */
  private openBuilderForAdd(handle: BlockHandle, index: number): void {
    new BuilderModal(this.app, {
      settings: this.store.settings,
      initial: { id: newTrackerId() },
      intent: "insert",
      onSubmit: (config) => {
        const trackers = trackersOf(handle.doc);
        trackers.splice(index + 1, 0, config);
        void handle.write(buildGroup(trackers, this.store.settings)).then((ok) => {
          if (!ok) new Notice("Habbiter could not find this block to add to it.");
        });
      },
    }).open();
  }

  /* The ticks are keyed by the tracker's id, not by its place in a block, so
     they sit where they are and come back if it is put back. */
  private async removeTracker(handle: BlockHandle, index: number): Promise<void> {
    const trackers = trackersOf(handle.doc);
    if (trackers.length <= 1) {
      new Notice("A block needs one tracker. Delete the block instead.");
      return;
    }
    trackers.splice(index, 1);
    await handle.write(buildGroup(trackers, this.store.settings));
  }

  private openBuilderForEdit(handle: BlockHandle, index: number, block: BlockConfig): void {
    const id = block.id ?? newTrackerId();
    new BuilderModal(this.app, {
      settings: this.store.settings,
      initial: block,
      intent: "edit",
      sample: new StoreValues(this.store, id),
      onSubmit: (config) => {
        this.migrateLabels(id, block, config);
        void this.writeTracker(handle, index, config).then((ok) => {
          if (!ok) new Notice("Habbiter could not find this block to update it.");
        });
      },
    }).open();
  }

  /* Rows and columns are keyed by their own label, so renaming one in the
     builder would otherwise read as deleting a habit and starting a new one.
     Matching the old list against the new by position recovers the intent:
     the third row is still the third row, whatever it is now called. */
  private migrateLabels(id: string, before: BlockConfig, after: BlockConfig): void {
    const pairs = (from: string[] = [], to: string[] = []) =>
      from.map((label, index) => [label, to[index]] as const).filter(([a, b]) => b && a !== b);

    for (const [from, to] of pairs(before.rows, after.rows)) this.store.renameRow(id, from, to);

    const columnsOf = (config: BlockConfig) =>
      Array.isArray(config.columns) ? config.columns : undefined;
    for (const [from, to] of pairs(columnsOf(before), columnsOf(after))) {
      this.store.renameColumn(id, from, to);
    }
  }
}

function insertAtCursor(editor: Editor, text: string): void {
  const cursor = editor.getCursor();
  const onBlankLine = editor.getLine(cursor.line).trim() === "";
  editor.replaceSelection(onBlankLine ? `${text}\n` : `\n${text}\n`);
}

function renderError(el: HTMLElement, message: string): void {
  const notice = el.createDiv({ cls: "hb-root hb-error" });
  notice.createSpan({ cls: "hb-error-label", text: "Habbiter" });
  notice.createSpan({ text: message });
}

/* A block with no id that also cannot be located in a file — an export, a
   preview, an embed of a read-only note. The tracker still draws and still
   takes clicks; they simply have nowhere permanent to go, which the view
   says out loud rather than leaving the reader to discover. */
function fallbackId(sourcePath: string, block: BlockConfig, index: number): string {
  let hash = 5381;
  const seed = `${sourcePath}\u0000${index}\u0000${serializeBlock({ shared: block, group: null })}`;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  return `hb-anon-${(hash >>> 0).toString(36)}`;
}
