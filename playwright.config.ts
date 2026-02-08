import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      AUTH_BYPASS: "1",
      NEXT_PUBLIC_AUTH_BYPASS: "1",
      E2E_TEST_MODE: "1",
      NEXTAUTH_URL: "http://127.0.0.1:3000",
      NEXTAUTH_SECRET: "e2e-test-secret",
      INGEST_HMAC_SALT: "e2e-test-salt",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
