/* Preview harness only. Builds the same TrackerView the note gets, once per
   shape worth looking at, so a change to the renderer or the stylesheet can
   be seen in both themes before it reaches a vault. */

import { resolveConfig } from "../src/config";
import type { BlockConfig } from "../src/config";
import { DEFAULT_SETTINGS } from "../src/settings";
import { MONTH_ROW_KEY } from "../src/store";
import type { App } from "obsidian";
import { TrackerBlock } from "../src/block";
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
    caption: "Mobile regression — smallest configured calendar",
    block: { id: "mobile-small", title: "کوچک‌ترین تقویم", size: 20, calendar: "persian", locale: "fa" },
    rtl: true,
  },
  {
    caption: "Mobile regression — largest configured calendar, long title",
    block: { id: "mobile-large", title: "A long habit title that must not hide the controls", size: 44, totals: true },
  },
  {
    caption: "Mobile regression — weekly bands with labels",
    block: { id: "mobile-bands", mode: "grid", band: "week", rows: ["Read", "Walk"], size: 44 },
  },
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
    caption: "A row of them in one block — ⋯ moves one earlier or later",
    row: [
      { id: "g1", title: "Meditate", size: 22 },
      { id: "g2", title: "Read", size: 22 },
      { id: "g3", title: "Walk", size: 22 },
    ],
  },
  {
    /* Deliberately mixed sizes. Cards share a grid cell, so they are all as
       big as the biggest — a deck that drew each tracker at its own size put
       a small one adrift in a card built for a large one. */
    caption: "A deck — stacked, swipe across the front one, sizes mixed",
    row: [
      { id: "d1", title: "مدیتیشن", calendar: "persian", size: 22 },
      { id: "d2", title: "مطالعه", calendar: "persian", size: 30 },
      { id: "d3", title: "ورزش", calendar: "persian", size: 26 },
    ],
    deck: true,
    rtl: true,
  },
  {
    /* Totals off, which is the default. This is the shape that used to come
       out as a single column fifteen cells tall: the track list asked to
       repeat none of something, which is invalid and took the whole of
       grid-template-columns with it. */
    caption: "Grid — named columns, no totals",
    block: {
      id: "n1",
      title: "Morning",
      mode: "grid",
      rows: ["Meditate", "Read", "Walk"],
      columns: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
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

/* What a group or a deck is handed for each tracker it holds. */
function trackerDeps(block: BlockConfig) {
  const config = resolveConfig(block, DEFAULT_SETTINGS);
  if (block.id === "b") config.round = true;
  const deps = {
    config,
    block,
    values: sampleValues(block, config.rows, config.cell === "count" ? config.goal : 1),
  };
  return { config, block, deps };
}

/* Use the production block, including mobile layout selection. A hand-built
   deck fixture cannot catch a phone still choosing the desktop row layout. */
for (const sample of SAMPLES) {
  const figure = root.createDiv({ cls: "sample" });
  figure.dataset.layout = sample.row ? (sample.deck ? "deck" : "row") : "single";
  figure.createDiv({ cls: "sample-caption", text: sample.caption });
  const host = figure.createDiv();
  if (sample.rtl) host.setAttribute("dir", "rtl");
  const blocks = sample.row ?? (sample.block ? [sample.block] : []);
  new TrackerBlock(host, {
    app: {} as App,
    sourcePath: "preview.md",
    text: sample.prose ? PROSE : "",
    side: sample.block?.side ?? "start",
    layout: sample.deck ? "deck" : "row",
    trackers: blocks.map(trackerDeps),
  }).load();
}
