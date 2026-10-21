import { defineConfig, devices } from "@playwright/test";

// Phase 3 scenarios (docs/SCENARIOS.md): each department's real week, driven
// through the app on this worktree's own local stack. Start the stack and
// `npm run dev -- -p 3100` first; e2e/support/env.ts refuses any Supabase but
// 127.0.0.1:55321.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE ?? "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
