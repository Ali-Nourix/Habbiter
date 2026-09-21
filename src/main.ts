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
  newTrackerId,
  parseBlock,
  resolveConfig,
  serializeConfig,
  toCodeBlock,
} from "./config";
import type { BlockConfig } from "./config";
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
    const { config: block, error } = parseBlock(source);
    if (error) {
      renderError(el, error);
      return;
    }

    let id = block.id;
    let unanchored = false;

    if (!id) {
      /* Writing the id back re-renders the block, which is when it gets
         drawn for real — so there is nothing to do here but wait for it. */
      if (await this.claimId(block, el, ctx)) return;
      id = fallbackId(ctx.sourcePath, block);
      unanchored = true;
    }

    const anchored: BlockConfig = { ...block, id };
    const view = new TrackerView(el, {
      config: resolveConfig(anchored, this.store.settings),
      block: anchored,
      values: new StoreValues(this.store, id),
      writeBlock: (next) => this.writeBlock(el, ctx, next),
      openBuilder: () => this.openBuilderForEdit(anchored, el, ctx),
      unanchored,
    });

    const entry: MountedTracker = { view, block: anchored };
    this.mounted.add(entry);
    view.register(() => this.mounted.delete(entry));
    ctx.addChild(view);
  }

  /* --- Writing the fence -------------------------------------------------- */

  /** True when an id was written and a re-render is on its way. */
  private async claimId(
    block: BlockConfig,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<boolean> {
    const info = ctx.getSectionInfo(el);
    if (!info) return false;

    const claim = `${ctx.sourcePath}:${info.lineStart}`;
    if (this.claiming.has(claim)) return true;
    this.claiming.add(claim);

    try {
      return await this.writeBlock(el, ctx, { ...block, id: newTrackerId() });
    } finally {
      this.claiming.delete(claim);
    }
  }

  private async writeBlock(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    next: BlockConfig,
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
      onSubmit: (config) => insertAtCursor(editor, toCodeBlock(config)),
    }).open();
  }

  private openBuilderForEdit(
    block: BlockConfig,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): void {
    const id = block.id ?? newTrackerId();
    new BuilderModal(this.app, {
      settings: this.store.settings,
      initial: block,
      intent: "edit",
      sample: new StoreValues(this.store, id),
      onSubmit: (config) => {
        this.migrateLabels(id, block, config);
        void this.writeBlock(el, ctx, config).then((ok) => {
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
function fallbackId(sourcePath: string, block: BlockConfig): string {
  let hash = 5381;
  const seed = `${sourcePath}\u0000${serializeConfig(block)}`;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  return `hb-anon-${(hash >>> 0).toString(36)}`;
}
