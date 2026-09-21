/* Screenshot the harness.  node preview/shot.mjs <light|dark> <out.png>
   Set CHROMIUM_PATH when Playwright's own download is not the browser you
   want it to drive. */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [mode = "light", out = `shot-${mode}.png`] = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({
  viewport: { width: 900, height: 1400 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${join(here, "index.html")}`);
await page.evaluate((theme) => (document.body.className = `theme-${theme}`), mode);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
