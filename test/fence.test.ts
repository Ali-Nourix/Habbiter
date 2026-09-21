/* Finding and replacing a fence in somebody's file. A callout is the case
   this exists for: Obsidian's section info points at the callout, not at
   the block inside it, and every line carries a "> " that is part of the
   markdown rather than of the block. Getting either wrong means an edit
   that silently does nothing, or one that breaks the callout around it. */

import { fenceFor, fenceLines, findFence, splitPrefix } from "../src/fence";
import { check, ok, report } from "./harness";

const lines = (text: string) => text.split("\n");

/* --- Prefixes ------------------------------------------------------------ */

check("plain line", splitPrefix("```habbiter").prefix, "");
check("callout line", splitPrefix("> ```habbiter").prefix, "> ");
check("nested callout", splitPrefix("> > ```habbiter").prefix, "> > ");
check("indented callout", splitPrefix("  > id: x").prefix, "  > ");
check("the rest survives", splitPrefix("> > id: x").rest, "id: x");

/* --- In a callout -------------------------------------------------------- */

const CALLOUT = lines(`# Notes

> [!tip] Morning
> Some words before it.
>
> \`\`\`habbiter
> id: hb-abc
> title: Meditate
> \`\`\`
>
> Some words after it.

Back to the note.`);

/* This is what Obsidian hands over inside a callout: the callout's own
   bounds, first line to last. */
const inCallout = findFence(CALLOUT, 2, 10, { id: "hb-abc" });
ok("the fence is found inside a callout", inCallout !== null);
check("it starts at the fence, not the callout", inCallout?.start, 5);
check("and ends at the closing fence", inCallout?.end, 8);
check("the prefix is remembered", inCallout?.prefix, "> ");
check("the body has the prefix taken off", inCallout?.body, "id: hb-abc\ntitle: Meditate");

const rewritten = [...CALLOUT];
rewritten.splice(
  inCallout!.start,
  inCallout!.end - inCallout!.start + 1,
  ...fenceLines("id: hb-abc\ntitle: Meditate\ntext: |-\n  Two\n\n  paragraphs", inCallout!.prefix),
);
ok(
  "every line written back keeps the callout's marker",
  rewritten
    .slice(inCallout!.start, inCallout!.start + 9)
    .every((line) => line.startsWith(">")),
);
ok(
  "a blank line inside the callout is not left dangling",
  rewritten.includes(">") && !rewritten.includes("> "),
);
check("the callout's own lines are untouched", rewritten[3], "> Some words before it.");
check("and so is the note after it", rewritten[rewritten.length - 1], "Back to the note.");

/* --- Telling two apart --------------------------------------------------- */

const TWO = lines(`> \`\`\`habbiter
> id: hb-one
> \`\`\`
>
> \`\`\`habbiter
> id: hb-two
> \`\`\``);

check("the first is found by its id", findFence(TWO, 0, 6, { id: "hb-one" })?.start, 0);
check("and the second by its own", findFence(TWO, 0, 6, { id: "hb-two" })?.start, 4);
check("an id that is not there matches nothing", findFence(TWO, 0, 6, { id: "hb-x" }), null);

const UNCLAIMED = lines(`\`\`\`habbiter
id: hb-one
\`\`\`

\`\`\`habbiter
title: New
\`\`\``);
check(
  "a block with no id is found by what it says",
  findFence(UNCLAIMED, 0, UNCLAIMED.length - 1, { source: "title: New" })?.start,
  4,
);
ok(
  "and never matches one that already has an id",
  findFence(UNCLAIMED, 0, UNCLAIMED.length - 1, { source: "id: hb-one" })?.start !== 0,
);

/* --- Refusing ------------------------------------------------------------ */

check("no fence in range", findFence(lines("just prose\nand more"), 0, 1, { id: "x" }), null);
check(
  "an unclosed fence is not a fence",
  findFence(lines("```habbiter\nid: x"), 0, 1, { id: "x" }),
  null,
);
check(
  "another language is left alone",
  findFence(lines("```js\nid: x\n```"), 0, 2, { id: "x" }),
  null,
);

/* --- Fences that outlast their contents ---------------------------------- */

check("three backticks by default", fenceFor("id: x"), "```");
check("four when the body holds three", fenceFor("text: |-\n  ```\n  code\n  ```"), "````");
check("five when the body holds four", fenceFor("text: |-\n  ````"), "`````");

const nested = fenceLines("text: |-\n  ```js\n  let a = 1\n  ```", "");
check("the opening fence grows with it", nested[0], "````habbiter");
check("and so does the closing one", nested[nested.length - 1], "````");
ok(
  "the block reads back as one block",
  findFence(nested, 0, nested.length - 1, { source: nested.slice(1, -1).join("\n") }) !== null,
);

report();
