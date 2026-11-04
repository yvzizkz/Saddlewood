import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { acquireRunLock } from "../../e2e/support/globalSetup";

describe("e2e globalSetup run lock", () => {
  const dirs: string[] = [];
  const tempLock = () => {
    const dir = mkdtempSync(join(tmpdir(), "sw-e2e-lock-"));
    dirs.push(dir);
    return join(dir, "e2e.lock");
  };

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("acquires the lock file and removes it when released", async () => {
    const lockPath = tempLock();
    const release = await acquireRunLock({ lockPath, dbKey: "127.0.0.1-55322", pid: 1001, alive: () => true });
    expect(existsSync(lockPath)).toBe(true);
    release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("refuses immediately when another live PID holds the lock and waitMs is 0", async () => {
    const lockPath = tempLock();
    const release = await acquireRunLock({
      lockPath,
      dbKey: "127.0.0.1-55322",
      pid: 1001,
      cwd: "/worktree-a",
      base: "http://localhost:3107",
      alive: () => true,
    });
    try {
      await expect(
        acquireRunLock({
          lockPath,
          dbKey: "127.0.0.1-55322",
          pid: 2002,
          cwd: "/worktree-b",
          waitMs: 0,
          alive: () => true,
        }),
      ).rejects.toThrow(/Another Playwright suite holds the local DB lock \(127\.0\.0\.1-55322\): pid 1001 in \/worktree-a/);
    } finally {
      release();
    }
  });

  it("waits until the holding suite releases the lock, then acquires it", async () => {
    const lockPath = tempLock();
    const release1 = await acquireRunLock({ lockPath, dbKey: "127.0.0.1-55322", pid: 1001, alive: () => true });
    setTimeout(() => release1(), 60);
    const release2 = await acquireRunLock({
      lockPath,
      dbKey: "127.0.0.1-55322",
      pid: 2002,
      waitMs: 1_000,
      pollMs: 20,
      alive: () => true,
    });
    expect(existsSync(lockPath)).toBe(true);
    release2();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("reclaims a stale lock file left behind by a dead PID", async () => {
    const lockPath = tempLock();
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999, cwd: "/dead-worktree", base: "http://localhost:3100", db: "127.0.0.1-55322", startedAt: "2026-11-03T00:00:00Z" }),
      "utf8",
    );
    const release = await acquireRunLock({
      lockPath,
      dbKey: "127.0.0.1-55322",
      pid: 3003,
      waitMs: 0,
      alive: (p) => p === 3003,
    });
    expect(existsSync(lockPath)).toBe(true);
    release();
    expect(existsSync(lockPath)).toBe(false);
  });
});
