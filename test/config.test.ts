/* What the builder writes has to be what the renderer reads back, because
   the block is going into somebody's note and nothing else re-checks it.
   The fence patterns are the ones main.ts guards a write with. */

import {
  parseBlock,
  pruneToDefaults,
  resolveConfig,
  serializeConfig,
  toCodeBlock,
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
  const fence = toCodeBlock(pruned);
  const lines = fence.split("\n");
  ok(`${input.id} writes an opening fence`, OPENING_FENCE.test(lines[0]));
  ok(`${input.id} writes a closing fence`, CLOSING_FENCE.test(lines[lines.length - 1]));

  const read = parseBlock(lines.slice(1, -1).join("\n"));
  ok(`${input.id} reads back without error`, !read.error);
  check(
    `${input.id} round-trips`,
    JSON.stringify(resolveConfig(read.config, DEFAULT_SETTINGS)),
    JSON.stringify(resolveConfig(pruned, DEFAULT_SETTINGS)),
  );
}

/* Blocks get hand-edited, so the reader takes the shape YAML happened to
   produce rather than insisting on the canonical one. */
const loose = parseBlock(
  ["mode: GRID", "rows: Meditate, Read", "columns: days", "totals: yes", "weekStart: sat", "size: 999"].join("\n"),
);
check("mode ignores case", loose.config.mode, "grid");
check("a comma list is a list", JSON.stringify(loose.config.rows), '["Meditate","Read"]');
check("columns keyword", loose.config.columns, "days");
check("yes is true", loose.config.totals, true);
check("a weekday name is a number", loose.config.weekStart, 6);
check("size is clamped", loose.config.size, 44);

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

report();
