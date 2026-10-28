/* Exercise the real renderer and CSS, including touch media queries.
   npm run test:responsive (install Chromium with npx playwright install chromium,
   or set CHROMIUM_PATH to an existing Chromium executable). */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const url = new URL("./index.html", import.meta.url).href;
const scenarios = [
  { width: 320, touch: true },
  { width: 360, touch: true },
  { width: 390, touch: true },
  { width: 600, touch: false },
  { width: 768, touch: true },
  { width: 1024, touch: false },
];

try {
  for (const { width, touch } of scenarios) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: touch,
      hasTouch: touch,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => { document.body.className = `theme-${theme}`; }, theme);
        const compact = width <= 600 || touch;
        const problems = await page.evaluate((compact) => {
          const issues = [];
          const rect = (el) => el.getBoundingClientRect();
          if (document.documentElement.scrollWidth > innerWidth + 1) issues.push("page overflow");
          for (const sample of document.querySelectorAll(".sample")) {
            const name = sample.querySelector(".sample-caption").textContent;
            if (sample.scrollWidth > sample.clientWidth + 1) issues.push(`${name}: sample overflow`);
            for (const root of sample.querySelectorAll(".hb-root")) {
              const cell = root.querySelector(".hb-cell");
              const size = parseFloat(root.style.getPropertyValue("--hb-size"));
              const expected = compact ? Math.min(size, 26) : size;
              if (Math.abs(rect(cell).width - expected) > 1 && !root.closest(".hb-card")) {
                issues.push(`${name}: configured cell size not honoured`);
              }
              if (compact) {
                const tools = root.querySelector(".hb-tools");
                const title = root.querySelector(".hb-title");
                const style = getComputedStyle(tools);
                if (style.opacity !== "1" || style.pointerEvents === "none") issues.push(`${name}: hidden controls`);
                // Back cards are intentionally scaled/covered; check front cards only.
                if (root.closest(".hb-card:not(.is-front)")) continue;
                if (rect(tools).left < rect(root).left - 1 || rect(tools).right > rect(root).right + 1) {
                  issues.push(`${name}: controls outside root`);
                }
                if (title && rect(title).bottom > rect(tools).top + 1) issues.push(`${name}: title/control overlap`);
                if (root.querySelector(".hb-cal")) {
                  const body = root.querySelector(".hb-body");
                  if (body.scrollWidth > body.clientWidth + 1) issues.push(`${name}: month requires scrolling`);
                }
              }
            }
            if (compact && sample.querySelector(".hb-pair")) {
              const main = sample.querySelector(".hb-main");
              const prose = sample.querySelector(".hb-text");
              if (rect(prose).top < rect(main).bottom - 1) issues.push(`${name}: text did not stack`);
            }
          }
          return issues;
        }, compact);
        assert.deepEqual(problems, [], `${width}px ${theme}: ${problems.join(", ")}`);
      }
      // Navigation re-renders the header; the reset action must still fit at 20px.
      const root = page.locator(".hb-root").first();
      const originalMonth = await root.locator(".hb-month").textContent();
      if (!touch && width > 600) await root.hover();
      await root.getByRole("button", { name: "Next month", exact: true }).click();
      assert.notEqual(await root.locator(".hb-month").textContent(), originalMonth);
      await root.getByRole("button", { name: "Back to this month", exact: true }).click();
      assert.equal(await root.locator(".hb-month").textContent(), originalMonth);
      const cell = root.locator(".hb-cell").first();
      const checked = await cell.getAttribute("aria-pressed");
      await cell.click();
      assert.notEqual(await cell.getAttribute("aria-pressed"), checked);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${touch ? "touch" : "mouse"}: both themes, sizing, overflow, controls, navigation, toggling`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
