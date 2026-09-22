/* What the builder writes has to be what the renderer reads back, because
   the block is going into somebody's note and nothing else re-checks it.
   The fence patterns are the ones main.ts guards a write with. */

import {
  buildGroup,
  parseBlock,
  pruneToDefaults,
  resolveConfig,
  serializeConfig,
  toCodeBlock,
  trackersOf,
} from "../src/config";
import type { BlockConfig } from "../src/config";
import { DEFAULT_SETTINGS } from "../src/settings";
import { check, ok, report } from "./harness";

const OPENING_FENCE = /^\s*`{3,}\s*habbiter\s*$/;
const CLOSING_FENCE = /^\s*`{3,}\s*$/;

for (const line of ["```habbiter", "````habbiter", "   ```habbiter  "]) {
  ok(`opening fence: ${JSON.stringify(line)}`, OPENING_FENCE.test(line));
}
for (const line of ["```js", "```", "```habbiterx", "prose", "``` habbiter extra"]) {
  ok(`not an opening fence: ${JSON.stringify(line)}`, !OPENING_FENCE.test(line));
}
ok("closing fence", CLOSING_FENCE.test("```") && !CLOSING_FENCE.test("```js"));

const CASES: BlockConfig[] = [
  { id: "hb-1", title: "Meditate" },
  { id: "hb-2", mode: "grid", rows: ["A", "B"], columns: ["x", "y"], cell: "count", goal: 3 },
  { id: "hb-3", mode: "grid", rows: ["Solo"], columns: 5 },
  { id: "hb-4", calendar: "persian", locale: "fa", month: "1405-06", weekStart: 6 },
  { id: "hb-5", title: "ورزش: صبح «زود»" },
];

for (const input of CASES) {
  const pruned = pruneToDefaults(input, DEFAULT_SETTINGS);
  const fence = toCodeBlock({ shared: pruned, group: null });
  const lines = fence.split("\n");
  ok(`${input.id} writes an opening fence`, OPENING_FENCE.test(lines[0]));
  ok(`${input.id} writes a closing fence`, CLOSING_FENCE.test(lines[lines.length - 1]));

  const read = parseBlock(lines.slice(1, -1).join("\n"));
  ok(`${input.id} reads back without error`, !read.error);
  ok(`${input.id} reads back as one tracker`, read.doc.group === null);
  check(
    `${input.id} round-trips`,
    JSON.stringify(resolveConfig(read.doc.shared, DEFAULT_SETTINGS)),
    JSON.stringify(resolveConfig(pruned, DEFAULT_SETTINGS)),
  );
}

/* Blocks get hand-edited, so the reader takes the shape YAML happened to
   produce rather than insisting on the canonical one. */
const loose = parseBlock(
  ["mode: GRID", "rows: Meditate, Read", "columns: days", "totals: yes", "weekStart: sat", "size: 999"].join("\n"),
);
check("mode ignores case", loose.doc.shared.mode, "grid");
check("a comma list is a list", JSON.stringify(loose.doc.shared.rows), '["Meditate","Read"]');
check("columns keyword", loose.doc.shared.columns, "days");
check("yes is true", loose.doc.shared.totals, true);
check("a weekday name is a number", loose.doc.shared.weekStart, 6);
check("size is clamped", loose.doc.shared.size, 44);

ok("broken YAML is reported, not thrown", Boolean(parseBlock("rows: [unclosed").error));
ok("an empty block is not an error", !parseBlock("").error);
ok("a bare list is reported", Boolean(parseBlock("- one\n- two").error));
ok("blank values are left out", !serializeConfig({ id: "x", title: "" }).includes("title"));

/* Month mode has no rows or columns, so a block should not carry any. */
const monthly = pruneToDefaults(
  { id: "hb-6", mode: "month", rows: ["stale"], columns: ["stale"] },
  DEFAULT_SETTINGS,
);
ok("month mode drops grid keys", !("rows" in monthly) && !("columns" in monthly));

/* --- Several in one block ----------------------------------------------- */

check("stacked is a layout", parseBlock("layout: deck").doc.shared.layout, "deck");
check("stack is the same key", parseBlock("stack: deck").doc.shared.layout, "deck");
check("side by side is the other", parseBlock("layout: row").doc.shared.layout, "row");
check("nonsense is ignored", parseBlock("layout: pile").doc.shared.layout, undefined);
check(
  "a layout survives the round trip",
  parseBlock(
    toCodeBlock(buildGroup(
      [{ id: "a", layout: "deck" }, { id: "b", layout: "deck" }],
      DEFAULT_SETTINGS,
    )).split("\n").slice(1, -1).join("\n"),
  ).doc.shared.layout,
  "deck",
);

/* --- Text in the block --------------------------------------------------
   This is a paragraph somebody typed, going through YAML and back into
   their note. Newlines, colons, quotes, markdown punctuation and Persian
   all have to come out the other side exactly as they went in, because the
   block is rewritten every time anything else about the tracker changes. */

const PROSE = [
  "Meditate: ten minutes, **before** coffee.",
  "",
  "- [[Morning routine]]",
  '- "quoted", #tagged, 50% of days',
  "  indented continuation",
  "صبح‌ها، قبل از قهوه.",
].join("\n");

const withText = pruneToDefaults(
  { id: "t1", title: "Meditate", text: PROSE, side: "end" },
  DEFAULT_SETTINGS,
);
const textFence = toCodeBlock({ shared: withText, group: null });
const textBack = parseBlock(textFence.split("\n").slice(1, -1).join("\n"));

ok("a block with text parses", !textBack.error);
check("the text comes back byte for byte", JSON.stringify(textBack.doc.shared.text), JSON.stringify(PROSE));
check("and keeps its side", textBack.doc.shared.side, "end");
ok("the fence is still one fence", textFence.split("```").length === 3);
ok(
  "nothing in the text can close the fence",
  !textFence.split("\n").slice(1, -1).some((line) => line.startsWith("```")),
);

/* Text belongs to the block, not to one tracker in a row. */
const rowWithText = buildGroup(
  [
    { id: "r1", title: "A", text: PROSE },
    { id: "r2", title: "B", text: PROSE },
  ],
  DEFAULT_SETTINGS,
);
ok("text is never folded into the shared options", rowWithText.shared.text === undefined);

/* --- Which side ---------------------------------------------------------
   "left" and "right" are what people type; a tracker in a Persian note
   belongs at the start of the line, which is the right one. */

check("left means the start of the line", parseBlock("side: left").doc.shared.side, "start");
check("right means the end of it", parseBlock("side: RIGHT").doc.shared.side, "end");
check("wrap still works, as 1.2.0 spelled it", parseBlock("wrap: start").doc.shared.side, "start");
check("none is a band of its own", parseBlock("side: none").doc.shared.side, "none");
check("nonsense is ignored", parseBlock("side: sideways").doc.shared.side, undefined);
check(
  "a placement survives the round trip",
  parseBlock(
    toCodeBlock({ shared: pruneToDefaults({ id: "w", side: "end" }, DEFAULT_SETTINGS), group: null })
      .split("\n")
      .slice(1, -1)
      .join("\n"),
  ).doc.shared.side,
  "end",
);

/* --- Calendars ----------------------------------------------------------
   Picking the Persian calendar and being handed "Shahrivar 1405 AP" on a
   week that starts on Sunday is not what anybody meant by picking it. */

const persian = resolveConfig({ id: "p", calendar: "persian" }, DEFAULT_SETTINGS);
check("Persian names itself", persian.locale, "fa");
check("and starts its week on Saturday", persian.weekStart, 6);

const persianByDefault = resolveConfig({ id: "p" }, { ...DEFAULT_SETTINGS, calendar: "persian" });
check("the vault default does the same", persianByDefault.locale, "fa");

const asked = resolveConfig({ id: "p", calendar: "persian", locale: "en" }, DEFAULT_SETTINGS);
check("an explicit language still wins", asked.locale, "en");

const gregorian = resolveConfig({ id: "g" }, DEFAULT_SETTINGS);
check("Gregorian still follows the app", gregorian.locale, "");

/* --- Groups -------------------------------------------------------------
   A row of trackers states each shared choice once, keeps each tracker's own
   id, and comes back in the order it was written — which is what dragging
   one of them changes. */

const ROW: BlockConfig[] = [
  { id: "hb-a", title: "Meditate", calendar: "persian", size: 24 },
  { id: "hb-b", title: "Read", calendar: "persian", size: 24 },
  { id: "hb-c", title: "Reps", calendar: "persian", size: 24, cell: "count", goal: 4 },
];

const rowDoc = buildGroup(ROW, DEFAULT_SETTINGS);
check("a row is a group", rowDoc.group?.length, 3);
check("what they share is said once", rowDoc.shared.calendar, "persian");
check("and once only", rowDoc.group?.filter((e) => "calendar" in e).length, 0);
ok("what differs stays on its own entry", rowDoc.group?.[2].cell === "count");
ok("every entry keeps its id", (rowDoc.group ?? []).every((e) => Boolean(e.id)));

const rowFence = toCodeBlock(rowDoc);
const rowBack = parseBlock(rowFence.split("\n").slice(1, -1).join("\n"));
ok("a row reads back without error", !rowBack.error);
check("a row reads back the same length", rowBack.doc.group?.length, 3);
check(
  "a row round-trips, shared options and all",
  JSON.stringify(trackersOf(rowBack.doc).map((t) => resolveConfig(t, DEFAULT_SETTINGS))),
  JSON.stringify(ROW.map((t) => resolveConfig(t, DEFAULT_SETTINGS))),
);
check(
  "a row keeps its order",
  trackersOf(rowBack.doc).map((t) => t.id).join(","),
  "hb-a,hb-b,hb-c",
);

const moved = [2, 0, 1].map((i) => trackersOf(rowBack.doc)[i]);
const movedBack = parseBlock(
  toCodeBlock(buildGroup(moved, DEFAULT_SETTINGS)).split("\n").slice(1, -1).join("\n"),
);
check(
  "reordering a row is what gets written",
  trackersOf(movedBack.doc).map((t) => t.id).join(","),
  "hb-c,hb-a,hb-b",
);

check("one tracker is not a group", buildGroup([ROW[0]], DEFAULT_SETTINGS).group, null);
ok("a non-list trackers key is reported", Boolean(parseBlock("trackers: nope").error));

report();
