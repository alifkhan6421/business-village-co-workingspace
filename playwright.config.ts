import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Tests read Supabase credentials from .env.local (service role is used only
// for fixtures and clean-up, never in the browser).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const baseURL = process.env.TEST_APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // The suites share one database (bookings, CMS content), so run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  // Start the app and the mock email API when they are not already running.
  webServer: process.env.TEST_APP_URL
    ? undefined
    : [
        { command: "node tests/mock-email-server.mjs", url: "http://127.0.0.1:4010/emails", reuseExistingServer: true },
        { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
      ],
});
