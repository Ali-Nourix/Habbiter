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
