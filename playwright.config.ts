import { defineConfig, devices } from "@playwright/test";

const PORT = 4333;

/**
 * E2E tests run against the real production build (dist), served by
 * `astro preview`, so we test exactly what ships to users.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // One browser project; individual tests set their own viewport where the
  // layout matters (mobile menu, landscape), so behaviour isn't run against a
  // viewport where the element under test doesn't exist.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --host`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
