/* ==========================================================================
   BUILDER
   The modal behind "Insert habit tracker…".

   Nobody should have to learn a YAML schema to get a row of checkboxes into
   a note, so this asks the questions instead — and answers them back with
   the real component, live, rather than a picture of one. The preview is the
   same TrackerView the note gets, wired to throwaway values, so what you
   click in here is exactly what you are about to insert.
   ========================================================================== */

import { Component, MarkdownRenderer, Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { addDays, isoKey, monthLength, startOfMonth, today } from "./calendar";
import {
  MAX_SIZE,
  MIN_SIZE,
  newTrackerId,
  pruneToDefaults,
  resolveConfig,
} from "./config";
import type { BlockConfig } from "./config";
import type { HabbiterSettings } from "./settings";
import { MONTH_ROW_KEY } from "./store";
import { TrackerView } from "./tracker";
import { MemoryValues } from "./values";
import type { ValueSource } from "./values";

export interface BuilderOptions {
  settings: HabbiterSettings;
  initial: BlockConfig;
  /** Insert writes a new fence; edit replaces the one already in the note. */
  intent: "insert" | "edit";
  /** Real values to show in the preview, copied so preview clicks are free. */
  sample?: ValueSource;
  onSubmit: (config: BlockConfig) => void;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export class BuilderModal extends Modal {
  private draft: BlockConfig;
  private preview: TrackerView | null = null;
  /* Owns whatever Obsidian renders into the preview, so a redraw takes the
     last one apart instead of leaving its embeds running. */
  private previewChild = new Component();
  private previewEl!: HTMLElement;
  private formEl!: HTMLElement;

  constructor(
    app: App,
    private readonly options: BuilderOptions,
  ) {
    super(app);
    this.draft = { ...options.initial };
    if (!this.draft.id) this.draft.id = newTrackerId();
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("hb-builder-modal");
    contentEl.empty();

    this.setTitle(this.options.intent === "edit" ? "Edit tracker" : "New tracker");
    this.previewEl = contentEl.createDiv({ cls: "hb-preview" });
    this.formEl = contentEl.createDiv({ cls: "hb-form" });

    this.drawForm();
    this.drawPreview();
  }

  override onClose(): void {
    this.preview?.unload();
    this.previewChild.unload();
    this.contentEl.empty();
  }

  /* --- Form -------------------------------------------------------------- */

  private update(change: Partial<BlockConfig>): void {
    this.draft = { ...this.draft, ...change };
    this.drawForm();
    this.drawPreview();
  }

  private get resolved() {
    return resolveConfig(this.draft, this.options.settings);
  }

  private drawForm(): void {
    const form = this.formEl;
    const config = this.resolved;
    form.empty();

    new Setting(form).setName("Title").addText((text) =>
      text
        .setPlaceholder(config.mode === "month" ? "The habit you are tracking" : "Optional")
        .setValue(this.draft.title ?? "")
        .onChange((value) => {
          /* Typing the title should not redraw the field the caret is in. */
          this.draft.title = value;
          this.drawPreview();
        }),
    );

    new Setting(form)
      .setName("Layout")
      .setDesc(
        config.mode === "month"
          ? "One habit, drawn as the month's calendar."
          : "Rows and columns you name yourself.",
      )
      .addDropdown((drop) =>
        drop
          .addOptions({ month: "Month calendar", grid: "Grid" })
          .setValue(config.mode)
          .onChange((value) => this.update({ mode: value as BlockConfig["mode"] })),
      );

    new Setting(form)
      .setName("Cells")
      .addDropdown((drop) =>
        drop
          .addOptions({ check: "Checkbox", count: "Counter" })
          .setValue(config.cell)
          .onChange((value) => this.update({ cell: value as BlockConfig["cell"] })),
      );

    if (config.cell === "count") {
      new Setting(form)
        .setName("A full cell is")
        .setDesc("Clicking cycles up to this and back to zero.")
        .addSlider((slider) =>
          slider
            .setLimits(1, 12, 1)
            .setValue(config.goal)
            .setDynamicTooltip()
            .onChange((value) => this.update({ goal: value })),
        );
    }

    if (config.mode === "grid") this.drawGridFields(form);

    if (config.mode === "grid" && config.columns.kind === "days") {
      new Setting(form)
        .setName("A month of days")
        .setDesc("31 in one line is wider than any note.")
        .addDropdown((drop) =>
          drop
            .addOptions({
              wrap: "Run on to the next line",
              week: "Break at the weeks",
              none: "One line, scrolled",
            })
            .setValue(config.band)
            .onChange((value) => this.update({ band: value as BlockConfig["band"] })),
        );
    }
    if (config.columns.kind === "days") this.drawCalendarFields(form);

    this.drawDisplayFields(form);
    this.drawAdvancedFields(form);

    new Setting(form).addButton((button) =>
      button
        .setButtonText(this.options.intent === "edit" ? "Save" : "Insert")
        .setCta()
        .onClick(() => {
          this.options.onSubmit(pruneToDefaults(this.draft, this.options.settings));
          this.close();
        }),
    );
  }

  private drawGridFields(form: HTMLElement): void {
    new Setting(form)
      .setName("Rows")
      .setDesc("One name per line. These are what the ticks are filed under.")
      .addTextArea((area) => {
        area
          .setPlaceholder("Meditate\nRead\nWalk")
          .setValue((this.draft.rows ?? []).join("\n"))
          .onChange((value) => {
            this.draft.rows = value.split("\n").map((row) => row.trim());
            this.drawPreview();
          });
        area.inputEl.rows = 4;
      });

    new Setting(form)
      .setName("Columns")
      .setDesc("Names separated by commas, a plain number, or “days” for the month.")
      .addText((text) =>
        text
          .setPlaceholder("days")
          .setValue(columnsToText(this.draft.columns))
          .onChange((value) => {
            this.draft.columns = textToColumns(value);
            this.drawPreview();
          }),
      );
  }

  private drawCalendarFields(form: HTMLElement): void {
    const config = this.resolved;

    new Setting(form).setName("Calendar").addDropdown((drop) =>
      drop
        .addOptions({ gregorian: "Gregorian", persian: "Persian (Jalali)" })
        .setValue(config.calendar)
        .onChange((value) =>
          this.update({
            calendar: value as BlockConfig["calendar"],
            /* The week starts on a different day in each, and an explicit
               choice made for the old calendar is almost never the one the
               new calendar wants. Handing it back to "auto" is the kinder
               default; the field below is still there to override it. */
            weekStart: "auto",
          }),
        ),
    );

    if (config.mode === "month") {
      const options: Record<string, string> = { auto: "Follow the language" };
      WEEKDAY_NAMES.forEach((name, index) => (options[String(index)] = name));

      new Setting(form).setName("Week starts on").addDropdown((drop) =>
        drop
          .addOptions(options)
          .setValue(String(this.draft.weekStart ?? "auto"))
          .onChange((value) =>
            this.update({ weekStart: value === "auto" ? "auto" : Number(value) }),
          ),
      );
    }
  }

  private drawDisplayFields(form: HTMLElement): void {
    const config = this.resolved;

    if (config.columns.kind === "days") {
      new Setting(form)
        .setName("Day numbers")
        .addToggle((toggle) =>
          toggle
            .setValue(config.dayNumbers)
            .onChange((value) => this.update({ dayNumbers: value })),
        );
      new Setting(form)
        .setName(config.mode === "month" ? "Weekday names" : "Column headings")
        .addToggle((toggle) =>
          toggle.setValue(config.weekdays).onChange((value) => this.update({ weekdays: value })),
        );
      new Setting(form)
        .setName("Streak")
        .setDesc("Days in a row, counting back from today.")
        .addToggle((toggle) =>
          toggle.setValue(config.streak).onChange((value) => this.update({ streak: value })),
        );
    }

    new Setting(form)
      .setName("When the block holds several")
      .setDesc(
        "Right-click a tracker in the note to add a second one, beside this " +
          "or stacked behind it. This is the same choice, set in advance.",
      )
      .addDropdown((drop) =>
        drop
          .addOptions({ row: "Side by side", deck: "Stacked, one in front" })
          .setValue(config.layout)
          .onChange((value) => this.update({ layout: value as BlockConfig["layout"] })),
      );

    new Setting(form)
      .setName("Text beside it")
      .setDesc("Markdown, set alongside the tracker. Leave it empty for no text.")
      .addTextArea((area) => {
        area
          .setPlaceholder("What this habit is for, a link, anything.")
          .setValue(this.draft.text ?? "")
          .onChange((value) => {
            const had = Boolean((this.draft.text ?? "").trim());
            this.draft.text = value;
            /* Only redraw the whole form when the side field has to appear
               or disappear — otherwise the caret would jump out of here on
               every keystroke. */
            if (had === Boolean(value.trim())) this.drawPreview();
            else this.update({});
          });
        area.inputEl.rows = 3;
      });

    if ((this.draft.text ?? "").trim()) {
      new Setting(form).setName("Which side the tracker takes").addDropdown((drop) =>
        drop
          .addOptions({ start: "Tracker first, text after", end: "Text first, tracker after" })
          .setValue(config.side === "end" ? "end" : "start")
          .onChange((value) => this.update({ side: value as BlockConfig["side"] })),
      );
    }

    new Setting(form)
      .setName("Totals")
      .addToggle((toggle) =>
        toggle.setValue(config.totals).onChange((value) => this.update({ totals: value })),
      );
  }

  private drawAdvancedFields(form: HTMLElement): void {
    const config = this.resolved;
    const more = form.createEl("details", { cls: "hb-more" });
    more.createEl("summary", { text: "More" });

    new Setting(more)
      .setName("Cell size")
      .addSlider((slider) =>
        slider
          .setLimits(MIN_SIZE, MAX_SIZE, 1)
          .setValue(config.size)
          .setDynamicTooltip()
          .onChange((value) => this.update({ size: value })),
      );

    new Setting(more)
      .setName("Language")
      .setDesc("A tag like fa or en-GB. Empty follows the app.")
      .addText((text) =>
        text
          .setPlaceholder("follow the app")
          .setValue(this.draft.locale ?? "")
          .onChange((value) => {
            this.draft.locale = value;
            this.drawPreview();
          }),
      );

    new Setting(more).setName("Numerals").addDropdown((drop) =>
      drop
        .addOptions({ locale: "Follow the language", latin: "Always 0–9" })
        .setValue(config.numerals)
        .onChange((value) => this.update({ numerals: value as BlockConfig["numerals"] })),
    );

    if (config.columns.kind === "days") {
      new Setting(more)
        .setName("Pinned month")
        .setDesc("Empty follows the current month. Otherwise a year-month: 2026-09.")
        .addText((text) =>
          text
            .setPlaceholder("current")
            .setValue(this.draft.month && this.draft.month !== "current" ? this.draft.month : "")
            .onChange((value) => {
              this.draft.month = value.trim() || "current";
              this.drawPreview();
            }),
        );
    }
  }

  /* --- Preview ----------------------------------------------------------- */

  private drawPreview(): void {
    this.preview?.unload();
    this.previewChild.unload();
    this.previewChild = new Component();
    this.previewChild.load();
    this.previewEl.empty();

    const config = resolveConfig(this.draft, this.options.settings);
    const text = (this.draft.text ?? "").trim();

    const block = this.previewEl.createDiv({ cls: "hb-block" });
    block.dataset.side = text ? config.side : "none";
    const host = text ? block.createDiv({ cls: "hb-pair" }) : block;
    const main = host.createDiv({ cls: "hb-main" });

    const view = new TrackerView(main.createDiv(), {
      config,
      block: this.draft,
      values: this.sampleValues(config.mode, config.rows),
      compact: Boolean(text),
    });
    view.load();
    this.preview = view;

    if (!text) return;
    const prose = host.createDiv({ cls: "hb-text markdown-rendered" });
    void MarkdownRenderer.render(this.app, text, prose, "", this.previewChild);
  }

  /* A preview of an empty grid tells you nothing about how a full one reads,
     so an untouched tracker gets a plausible fortnight. An existing one is
     copied out of the store instead — but into memory, so clicking around in
     here to see how it looks cannot change what the note has recorded. */
  private sampleValues(mode: string, rows: string[]): ValueSource {
    const values = new MemoryValues();
    const keys = this.previewColumnKeys();
    const targets = mode === "month" ? [MONTH_ROW_KEY] : rows;

    if (this.options.sample) {
      for (const row of targets) {
        for (const key of this.options.sample.columnsOf(row)) {
          values.set(row, key, this.options.sample.get(row, key));
        }
      }
      return values;
    }

    const goal = this.resolved.cell === "count" ? this.resolved.goal : 1;
    targets.forEach((row, rowIndex) => {
      keys.forEach((key, index) => {
        /* A fixed pattern rather than Math.random: a preview that reshuffles
           itself every keystroke is a preview you cannot compare against. */
        if ((index * 7 + rowIndex * 3) % 5 < 3) {
          values.set(row, key, 1 + ((index + rowIndex) % goal));
        }
      });
    });
    return values;
  }

  private previewColumnKeys(): string[] {
    const config = this.resolved;
    if (config.columns.kind === "labels") return config.columns.labels;

    const now = today();
    const first = startOfMonth(now, config.calendar);
    const length = monthLength(now, config.calendar);
    return Array.from({ length }, (_, i) => isoKey(addDays(first, i))).filter(
      (key) => key <= isoKey(now),
    );
  }
}

function columnsToText(columns: BlockConfig["columns"]): string {
  if (columns === undefined || columns === "days") return "";
  if (typeof columns === "number") return String(columns);
  return columns.join(", ");
}

function textToColumns(value: string): BlockConfig["columns"] {
  const text = value.trim();
  if (!text || text.toLowerCase() === "days") return "days";
  if (/^\d+$/.test(text)) return Number(text);
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
