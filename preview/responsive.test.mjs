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
            if (sample.dataset.layout === "row") {
              if (compact && (!sample.querySelector(".hb-deck") || sample.querySelector(".hb-group"))) {
                issues.push(`${name}: mobile did not default to a deck`);
              }
              if (!compact && (!sample.querySelector(".hb-group") || sample.querySelector(".hb-deck"))) {
                issues.push(`${name}: desktop row preference changed`);
              }
            }
            for (const root of sample.querySelectorAll(".hb-root")) {
              const cell = root.querySelector(".hb-cell");
              const size = parseFloat(root.style.getPropertyValue("--hb-size"));
              const expected = compact ? Math.min(size, 26) : size;
              if ((!compact || !root.querySelector(".hb-cal")) && Math.abs(rect(cell).width - expected) > 1 && !root.closest(".hb-card")) {
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
                if (Math.abs(rect(root).width - (root.parentElement.clientWidth -
                    parseFloat(getComputedStyle(root.parentElement).paddingLeft) -
                    parseFloat(getComputedStyle(root.parentElement).paddingRight))) > 1) {
                  issues.push(`${name}: tracker does not fill its host`);
                }
                if (root.querySelector(".hb-cal")) {
                  if (Math.abs(rect(root.querySelector(".hb-cal")).width - rect(root).width) > 1) {
                    issues.push(`${name}: calendar does not fill tracker`);
                  }
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
      if (touch) {
        // Real Chromium touch input exercises gesture arbitration, pointer
        // capture and the synthetic click that a swipe must never turn into a tick.
        const session = await context.newCDPSession(page);
        const swipe = async (deck, direction, options = {}) => {
          await deck.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const cells = deck.locator(".hb-card.is-front .hb-cell");
          const boxes = await cells.evaluateAll((els) => els.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }));
          const start = boxes.reduce((best, b) => direction < 0 ? (b.x > best.x ? b : best) : (b.x < best.x ? b : best));
          const box = await deck.boundingBox();
          const distance = options.distance ?? box.width * 0.4;
          const stamp = Date.now() / 1000;
          await session.send("Input.dispatchTouchEvent", {
            type: "touchStart", touchPoints: [{ ...start, id: 1 }],
            ...(options.flick ? { timestamp: stamp } : {}),
          });
          const steps = options.flick ? 2 : 8;
          for (let i = 1; i <= steps; i++) {
            await session.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              ...(options.flick ? { timestamp: stamp + i * 0.008 } : {}),
              touchPoints: [{
                x: start.x + direction * distance * i / steps,
                y: start.y + (options.vertical ? distance * 2 * i / steps : 0), id: 1,
              }],
            });
            await page.waitForTimeout(options.flick ? 1 : options.slow ? 40 : 12);
          }
          await session.send("Input.dispatchTouchEvent", {
            type: options.cancel ? "touchCancel" : "touchEnd", touchPoints: [],
            ...(options.flick ? { timestamp: stamp + 0.024 } : {}),
          });
          await page.waitForTimeout(400);
        };
        for (const rtl of [false, true]) {
          const sample = page.locator(`.sample[data-layout="row"]`).filter({ has: page.locator(rtl ? '[dir="rtl"]' : '.hb-block') });
          // Explicitly choose the English row and Persian row, respectively.
          const deck = (rtl ? sample.last() : sample.first()).locator(".hb-deck");
          const cards = deck.locator(".hb-card");
          const first = cards.first();
          const before = await first.locator(".hb-cell").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
          const dir = rtl ? 1 : -1;
          // CodeMirror's outer editor is contenteditable; it must not make
          // the embedded deck look like an editable control to the gesture.
          await deck.evaluate((el) => {
            const block = el.closest(".hb-block");
            block.parentElement.setAttribute("contenteditable", "true");
            block.setAttribute("contenteditable", "false");
          });
          await swipe(deck, dir);
          assert.equal(await cards.nth(1).evaluate((el) => el.classList.contains("is-front")), true, "swipe advances default mobile deck");
          assert.deepEqual(await first.locator(".hb-cell").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed"))), before, "swiping must not tick a date");
          await swipe(deck, -dir);
          assert.equal(await first.evaluate((el) => el.classList.contains("is-front")), true, "reverse swipe returns");
          await swipe(deck, dir, { distance: 10, slow: true });
          assert.equal(await first.evaluate((el) => el.classList.contains("is-front")), true, "short drag springs back");
          await swipe(deck, dir, { distance: 32, flick: true });
          assert.equal(await cards.nth(1).evaluate((el) => el.classList.contains("is-front")), true, "short fast flick advances");
          await swipe(deck, -dir);
          await swipe(deck, dir, { cancel: true });
          assert.equal(await first.evaluate((el) => el.classList.contains("is-front")), true, "cancel does not navigate");
          await swipe(deck, dir, { vertical: true });
          assert.equal(await first.evaluate((el) => el.classList.contains("is-front")), true, "vertical scroll does not navigate");
          assert.equal(await deck.evaluate((el) => el.classList.contains("is-swiping")), false, "gesture state cleaned up");
          // A deliberate tap still updates the active card after swiping.
          const tap = first.locator(".hb-cell").first();
          const was = await tap.getAttribute("aria-pressed");
          await tap.tap();
          assert.notEqual(await tap.getAttribute("aria-pressed"), was);
        }
        await session.detach();
      }
      // Resize across the breakpoint without duplicating trackers or losing
      // the desktop row preference; mounted views remain refreshable.
      if (!touch && width === 1024) {
        const sample = page.locator('.sample[data-layout="row"]').first();
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(100);
        assert.equal(await sample.locator(".hb-deck").count(), 1);
        assert.equal(await sample.locator(".hb-root").count(), 3);
        await page.setViewportSize({ width: 1024, height: 900 });
        await page.waitForTimeout(100);
        assert.equal(await sample.locator(".hb-deck").count(), 0);
        assert.equal(await sample.locator(".hb-group").count(), 1);
        assert.equal(await sample.locator(".hb-root").count(), 3);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${touch ? "touch" : "mouse"}: both themes, full-width layout, auto-decks, controls, navigation, toggling, swipes/scroll/cancel/flick`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
