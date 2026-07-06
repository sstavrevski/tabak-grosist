import { test, expect, type Page } from "@playwright/test";

/**
 * The critical invariant for this project: REVEAL ANIMATIONS MUST NEVER LEAVE
 * CONTENT PERMANENTLY HIDDEN. Content is shown by default (CSS opacity:1) and
 * only animated in; if the animation engine mis-fires, content must still end
 * up visible. These tests guard that guarantee from every angle.
 */

const PAGES = ["/", "/politika-za-privatnost", "/uslovi"];

// Elements whose entrance animation could otherwise strand them invisible.
const REVEAL_SELECTOR =
  "[data-reveal],[data-hero-item],.hero-title-line,.timeline-card,.credentials-list li,.mk-map,.brand-track";

/**
 * Returns class names of any element that is MEANINGFULLY in view yet still
 * (near) invisible. "Meaningfully" = its top is above 75% of the viewport —
 * past every reveal trigger (which fire by "top 78-88%"). Elements merely
 * peeking into the bottom edge are legitimately mid fade-in and excluded.
 */
async function stuckHiddenOnScreen(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const els = Array.from(document.querySelectorAll(selector));
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const meaningfullyInView =
          r.width > 0 &&
          r.height > 0 &&
          r.top < window.innerHeight * 0.75 &&
          r.bottom > 0;
        return (
          meaningfullyInView && parseFloat(getComputedStyle(el).opacity) < 0.9
        );
      })
      .map((el) => (el as HTMLElement).className || el.tagName);
  }, REVEAL_SELECTOR);
}

/**
 * Scroll the whole page in steps. After each step, poll (up to 3s) until no
 * element is stranded invisible — this tolerates elements that are mid
 * fade-in animation, but fails if anything stays hidden, which is the actual
 * defect we guard against.
 */
async function scrollAndAssertVisible(page: Page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const step = 500;
  for (let y = 0; y <= height; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
    await expect
      .poll(() => stuckHiddenOnScreen(page), {
        timeout: 6000,
        intervals: [100, 250, 500, 1000, 1500],
      })
      .toEqual([]);
  }
}

test.describe("content visibility guarantee", () => {
  for (const path of PAGES) {
    test(`every section is visible while scrolling ${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Past the entrance animations and the 1.5s hard failsafe.
      await page.waitForTimeout(1800);
      await scrollAndAssertVisible(page);
    });
  }

  test("every section is visible while scrolling on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1800);
    await scrollAndAssertVisible(page);
  });

  test("content is visible even with JavaScript disabled", async ({
    browser,
  }) => {
    // Worst case: the animation script never runs at all. Because content is
    // shown by default and only hidden by JS, it must remain fully visible.
    // Walk the whole page so below-the-fold sections are checked too.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await scrollAndAssertVisible(page);
    await context.close();
  });

  test("content is visible with reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForTimeout(500);
    await scrollAndAssertVisible(page);
    await context.close();
  });

  test("scrolling during the hero intro doesn't snap it to the end", async ({
    page,
  }) => {
    // Regression: the reveal safety nets must not touch the hero intro
    // elements, or an early scroll would jump the entrance straight to its
    // end state (broken animation).
    await page.goto("/");
    await page.waitForTimeout(120);
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(150);

    const opacities = await page.evaluate(() =>
      [...document.querySelectorAll("[data-hero-item]")].map((e) =>
        parseFloat(getComputedStyle(e).opacity),
      ),
    );
    // Still mid-entrance — not prematurely completed by the scroll.
    expect(Math.max(...opacities)).toBeLessThan(1);

    // ...but fully visible once the intro finishes.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll("[data-hero-item]")].every(
              (e) => getComputedStyle(e).opacity === "1",
            ),
          ),
        { timeout: 4000 },
      )
      .toBe(true);
  });

  test("no reveal element is left permanently hidden after full load", async ({
    page,
  }) => {
    // The ultimate backstop: after everything has loaded and settled, walk the
    // whole page and assert every reveal element that is meaningfully in view
    // is visible — the exact defect that was reported.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await scrollAndAssertVisible(page);
    // And back to the top — nothing should have been stranded on the way.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    expect(await stuckHiddenOnScreen(page)).toEqual([]);
  });
});
