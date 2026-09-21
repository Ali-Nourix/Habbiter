# Habbiter

Habit and tracker grids that live inside a note.

Drop one anywhere in a note: a month drawn as a calendar with a checkbox in
place of each day, or a grid of rows and columns you name yourself. Tick a box
each day; the note stays a note.

Nothing about it is styled by the plugin. Every colour, corner and hit area is
read from Obsidian's own variables, and from your theme's where the theme
offers a better one — so a tracker looks like the vault it is in, in light and
in dark, and follows the accent you picked in Appearance settings. There is no
card, no border and no fill behind it: it sits on the page the way a table
does. The buttons that change it appear when you point at it, and are always
there on a touch screen and whenever the keyboard is in the grid.

## Install

Until it is in the community list, copy `main.js`, `manifest.json` and
`styles.css` from this repository into `<vault>/.obsidian/plugins/habbiter/`,
then enable it in **Settings → Community plugins**. The built `main.js` is
committed, so there is nothing to build first.

## Making one

**Right-click in the editor → Insert habit tracker…**, or run
**Habbiter: Insert tracker** from the command palette.

Either opens a form with a live preview of the tracker above it — the real
component, not a picture of one, so you can click around in it before you
commit. The preview's clicks are thrown away.

The form writes a fenced block into the note, which is the only thing that
ends up in your markdown:

````markdown
```habbiter
id: hb-m8x2q1a4
title: Meditate
```
````

To change one later, hover it and use **⋯ → Edit tracker…** — the same form,
opened on what is already there. Renaming a row or a column in the form keeps
its ticks; the form matches the old list against the new one by position.

## What the block can say

Everything is optional except `id`. Anything left out follows
**Settings → Habbiter**, so a block only ever states what you chose.

| Key | What it does |
| --- | --- |
| `id` | Where the ticks are filed. Written for you; do not reuse one. |
| `title` | The tracker's name. A month tracker with no title is named by its month. |
| `mode` | `month` — the month as a calendar. `grid` — rows and columns. |
| `cell` | `check` for a checkbox, `count` for a counter. |
| `goal` | Counter only: what a full cell means. Clicking cycles up to it and back to zero. |
| `rows` | Grid only: a list of row names. |
| `columns` | Grid only: a list of names, a plain number, or `days` for the month. |
| `calendar` | `gregorian` or `persian`. |
| `month` | `current`, or a year-month in the block's own calendar: `2026-09`. |
| `weekStart` | `auto`, a weekday name, or `0`–`6` with `0` as Sunday. |
| `locale` | A tag like `fa` or `en-GB` for month and weekday names. Empty follows the app. |
| `numerals` | `locale` or `latin`. |
| `dayNumbers`, `weekdays`, `totals`, `streak` | What the tracker shows. |
| `size` | The side of a cell in pixels, 20 to 44. |
| `wrap` | `none` for a band of its own, or `start` / `end` to let text run beside it. `left` and `right` are accepted and mean the same. |
| `trackers` | A list, to put several in one block. See below. |

A grid of four habits across the month:

````markdown
```habbiter
id: hb-k1p7w2
title: Morning routine
mode: grid
rows:
  - Meditate
  - Read
  - Walk
columns: days
totals: true
```
````

A week of counters:

````markdown
```habbiter
id: hb-r4t9m0
title: Reps
mode: grid
cell: count
goal: 4
rows: [Push-ups, Squats, Plank]
columns: [Mon, Tue, Wed, Thu, Fri]
```
````

## Writing beside one

By default a tracker takes a band across the note. Floated, it is only as
wide and as tall as its own grid, and the text after it runs alongside:

````markdown
```habbiter
id: hb-n3f8
title: Meditate
wrap: start
size: 22
```
Anything written after the block flows up the side of it and closes
underneath, the way text flows past a figure.
````

`wrap: start` puts the tracker where the line starts — the left in English,
the right in Persian — and `wrap: end` puts it at the other side. A heading
or a horizontal rule after it starts a fresh band, so a floated tracker
never runs into the next section.

Hover a tracker and **drag it by the grip** to place it: the outer thirds of
the text column float it to that side, the middle gives it a band of its
own, and Escape abandons the move. The same three are in **⋯**, and on the
grip itself with ← and →.

**What is still not on offer:** dropping a tracker at arbitrary x and y. It
could be done — the block could carry an offset and the tracker could be
shifted by it — but the offset would be measured against a column width that
is different on your phone, in an export and in someone else's window, so it
would land somewhere else every time. What a document can say durably is
*which side*, so that is what is stored. For genuinely free positioning,
Obsidian's canvas is the place, and a tracker works in a canvas card like
anything else.

## Several side by side

One block can hold a row of trackers. They lay themselves out across the
width of the note and wrap, each one as wide as its own grid:

````markdown
```habbiter
calendar: persian
size: 22
trackers:
  - id: hb-k2p9
    title: مدیتیشن
  - id: hb-m4x1
    title: مطالعه
  - id: hb-q7v3
    title: پیاده‌روی
```
````

Anything the row shares is said once at the top and inherited; anything one
tracker does differently sits on its own entry. Each keeps its own `id`, so
each keeps its own ticks.

The quickest way to build one is **⋯ → Add one beside this…** on a tracker
you already have. **⋯ → Take out of the row** removes one again — its ticks
are filed under its `id`, not its position, so they are still there if you
put it back.

**Reordering.** Hover a tracker and drag it by the grip at the top. The row
rearranges as you go and Escape puts it back. The order is written into the
block, which is the only place a markdown file can keep one — so it survives
closing the note, syncing, and anyone else opening it. The same move is in
**⋯ → Move earlier / Move later**, and on the grip itself with ← and →,
because a drag is no use from a keyboard.

**What is not on offer:** dragging a tracker to an arbitrary spot on the
page. A note is a markdown document, not a canvas: there is nowhere in it to
record that something sits 240px from the left, and anything faking it would
come apart in reading view, in an export and on a phone. Obsidian's own
canvas is the place for free positioning — a tracker works in a canvas card
like anything else.

## Using one

| | |
| --- | --- |
| Click | Tick, or count up one and wrap back to zero at the goal |
| Shift-click | Count back down |
| Arrows | Move around the grid |
| Space, Enter | Same as a click |
| `+`, `-` | Count up or down, past the goal if you want |
| Backspace, Delete | Clear the cell |
| Tab | Into and out of the grid in one press |

Every cell is a real button with a label, so a screen reader reads
"Meditate — Monday 21 September 2026" and whether it is ticked. Today is
marked with a ring as well as a colour, and a ticked cell is a solid block
where an empty one is an outline — nothing here is carried by colour alone.

## Persian

Set **Calendar** to Persian — in Settings for the whole vault, in the builder
for one tracker, or from **⋯ → Show in the Persian calendar** on a tracker in
front of you. The months become Farvardin to Esfand, cut at the right days,
named in Persian, counted in ۰–۹, and the week starts on Saturday. The
calendar brings its own language: **Language** only needs setting to read a
Persian calendar in some other one, and **Numerals** to count it in 0–9. A
tracker in a right-to-left note lays itself out right to left.

Ticks are always filed under the real date, so switching a tracker between
calendars re-labels the grid without losing a single one.

## Where the ticks are kept

In the plugin's own data file — `.obsidian/plugins/habbiter/data.json` —
under each tracker's `id`. Obsidian Sync carries it like any other plugin
state.

They are deliberately not written back into the note. Saving a value into the
fence means editing the file your cursor is sitting in, and the cost of that
lands exactly when the plugin is supposed to be invisible: a caret that jumps
mid-sentence, a sync conflict between two devices that both ticked today.

The practical consequences are worth knowing. Copying a block to another note
copies its `id`, so both places show the same tracker — give the copy a new
`id` if you wanted a separate one. Deleting a note leaves its ticks in
`data.json`. And a tracker in an exported or read-only note still draws and
still takes clicks, but says out loud that they are not being kept.

## Theming

Everything the plugin paints comes from a variable, and every variable falls
back through your theme's token, then Obsidian's, then a literal. A snippet
can move any of them:

```css
.hb-root {
  --hb-accent: var(--color-green);
  --hb-radius: 50%;
  --hb-cell: 32px;
}
```

`--hb-page` is the one worth knowing about. A tracker wider than the note
scrolls sideways under a row-label column that stays put, and the label has to
be opaque or the cells slide through it. CSS cannot read the colour actually
painted behind an element, so `--hb-page` is what the label sits on, and it
defaults to the page. Set it where a tracker lives on something else —
[Bookcloth](https://github.com/Ali-Nourix/Obsidian-Theme) does this for
callouts, embeds, sidebars and popovers.

## Building

```sh
npm install
npm run build     # typecheck, test, then bundle to main.js
npm test          # the date arithmetic and the block format
npm run dev       # rebuild on change
```

The tests cover the two things that are expensive to get wrong: the calendar
maths behind the grids, including the Persian leap years, and the block
format, which is written back into somebody's note.

`preview/` renders the real component in a browser against a stand-in for the
`obsidian` module, so a change to the renderer or the stylesheet can be
checked in both themes without a vault. See `preview/README.md`.

## Releasing

Obsidian looks a plugin's version up by its release tag, so the tag *is* the
version and carries no `v`:

```sh
# bump manifest.json, package.json and versions.json together, then
npm run build && git commit -am "1.0.1"
git tag -a 1.0.1 -m "Habbiter 1.0.1"
git push origin main 1.0.1
```

Pushing the tag runs `.github/workflows/release.yml`, which refuses to build
if the tag and `manifest.json` disagree, then publishes a release carrying
`main.js`, `manifest.json` and `styles.css` — downloadable from the tag,
which is the whole point of building them.

The same workflow can also be started from the Actions tab with a version,
and will mint the tag itself from the branch it was run on — the path for
anywhere a tag cannot be pushed by hand. It refuses a version the manifest
does not claim, and refuses to overwrite a release that is already out with
its files. A release that did not finish — unpublished, or published with
nothing attached — it repairs and completes, and it asserts at the end that
all three files really are on the tag.

`.github/workflows/ci.yml` runs on every push: typecheck, tests, bundle, and
a check that the committed `main.js` is the one the source builds.

## License

MIT.
