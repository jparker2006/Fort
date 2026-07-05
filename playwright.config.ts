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
  // Serial by design: the reference environment renders through swiftshader
  // (software WebGL), which is CPU bound, so extra browser workers thrash the
  // cores and slow the wall clock rather than shortening it. The consolidated
  // verification suite (npm run test:verify -> tests/verify.spec.ts) is the
  // sub-5-minute canonical run; the full per-ticket regression is exhaustive
  // and runs longer here (see the T21 note).
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
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--ignore-gpu-blocklist",
        // Keep requestAnimationFrame running at full rate in headless so the
        // real engine loop drives the game during tests.
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      ],
    },
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
