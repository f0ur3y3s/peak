import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the real app in a real browser, driven like a lifter on a
// phone. Each test gets a fresh browser context, so a fresh IndexedDB seeded
// with the training program — no test depends on another's leftovers.
//
// Runs against the dev server in LOCAL_PREVIEW mode (no Supabase needed; see
// .env.example). `npm run test:e2e`, or `npx playwright test --ui` to watch.
const PORT = 5174;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Where a browser is preinstalled outside Playwright's cache (as in some
    // sandboxes), point at it instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    // The app's real target: a phone. Chromium with iPhone metrics rather
    // than WebKit, so CI needs one browser.
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testIgnore: /desktop/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /desktop/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_LOCAL_PREVIEW: "1",
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "placeholder-anon-key",
      VITE_VAPID_PUBLIC_KEY: "",
    },
  },
});
