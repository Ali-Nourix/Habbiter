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

interface Sample {
  caption: string;
  block?: BlockConfig;
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
    caption: "Grid — habits down, the month across",
    block: {
      id: "d",
      title: "Morning routine",
      mode: "grid",
      rows: ["Meditate", "Read", "Walk", "Water"],
      columns: "days",
      totals: true,
      streak: true,
    },
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

function mount(host: HTMLElement, block: BlockConfig, group?: boolean): void {
  const config = resolveConfig(block, DEFAULT_SETTINGS);
  if (block.id === "b") config.round = true;
  new TrackerView(host, {
    config,
    block,
    values: sampleValues(block, config.rows, config.cell === "count" ? config.goal : 1),
    /* The harness has nowhere to write an order to, so the grip is present
       and labelled but does not rearrange anything. */
    group: group ? { grab: () => {}, move: () => {}, position: () => ({ index: 0, count: 2 }) } : undefined,
  }).load();
}

for (const sample of SAMPLES) {
  const figure = root.createDiv({ cls: "sample" });
  figure.createDiv({ cls: "sample-caption", text: sample.caption });

  const host = figure.createDiv();
  if (sample.rtl) host.setAttribute("dir", "rtl");

  if (sample.row) {
    const row = host.createDiv({ cls: "hb-group" });
    for (const block of sample.row) {
      mount(row.createDiv({ cls: "hb-slot" }).createDiv(), block, true);
    }
  } else if (sample.block) {
    mount(host, sample.block);
  }
}
