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
import { fenceLines, findFence } from "./fence";
import type { FenceMatch } from "./fence";
import type { BlockConfig, BlockDocument } from "./config";
import { TrackerBlock } from "./block";
import { HabbiterSettingTab } from "./settings-tab";
import { Store } from "./store";
import { StoreValues } from "./values";

interface MountedBlock {
  child: TrackerBlock;
  /** One per view the block built, in the same order. */
  configs: BlockConfig[];
}

/** The whole of a block, so a write can put back what it did not change. */
interface BlockHandle {
  doc: BlockDocument;
  write: (next: BlockDocument) => Promise<boolean>;
}

export default class HabbiterPlugin extends Plugin {
  store!: Store;

  private readonly mounted = new Set<MountedBlock>();
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
          for (const view of entry.child.views) {
            if (!view.containerEl.contains(document.activeElement)) view.refresh();
          }
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
      entry.child.views.forEach((view, index) => {
        const block = entry.configs[index];
        if (block) view.refresh({ config: resolveConfig(block, this.store.settings) });
      });
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
    if (await this.claimIds(doc, source, el, ctx)) return;

    /* Every write after this one finds the fence by an id, which is exact.
       The claim above is the only one that has to go on content. */
    const anchorId = trackersOf(doc).find((tracker) => tracker.id)?.id;
    const handle: BlockHandle = {
      doc,
      write: (next) => this.writeBlock(el, ctx, next, { id: anchorId, source }),
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

    /* The text is the block's, not any one tracker's, so it is read off the
       shared options — an entry that sets its own is ignored for this. */
    const child = new TrackerBlock(el, {
      app: this.app,
      sourcePath: ctx.sourcePath,
      text: doc.shared.text ?? "",
      side: resolveConfig(doc.shared, this.store.settings).side,
      layout: resolveConfig(doc.shared, this.store.settings).layout,
      trackers: mounted,
      reorder: (order) => this.writeOrder(handle, order),
    });
    ctx.addChild(child);

    const entry: MountedBlock = { child, configs: mounted.map((m) => m.block) };
    this.mounted.add(entry);
    child.register(() => this.mounted.delete(entry));
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
    source: string,
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
      const anchor = trackers.find((tracker) => tracker.id)?.id;
      return await this.writeBlock(el, ctx, buildGroup(named, this.store.settings), {
        id: anchor,
        source,
      });
    } finally {
      this.claiming.delete(claim);
    }
  }

  private async writeBlock(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    next: BlockDocument,
    match: FenceMatch,
  ): Promise<boolean> {
    const info = ctx.getSectionInfo(el);
    const file = this.app.vault.getFileByPath(ctx.sourcePath);
    if (!info || !(file instanceof TFile)) return false;

    let written = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split("\n");
      /* Inside a callout the section is the callout, so these line numbers
         are its bounds and not the fence's. The fence is found within them
         — and if it is no longer there, because the file moved between the
         section info being read and this callback running, nothing is
         written. Refusing beats replacing whatever is standing there now. */
      const span = findFence(lines, info.lineStart, info.lineEnd, match);
      if (!span) return data;

      lines.splice(
        span.start,
        span.end - span.start + 1,
        ...fenceLines(serializeBlock(next), span.prefix),
      );
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
