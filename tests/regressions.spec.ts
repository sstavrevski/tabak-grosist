import { test, expect } from "@playwright/test";

const PAGES = ["/", "/politika-za-privatnost", "/uslovi"];

test.describe("pages load cleanly", () => {
  for (const path of PAGES) {
    test(`${path} responds 200 with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveTitle(/Табак Гросист/);
      expect(errors).toEqual([]);
    });
  }

  test("no failed network requests on the homepage", async ({ page }) => {
    const failed: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(failed).toEqual([]);
  });
});

test.describe("SEO + social assets", () => {
  test("homepage has canonical, OG image and description", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /tabakgrosist\.mk/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /og\.png/,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/,
    );
  });

  test("robots.txt and sitemap are served", async ({ request }) => {
    expect((await request.get("/robots.txt")).status()).toBe(200);
    expect((await request.get("/sitemap-index.xml")).status()).toBe(200);
    expect((await request.get("/og.png")).status()).toBe(200);
  });

  test("the removed scroll progress bar is gone", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".scroll-progress")).toHaveCount(0);
  });
});

test.describe("navigation", () => {
  test("desktop nav link scrolls the section clear of the fixed header", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.locator('.nav-link[href*="#coverage"]').first().click();
    await page.waitForTimeout(900);

    const { sectionTop, headerHeight } = await page.evaluate(() => {
      const inner = document
        .getElementById("coverage")!
        .querySelector(".section-inner")!;
      return {
        sectionTop: Math.round(inner.getBoundingClientRect().top),
        headerHeight: (
          document.querySelector(".site-header") as HTMLElement
        ).offsetHeight,
      };
    });
    // Content sits just below the header — never hidden under it, never a huge gap.
    expect(sectionTop).toBeGreaterThanOrEqual(headerHeight);
    expect(sectionTop).toBeLessThan(headerHeight + 80);
  });

  test("timeline cards are never horizontally displaced from their columns", async ({
    page,
  }) => {
    // Guards against reveal animations moving the cards with a transform: a
    // not-yet-triggered card would sit visibly shifted out of its column,
    // which broke the desktop timeline. Reveals must be opacity-only, so the
    // horizontal translate of every card must stay 0 — on load AND after
    // scrolling through the section.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const translateX = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".timeline-card")].map(
          (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
        ),
      );

    expect((await translateX()).every((x) => Math.abs(x) < 0.5)).toBe(true);

    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight * 0.4),
    );
    await page.waitForTimeout(1200);
    expect((await translateX()).every((x) => Math.abs(x) < 0.5)).toBe(true);
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test("closes when a nav link is tapped and scrolls to the section", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".menu-toggle").click();
    await expect(page.locator(".mobile-menu")).toHaveClass(/is-open/);

    await page
      .locator('.mobile-menu nav a[href*="#coverage"]')
      .first()
      .click();

    await expect(page.locator(".mobile-menu")).not.toHaveClass(/is-open/);
    // The eased scroll animation takes a few hundred ms to settle.
    await expect
      .poll(
        () => page.evaluate(() => window.scrollY),
        { timeout: 3000 },
      )
      .toBeGreaterThan(200);
  });

  test("the brands marquee ignores touch so it can't be stopped", async ({
    page,
  }) => {
    await page.goto("/");
    const pointerEvents = await page.evaluate(
      () => getComputedStyle(document.querySelector(".brand-track")!).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });
});

test.describe("landscape mobile menu", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("menu covers the screen without content spilling over the page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".menu-toggle").click();
    // Wait for the open transition (~0.42s) to settle before measuring.
    await expect(page.locator(".mobile-menu")).toHaveClass(/is-open/);
    await page.waitForTimeout(600);

    const { covers, linksInside } = await page.evaluate(() => {
      const menu = document.querySelector(".mobile-menu") as HTMLElement;
      const box = menu.getBoundingClientRect();
      const links = Array.from(menu.querySelectorAll("nav a"));
      return {
        // Fully covers the viewport (opaque panel, no page bleed-through).
        covers: box.top <= 0.5 && box.bottom >= window.innerHeight - 0.5,
        linksInside: links.every((a) => {
          const r = a.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight + 1;
        }),
      };
    });
    expect(covers).toBe(true);
    expect(linksInside).toBe(true);
  });
});
