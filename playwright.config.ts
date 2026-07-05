import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Chromium is provided by the environment under PLAYWRIGHT_BROWSERS_PATH
// (/opt/pw-browsers) at a version that may not match the @playwright/test
// package's expected build. Point directly at the installed full Chromium
// binary so headless launch works; fall back to Playwright auto-discovery if
// the path is absent (e.g. a developer machine with a matching install).
function resolveChromium(): string | undefined {
  const candidates = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ];
  return candidates.find((p) => existsSync(p));
}

const executablePath = resolveChromium();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "test-results/output",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    screenshot: "off",
    trace: "off",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
