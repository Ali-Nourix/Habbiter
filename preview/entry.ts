/* Preview harness only. Builds the same TrackerView the note gets, once per
   shape worth looking at, so a change to the renderer or the stylesheet can
   be seen in both themes before it reaches a vault. */

import { resolveConfig } from "../src/config";
import type { BlockConfig } from "../src/config";
import { DEFAULT_SETTINGS } from "../src/settings";
import { MONTH_ROW_KEY } from "../src/store";
import { TrackerView } from "../src/tracker";
import { MemoryValues } from "../src/values";
import { addDays, isoKey, monthLength, startOfMonth, today } from "../src/calendar";

const PROSE =
  "Habits are not a matter of memory. The point of writing one down beside " +
  "the day it belongs to is that the page, not you, does the remembering — " +
  "and that a month of them reads as a shape rather than a list. Text set " +
  "next to a tracker should flow past it the way it flows past a figure, " +
  "closing under it and carrying on, without the tracker taking a band of " +
  "the page it does not need. This paragraph is here to prove it does.";

interface Sample {
  caption: string;
  /** Renders the row as a deck instead: stacked, one in front. */
  deck?: boolean;
  block?: BlockConfig;
  /** Prose after the tracker, to show what a float actually does to it. */
  prose?: boolean;
  /** A row of trackers in one block, the way a group renders. */
  row?: BlockConfig[];
  rtl?: boolean;
}

const SAMPLES: Sample[] = [
  {
    caption: "Month calendar — the default",
    block: { id: "a", title: "Meditate", mode: "month", streak: true, totals: true },
  },
  {
    caption: "Month calendar — no title, round cells, Monday start",
    block: { id: "b", mode: "month", weekStart: 1, totals: true, streak: false },
  },
  {
    caption: "Persian calendar, right to left",
    block: { id: "c", title: "ورزش روزانه", mode: "month", calendar: "persian", locale: "fa" },
    rtl: true,
  },
  {
    caption: "Grid, Persian month — one strip that runs on to the next line",
    block: {
      id: "b1",
      title: "عادت‌های ماه",
      mode: "grid",
      calendar: "persian",
      rows: ["ورزش", "مطالعه", "آب"],
      columns: "days",
      size: 24,
      totals: true,
      streak: true,
    },
    rtl: true,
  },
  {
    caption: "Grid — one habit, the month as a wrapping strip",
    block: { id: "b2", title: "Meditate", mode: "grid", rows: [""], columns: "days", totals: true },
  },
  {
    caption: "Grid — habits down, the month across, run flat (band: none)",
    block: {
      id: "d",
      title: "Morning routine",
      mode: "grid",
      rows: ["Meditate", "Read", "Walk", "Water"],
      columns: "days",
      band: "none",
      totals: true,
      streak: true,
    },
  },
  {
    caption: "Text beside it, tracker on the starting side",
    block: { id: "w1", title: "Meditate", size: 22, side: "start" },
    prose: true,
  },
  {
    caption: "Text beside it, tracker on the other side",
    block: { id: "w2", title: "Read", size: 22, side: "end" },
    prose: true,
  },
  {
    caption: "No text in the block — the tracker has it to itself",
    block: { id: "w3", title: "Walk", size: 22 },
  },
  {
    caption: "A row of them in one block — drag by the grip to reorder",
    row: [
      { id: "g1", title: "Meditate", size: 22 },
      { id: "g2", title: "Read", size: 22 },
      { id: "g3", title: "Walk", size: 22 },
    ],
  },
  {
    caption: "A deck — stacked, swipe across the front one",
    row: [
      { id: "d1", title: "مدیتیشن", calendar: "persian", size: 24 },
      { id: "d2", title: "مطالعه", calendar: "persian", size: 24 },
      { id: "d3", title: "ورزش", calendar: "persian", size: 24 },
    ],
    deck: true,
    rtl: true,
  },
  {
    caption: "A row on the Persian calendar",
    row: [
      { id: "g4", title: "ورزش", calendar: "persian", size: 22 },
      { id: "g5", title: "مطالعه", calendar: "persian", size: 22 },
    ],
    rtl: true,
  },
  {
    caption: "Grid — named columns, counter cells",
    block: {
      id: "e",
      title: "Reps",
      mode: "grid",
      cell: "count",
      goal: 4,
      rows: ["Push-ups", "Squats", "Plank"],
      columns: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      totals: true,
    },
  },
];

function sampleValues(block: BlockConfig, rows: string[], goal: number): MemoryValues {
  const values = new MemoryValues();
  const config = resolveConfig(block, DEFAULT_SETTINGS);
  const targets = config.mode === "month" ? [MONTH_ROW_KEY] : rows;

  const keys =
    config.columns.kind === "labels"
      ? config.columns.labels
      : Array.from({ length: monthLength(today(), config.calendar) }, (_, i) =>
          isoKey(addDays(startOfMonth(today(), config.calendar), i)),
        ).filter((key) => key <= isoKey(today()));

  targets.forEach((row, rowIndex) => {
    keys.forEach((key, index) => {
      if ((index * 7 + rowIndex * 3) % 5 < 3) values.set(row, key, 1 + ((index + rowIndex) % goal));
    });
  });
  return values;
}

const root = document.getElementById("samples") as HTMLElement;

function mount(host: HTMLElement, block: BlockConfig, group?: boolean, compact?: boolean): void {
  const config = resolveConfig(block, DEFAULT_SETTINGS);
  if (block.id === "b") config.round = true;
  new TrackerView(host, {
    config,
    block,
    values: sampleValues(block, config.rows, config.cell === "count" ? config.goal : 1),
    /* The harness has nowhere to write an order to, so the grip is present
       and labelled but does not rearrange anything. */
    group: group ? { move: () => {}, position: () => ({ index: 0, count: 2 }) } : undefined,
    compact,
  }).load();
}

for (const sample of SAMPLES) {
  const figure = root.createDiv({ cls: "sample" });
  figure.createDiv({ cls: "sample-caption", text: sample.caption });

  const host = figure.createDiv();
  if (sample.rtl) host.setAttribute("dir", "rtl");

  if (sample.row && sample.deck) {
    /* The same shape deck.ts builds: cards in one grid cell, depth as a
       number on each. The harness sets the numbers; the plugin sets them
       from where the swipe got to. */
    const root = host.createDiv({ cls: "hb-block" }).createDiv({ cls: "hb-deckroot" });
    const deck = root.createDiv({ cls: "hb-deck" });
    sample.row.forEach((block, index) => {
      const card = deck.createDiv({ cls: "hb-card" });
      card.style.setProperty("--hb-depth", String(index));
      card.toggleClass("is-front", index === 0);
      mount(card.createDiv(), block, false, true);
    });
    const bar = root.createDiv({ cls: "hb-deckbar" });
    bar.createEl("button", { cls: "hb-tool hb-deckstep is-nav", text: "‹" });
    const dots = bar.createDiv({ cls: "hb-dots" });
    sample.row.forEach((_, index) => {
      dots.createEl("button", { cls: index === 0 ? "hb-dot is-active" : "hb-dot" });
    });
    bar.createEl("button", { cls: "hb-tool hb-deckstep is-nav", text: "›" });
  } else if (sample.row) {
    const row = host.createDiv({ cls: "hb-group" });
    for (const block of sample.row) {
      mount(row.createDiv({ cls: "hb-slot" }).createDiv(), block, true);
    }
  } else if (sample.block) {
    /* The same shape block.ts builds: the block's own two columns, not a
       float on the note. The harness stands in for Obsidian's markdown
       renderer with a plain paragraph. */
    if (sample.prose) {
      const block = host.createDiv({ cls: "hb-block" });
      block.dataset.side = sample.block.side ?? "start";
      const pair = block.createDiv({ cls: "hb-pair" });
      mount(pair.createDiv({ cls: "hb-main" }).createDiv(), sample.block, false, true);
      pair.createDiv({ cls: "hb-text markdown-rendered" }).createEl("p", { text: PROSE });
    } else {
      mount(host.createDiv({ cls: "hb-block" }).createDiv(), sample.block);
    }
  }

}
