import { defineConfig } from "@playwright/test";

const TV_PORT = 5199;
const PHONE_PORT = 5174;

export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "tv",
      testMatch: "tv/**/*.spec.ts",
      use: {
        baseURL: `http://127.0.0.1:${TV_PORT}`,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "phone",
      testMatch: "phone/**/*.spec.ts",
      use: {
        baseURL: `http://localhost:${PHONE_PORT}`,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --dir ../packages/desktop exec vite --config ../../e2e/vite.launcher.config.ts`,
      url: `http://127.0.0.1:${TV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --dir ../packages/remote exec vite --port ${PHONE_PORT} --strictPort`,
      url: `http://localhost:${PHONE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
