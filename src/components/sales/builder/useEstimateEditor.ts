"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { produce, type Draft } from "immer";

import type { SalesSeat } from "@/lib/sales/seat";
import type { EstimateBody, IssuedProposal, Opportunity, Presentation, SalesEstimate } from "@/lib/sales/types";

// The builder's working copy of one estimate. Every change is applied at once
// on screen (the math runs on each key) and saved a moment later; undo keeps
// the last 60 steps. On a job site with one bar of signal a save can fail: the
// copy is kept on the phone and sent again when the network is back, and a
// copy left there from a dropped session is offered on the next open.
//
// Two people editing at once: each save says which version it was made from,
// and the server refuses a save made from an older one (409) rather than
// overwrite the other person's work.

export type Loaded = {
  today: string;
  estimate: SalesEstimate;
  opportunity: Opportunity;
  proposals: IssuedProposal[];
  versions: Omit<SalesEstimate, "body">[];
  /** What this person may do (send = issue and email). */
  can?: SalesSeat["can"];
  /** The company defaults (Sales settings). */
  defaults?: { present: Presentation };
  emailDefaults?: { subject: string; body: string; link: boolean; attachPdf: boolean; fromName: string; fromAddress: string };
};

export type SaveState = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

const SAVE_DELAY_MS = 700;
const RETRY_MS = 5000;
const HISTORY = 60;
const localKey = (id: string) => `sw-estimate-${id}`;

type LocalCopy = { body: EstimateBody; name: string; base: string | null; at: string };

function readLocal(id: string): LocalCopy | null {
  try {
    const raw = window.localStorage.getItem(localKey(id));
    return raw ? (JSON.parse(raw) as LocalCopy) : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string, copy: LocalCopy | null) {
  try {
    if (copy) window.localStorage.setItem(localKey(id), JSON.stringify(copy));
    else window.localStorage.removeItem(localKey(id));
  } catch {
    // Private mode or full storage: the server save still runs.
  }
}

export function useEstimateEditor(estimateId: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState<EstimateBody | null>(null);
  const [name, setNameState] = useState("");
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [restore, setRestore] = useState<LocalCopy | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // The newest body and name, for saves that run outside a render.
  const latest = useRef<{ body: EstimateBody | null; name: string }>({ body: null, name: "" });
  // The updated_at this copy was made from (the server's conflict check).
  const base = useRef<string | null>(null);
  // Every edit bumps `edits`; a save records which edit it stored. flush()
  // resolves only once the newest edit is stored, or cannot be, so "Issue"
  // freezes exactly what is on screen.
  const edits = useRef(0);
  const savedEdit = useRef(0);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // History lives in refs (StrictMode runs state updaters twice).
  const past = useRef<EstimateBody[]>([]);
  const future = useRef<EstimateBody[]>([]);
  const lastPush = useRef(0);

  const syncHistory = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`/api/sales/estimates/${estimateId}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || `could not load (${res.status})`);
      const data = j as Loaded & { ok: true };
      setLoaded(data);
      setBody(data.estimate.body);
      setNameState(data.estimate.name);
      latest.current = { body: data.estimate.body, name: data.estimate.name };
      base.current = data.estimate.updatedAt;
      edits.current = 0;
      savedEdit.current = 0;
      past.current = [];
      future.current = [];
      syncHistory();
      setSave("saved");
      setSaveError("");
      const local = readLocal(estimateId);
      if (local && local.base === data.estimate.updatedAt && JSON.stringify(local.body) !== JSON.stringify(data.estimate.body)) {
        setRestore(local);
      } else if (local) {
        writeLocal(estimateId, null);
      }
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [estimateId, syncHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One PATCH. True when it stored the edit it was made from. */
  const saveOnce = useCallback(async (): Promise<boolean> => {
    const { body: b, name: n } = latest.current;
    if (!b) return false;
    const upTo = edits.current;
    setSave("saving");
    try {
      const res = await fetch(`/api/sales/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: b, expected: base.current, name: n }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setSave("conflict");
        setSaveError(j.error || "someone else saved this estimate");
        return false;
      }
      if (!res.ok || !j.ok) {
        setSave("error");
        setSaveError(j.error || `save failed (${res.status})`);
        return false;
      }
      base.current = j.updatedAt;
      savedEdit.current = upTo;
      setSaveError("");
      if (upTo === edits.current) {
        writeLocal(estimateId, null);
        setSave("saved");
      } else {
        setSave("dirty");
      }
      setLoaded((l) => (l ? { ...l, estimate: { ...l.estimate, updatedAt: j.updatedAt, sellCents: j.sellCents } } : l));
      return true;
    } catch {
      setSave("offline");
      return false;
    }
  }, [estimateId]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    for (;;) {
      while (running.current) await running.current;
      if (savedEdit.current >= edits.current) return;
      const attempt = saveOnce();
      running.current = attempt;
      let ok = false;
      try {
        ok = await attempt;
      } finally {
        running.current = null;
      }
      if (!ok) {
        // No network: keep it on the phone and try again shortly. A conflict
        // or a refusal waits for the person instead.
        if (!timer.current && typeof navigator !== "undefined" && !navigator.onLine) {
          timer.current = setTimeout(() => void flush(), RETRY_MS);
        }
        return;
      }
      // Edits made while that save was in the air go in the next round.
    }
  }, [saveOnce]);

  const schedule = useCallback(() => {
    edits.current += 1;
    setSave((s) => (s === "conflict" ? s : "dirty"));
    if (latest.current.body) writeLocal(estimateId, { body: latest.current.body, name: latest.current.name, base: base.current, at: new Date().toISOString() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [estimateId, flush]);

  /** Change the estimate. Typing in one field within a moment is one undo step. */
  const update = useCallback(
    (recipe: (d: Draft<EstimateBody>) => void, opts: { coalesce?: boolean } = {}) => {
      const prev = latest.current.body;
      if (!prev) return;
      const next = produce(prev, recipe);
      if (next === prev) return;
      const now = Date.now();
      if (!opts.coalesce || now - lastPush.current > 800) {
        past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      }
      lastPush.current = opts.coalesce ? now : 0;
      future.current = [];
      latest.current = { ...latest.current, body: next };
      setBody(next);
      syncHistory();
      schedule();
    },
    [schedule, syncHistory],
  );

  const setName = useCallback(
    (n: string) => {
      setNameState(n);
      latest.current = { ...latest.current, name: n };
      schedule();
    },
    [schedule],
  );

  const undo = useCallback(() => {
    const cur = latest.current.body;
    const target = past.current.at(-1);
    if (!cur || !target) return;
    past.current = past.current.slice(0, -1);
    future.current = [cur, ...future.current].slice(0, HISTORY);
    latest.current = { ...latest.current, body: target };
    lastPush.current = 0;
    setBody(target);
    syncHistory();
    schedule();
  }, [schedule, syncHistory]);

  const redo = useCallback(() => {
    const cur = latest.current.body;
    const target = future.current[0];
    if (!cur || !target) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, cur].slice(-HISTORY);
    latest.current = { ...latest.current, body: target };
    lastPush.current = 0;
    setBody(target);
    syncHistory();
    schedule();
  }, [schedule, syncHistory]);

  const acceptRestore = useCallback(() => {
    if (!restore) return;
    latest.current = { body: restore.body, name: restore.name };
    setBody(restore.body);
    setNameState(restore.name);
    setRestore(null);
    schedule();
  }, [restore, schedule]);

  const dismissRestore = useCallback(() => {
    writeLocal(estimateId, null);
    setRestore(null);
  }, [estimateId]);

  // Save on the way out, and when the network comes back.
  useEffect(() => {
    const out = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const online = () => void flush();
    document.addEventListener("visibilitychange", out);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", out);
      window.removeEventListener("online", online);
    };
  }, [flush]);

  // Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z on a keyboard; not while typing in a field (the field undoes itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return {
    loaded,
    loadError,
    reload: load,
    body,
    name,
    setName,
    update,
    undo,
    redo,
    canUndo,
    canRedo,
    save,
    saveError,
    saveNow: flush,
    restore,
    acceptRestore,
    dismissRestore,
  };
}
