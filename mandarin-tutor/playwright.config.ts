import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PORT = 3200;
const DB = "file:./e2e.db";

export default defineConfig({
  testDir: "tests/e2e",
  // Keep artifacts outside the project: files written inside it make `next dev` hot-reload mid-test.
  outputDir: path.join(os.tmpdir(), "mandarin-tutor-e2e"),
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    permissions: ["microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: `node tests/e2e/reset-db.mjs && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { DATABASE_URL: DB, ADMIN_EMAIL: "learner@example.com", LOGIN_RATE_LIMIT_PER_HOUR: "1000", E2E_EXPOSE_LOGIN_LINKS: "1", INSECURE_COOKIES: "1" },
  },
});
