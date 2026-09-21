/* Bundles the real renderer against the shim. `node preview/build.mjs`. */
import esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [join(here, "entry.ts")],
  bundle: true,
  /* IIFE, not a module: Chromium blocks module imports on file:// URLs and
     the harness is meant to open by double-clicking it. */
  format: "iife",
  target: "es2022",
  outfile: join(here, "harness.js"),
  alias: { obsidian: join(here, "obsidian-shim.js") },
  logLevel: "info",
});
