# Preview harness

A browser page that renders the real `TrackerView` against a stand-in for the
`obsidian` module, so a change to the renderer or to `styles.css` can be seen
in both themes without installing the plugin in a vault.

```sh
node preview/build.mjs                       # bundle the harness
node preview/shot.mjs light shot-light.png   # needs playwright
node preview/shot.mjs dark  shot-dark.png
```

`shim.css` holds Obsidian's own variable defaults, which is what the plugin
looks like on a bare install. To check it against a theme, copy that theme's
`theme.css` into this folder — `index.html` already links it, and the link is
harmless when the file is not there.

## Responsive regression tests

```sh
npm ci
npx playwright install chromium
npm run test:responsive
# Or use a system browser:
CHROMIUM_PATH=/path/to/chromium npm run test:responsive
```

Checks 320, 360, 390, 600, 768 and 1024px viewports, touch and mouse,
light/dark themes, Persian RTL calendars, small/large cell sizes, grouped
trackers, decks, weekly bands, prose stacking, header controls, month
navigation and cell toggling. Wide flat grids may scroll inside the tracker;
monthly calendars and the note itself must not overflow. Mobile month grids
fill the note in seven equal columns; non-calendar grids retain compact
configured cells. Multi-tracker blocks automatically become swipeable decks
on mobile without changing the saved desktop layout.

The harness mounts the production `TrackerBlock`, not a hand-built layout.
Chromium touch input checks LTR/RTL swipes, reverse swipes, fast flicks,
short-drag spring-back, cancellation, vertical scrolling, tap-after-swipe and
no accidental date toggles. A resize regression checks deck/row remounting.
