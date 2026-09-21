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

Set **Calendar** to Persian and the months become Farvardin to Esfand, cut at
the right days, with the week starting on Saturday. Set **Language** to `fa`
for Persian month and weekday names, and **Numerals** decides whether the
days are counted in ۰–۹ or 0–9. A tracker in a right-to-left note lays itself
out right to left.

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
if the tag and `manifest.json` disagree, then attaches `main.js`,
`manifest.json` and `styles.css` to a **draft** release. Publishing it is a
separate click, because publishing is a decision rather than a side effect of
asking for a build.

The same workflow can also be started from the Actions tab with a version,
and will mint the tag itself from the branch it was run on — the path for
anywhere a tag cannot be pushed by hand. It refuses a version the manifest
does not claim, and refuses to reuse a tag that already exists.

`.github/workflows/ci.yml` runs on every push: typecheck, tests, bundle, and
a check that the committed `main.js` is the one the source builds.

## License

MIT.
