/* Bundles each test against the stub and runs it. `npm test`.

   The tests cover the two things that are expensive to get wrong: the date
   arithmetic behind the grids, and the block format, which is written back
   into somebody's note. */
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "habbiter-test-"));
const suites = ["calendar.test.ts", "config.test.ts"];

let failed = false;
for (const suite of suites) {
  const bundle = join(out, `${suite}.cjs`);
  await esbuild.build({
    entryPoints: [join(here, suite)],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundle,
    alias: { obsidian: join(here, "obsidian-stub.cjs") },
    logLevel: "warning",
  });
  console.log(`\n— ${suite}`);
  try {
    execFileSync(process.execPath, [bundle], { stdio: "inherit" });
  } catch {
    failed = true;
  }
}

if (failed) process.exit(1);
