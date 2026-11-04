// Run lock for the Playwright suite (T293): every worktree shares one local
// Supabase Postgres instance (127.0.0.1:55322), so two suites running at once
// step on each other's rows (e.g. joist-sync parking another run's queued jobs).
// globalSetup acquires an OS-atomic lock file keyed to the local DB host:port
// before any spec starts, waits (or fails when E2E_LOCK_NOWAIT=1) if another
// live PID holds it, reclaims stale locks left by SIGKILL, and releases on exit.

import { execSync } from "node:child_process";
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL_API = "http://127.0.0.1:55321";
const DEFAULT_DB_KEY = "127.0.0.1-55322";

export type LockHolder = {
  pid: number;
  cwd: string;
  base: string;
  db: string;
  startedAt: string;
};

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function localDbKey(): string {
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  if (env.API_URL !== LOCAL_API) {
    throw new Error(`refusing: the scenarios run only on this worktree's stack (${LOCAL_API}), not ${env.API_URL}`);
  }
  const m = (env.DB_URL ?? "").match(/@([^/]+)\//);
  return (m?.[1] ?? DEFAULT_DB_KEY).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function readHolder(lockPath: string): LockHolder | null {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockHolder>;
    return typeof parsed.pid === "number"
      ? {
          pid: parsed.pid,
          cwd: String(parsed.cwd ?? ""),
          base: String(parsed.base ?? ""),
          db: String(parsed.db ?? ""),
          startedAt: String(parsed.startedAt ?? ""),
        }
      : null;
  } catch {
    return null;
  }
}

export async function acquireRunLock(opts?: {
  lockPath?: string;
  dbKey?: string;
  pid?: number;
  cwd?: string;
  base?: string;
  waitMs?: number;
  pollMs?: number;
  alive?: (pid: number) => boolean;
}): Promise<() => void> {
  const dbKey = opts?.dbKey ?? localDbKey();
  const lockPath = opts?.lockPath ?? process.env.E2E_LOCK_FILE ?? join(tmpdir(), `saddlewood-e2e-${dbKey}.lock`);
  const pid = opts?.pid ?? process.pid;
  const cwd = opts?.cwd ?? process.cwd();
  const base = opts?.base ?? process.env.BASE ?? "http://localhost:3100";
  const waitMs =
    opts?.waitMs ??
    (process.env.E2E_LOCK_NOWAIT === "1" ? 0 : Number(process.env.E2E_LOCK_WAIT_MS ?? 10 * 60 * 1000));
  const pollMs = opts?.pollMs ?? 500;
  const alive = opts?.alive ?? isPidAlive;

  const deadline = Date.now() + Math.max(0, waitMs);
  let loggedWait = false;

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        const payload: LockHolder = { pid, cwd, base, db: dbKey, startedAt: new Date().toISOString() };
        writeFileSync(fd, JSON.stringify(payload), "utf8");
      } finally {
        closeSync(fd);
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const holder = readHolder(lockPath);
      if (!holder || !alive(holder.pid)) {
        try {
          unlinkSync(lockPath);
        } catch {
          // Another process already removed or replaced it; retry.
        }
        continue;
      }
      if (holder.pid === pid) break;
      if (Date.now() >= deadline) {
        throw new Error(
          `Another Playwright suite holds the local DB lock (${dbKey}): pid ${holder.pid} in ${holder.cwd} (${holder.base}, started ${holder.startedAt}).`,
        );
      }
      if (!loggedWait) {
        console.log(`[e2e lock] waiting for pid ${holder.pid} (${holder.cwd}) on ${dbKey}…`);
        loggedWait = true;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = readHolder(lockPath);
      if (!current || current.pid === pid) unlinkSync(lockPath);
    } catch {
      // Already gone.
    }
  };
  process.once("exit", release);
  return release;
}

export default async function globalSetup(): Promise<() => void> {
  return acquireRunLock();
}
