"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { ReviewBatch, ReviewItem } from "@/lib/reviewData";

type Sent = { decision: string; comment?: string; files?: number };
type Att = { name: string; type: string; b64: string; bytes: number; url: string };

const MAX_FILES = 4;
// Must stay under the server's decoded ceiling, which is itself set by
// Vercel's 4.5 MB request-body limit. Anything larger has to go by email.
const MAX_TOTAL_BYTES = 3_000_000;
const MAX_EDGE = 1600; // a 1600px long edge is plenty to read a job-site detail

function b64(buf: ArrayBuffer) {
  // Chunked: String.fromCharCode(...wholeArray) overflows the call stack on a
  // multi-megabyte photo, which on a phone reads as "the button did nothing".
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Shrink a photo in the browser. A modern phone camera file is 3-5 MB, which
 *  a single one of would blow the request budget; re-encoding also turns iOS
 *  HEIC into a JPEG anyone can open. Non-images and failures pass through. */
async function prepare(file: File): Promise<Att> {
  const raw = async (): Promise<Att> => ({
    name: file.name,
    type: file.type || "application/octet-stream",
    b64: b64(await file.arrayBuffer()),
    bytes: file.size,
    url: URL.createObjectURL(file),
  });
  if (!file.type.startsWith("image/")) return raw();
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return raw();
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) =>
      c.toBlob(r, "image/jpeg", 0.72),
    );
    if (!blob) return raw();
    return {
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      type: "image/jpeg",
      b64: b64(await blob.arrayBuffer()),
      bytes: blob.size,
      url: URL.createObjectURL(blob),
    };
  } catch {
    return raw();
  }
}

export function ReviewClient({ batch, token }: { batch: ReviewBatch; token: string }) {
  const [sent, setSent] = useState<Record<string, Sent>>({});
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atts, setAtts] = useState<Record<string, Att[]>>({});
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});

  const done = Object.keys(sent).length;
  const total = batch.items.length;

  async function addFiles(itemId: string, list: FileList | null) {
    if (!list?.length) return;
    setBusy(itemId);
    setError(null);
    try {
      const have = atts[itemId] || [];
      const room = MAX_FILES - have.length;
      if (room <= 0) {
        setError(`You can attach up to ${MAX_FILES} files per item.`);
        return;
      }
      const prepared = await Promise.all(
        Array.from(list).slice(0, room).map(prepare),
      );
      // Take what fits rather than refusing the batch. Rejecting four photos
      // because the fourth is oversized loses three that were fine.
      const next = [...have];
      let bytes = have.reduce((n, a) => n + a.bytes, 0);
      const rejected: string[] = [];
      for (const p of prepared) {
        if (bytes + p.bytes > MAX_TOTAL_BYTES) {
          rejected.push(p.name);
          URL.revokeObjectURL(p.url);
          continue;
        }
        bytes += p.bytes;
        next.push(p);
      }
      setAtts((a) => ({ ...a, [itemId]: next }));
      const overflow = list.length - room;
      if (rejected.length || overflow > 0) {
        const parts = [];
        if (rejected.length) parts.push(`${rejected.join(", ")} too large`);
        if (overflow > 0) parts.push(`${MAX_FILES} files max`);
        setError(
          `Not everything fit (${parts.join("; ")}). What you see below will ` +
            `send. For the rest, reply to the email and attach them there — ` +
            `that path has no size limit.`,
        );
      }
    } catch {
      setError("Couldn't read those files. Try one at a time.");
    } finally {
      setBusy(null);
      const el = pickers.current[itemId];
      // Clear it, or picking the same photo twice in a row fires no change event.
      if (el) el.value = "";
    }
  }

  function removeFile(itemId: string, idx: number) {
    setAtts((a) => {
      const list = [...(a[itemId] || [])];
      const [gone] = list.splice(idx, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return { ...a, [itemId]: list };
    });
  }

  async function submit(item: ReviewItem, decision: string, comment?: string) {
    setBusy(item.id);
    setError(null);
    const files = atts[item.id] || [];
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k: token,
          batch: batch.id,
          item: item.id,
          itemTitle: item.title,
          decision,
          comment: comment || "",
          files: files.map((f) => ({ name: f.name, type: f.type, b64: f.b64 })),
        }),
      });
      if (res.status === 413) {
        // Say which half failed. "Saved" with the photo missing is the one
        // outcome that would quietly lose information.
        setError(
          "Your answer was NOT saved — the files are too large for this page. " +
            "Remove one, or reply to the email with them attached.",
        );
        return;
      }
      if (!res.ok) throw new Error("send failed");
      setSent((s) => ({
        ...s,
        [item.id]: { decision, comment, files: files.length },
      }));
      setOpenNote((o) => ({ ...o, [item.id]: false }));
    } catch {
      setError("That didn't save. Check your connection and tap again.");
    } finally {
      setBusy(null);
    }
  }

  const btnBase =
    "flex-1 min-w-[92px] py-3.5 text-[13px] font-semibold tracking-wide rounded-lg transition-colors disabled:opacity-40";

  return (
    <div className="max-w-[640px] mx-auto px-4 pb-24">
      {/* sticky progress */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#1a2f2f] flex items-center justify-between">
        <span className="text-white text-[13px] tracking-[3px]">SADDLEWOOD</span>
        <span className="text-[#c8a55a] text-[13px] font-semibold">
          {done} of {total} answered
        </span>
      </div>

      <div className="pt-6 pb-2">
        <h1 className="font-heading text-[26px] leading-tight text-[#1a2f2f] font-medium">
          {batch.title}
        </h1>
        <p className="text-[14px] text-[#5A5A5A] leading-relaxed mt-2">{batch.intro}</p>
      </div>

      {error && (
        <div className="my-3 p-3 bg-red-50 border border-red-200 text-red-800 text-[13px] rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-5 mt-4">
        {batch.items.map((item) => {
          const answer = sent[item.id];
          return (
            <section
              key={item.id}
              className={`bg-white rounded-xl border ${
                answer ? "border-[#3d6b4f]" : "border-[#e2dbd0]"
              } overflow-hidden`}
            >
              <div className="p-5">
                <h2 className="font-heading text-[18px] text-[#1a2f2f] font-medium leading-snug">
                  {item.title}
                </h2>
                <p className="text-[14px] text-[#2c2926]/80 leading-relaxed mt-2">
                  {item.summary}
                </p>
                {item.detail && (
                  <details className="mt-3">
                    <summary className="text-[13px] text-[#8B6914] font-semibold cursor-pointer">
                      Read the full text
                    </summary>
                    <div className="mt-2 space-y-2">
                      {item.detail.map((d, i) => (
                        <p
                          key={i}
                          className="text-[13px] text-[#2c2926]/75 leading-relaxed bg-[#f5f0e8] border-l-2 border-[#c8a55a] p-3 rounded-r-lg"
                        >
                          {d}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {item.images && (
                <div className="px-5 pb-4 space-y-4">
                  {item.images.map((img) => (
                    <figure key={img.src}>
                      <a href={img.src} target="_blank" rel="noreferrer">
                        <Image
                          src={img.src}
                          alt={img.caption}
                          width={1200}
                          height={900}
                          className="w-full rounded-lg border border-[#e2dbd0]"
                        />
                      </a>
                      <figcaption className="text-[12px] text-[#5A5A5A] mt-1.5">
                        {img.caption} <span className="text-[#8B6914]">Tap to zoom.</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}

              <div className="p-5 pt-2 border-t border-[#f0ebe1]">
                {answer ? (
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-[#3d6b4f]">
                    <span className="inline-flex w-5 h-5 rounded-full bg-[#3d6b4f] text-white items-center justify-center text-[12px]">
                      ✓
                    </span>
                    Saved: {answer.decision}
                    {answer.comment ? (
                      <span className="text-[#5A5A5A] font-normal truncate">
                        “{answer.comment}”
                      </span>
                    ) : null}
                    {answer.files ? (
                      <span className="text-[#5A5A5A] font-normal whitespace-nowrap">
                        + {answer.files} file{answer.files > 1 ? "s" : ""}
                      </span>
                    ) : null}
                    <button
                      className="ml-auto text-[12px] text-[#8B6914] underline"
                      onClick={() => setSent((s) => {
                        const n = { ...s };
                        delete n[item.id];
                        return n;
                      })}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <input
                        ref={(el) => {
                          pickers.current[item.id] = el;
                        }}
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.txt"
                        className="hidden"
                        onChange={(e) => addFiles(item.id, e.target.files)}
                      />
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => pickers.current[item.id]?.click()}
                        className="text-[13px] font-semibold text-[#8B6914] underline disabled:opacity-40"
                      >
                        + Add photos or a file
                      </button>
                      <span className="text-[12px] text-[#5A5A5A] ml-2">
                        optional — they go with your answer
                      </span>

                      {(atts[item.id] || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {(atts[item.id] || []).map((a, i) => (
                            <div
                              key={`${a.name}-${i}`}
                              className="relative w-[72px]"
                            >
                              {a.type.startsWith("image/") ? (
                                // Blob URL of a file the owner just picked;
                                // next/image would want a remote loader.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={a.url}
                                  alt={a.name}
                                  className="w-[72px] h-[72px] object-cover rounded-lg border border-[#e2dbd0]"
                                />
                              ) : (
                                <div className="w-[72px] h-[72px] rounded-lg border border-[#e2dbd0] bg-[#f5f0e8] flex items-center justify-center text-[10px] text-[#5A5A5A] px-1 text-center break-all">
                                  {a.name.slice(-14)}
                                </div>
                              )}
                              <button
                                type="button"
                                aria-label={`Remove ${a.name}`}
                                onClick={() => removeFile(item.id, i)}
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#8f3b2d] text-white text-[13px] leading-none"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {item.kind === "choice" && item.options ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        {item.options.map((o) => (
                          <button
                            key={o.key}
                            disabled={busy === item.id}
                            onClick={() => submit(item, `Chose ${o.label}`)}
                            className="py-3.5 px-3 rounded-lg bg-[#1a2f2f] text-white text-left disabled:opacity-40"
                          >
                            <span className="block text-[13px] font-semibold">{o.label}</span>
                            <span className="block text-[11px] text-white/60 mt-0.5">
                              {o.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-2.5">
                        <button
                          disabled={busy === item.id}
                          onClick={() => submit(item, "Approved")}
                          className={`${btnBase} bg-[#3d6b4f] text-white`}
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy === item.id}
                          onClick={() => submit(item, "Rejected")}
                          className={`${btnBase} bg-[#8f3b2d] text-white`}
                        >
                          Reject
                        </button>
                        <button
                          disabled={busy === item.id}
                          onClick={() =>
                            setOpenNote((o) => ({ ...o, [item.id]: !o[item.id] }))
                          }
                          className={`${btnBase} bg-[#ede6d8] text-[#1a2f2f]`}
                        >
                          Changes
                        </button>
                      </div>
                    )}

                    {(openNote[item.id] || item.kind === "choice") && (
                      <div className="mt-3">
                        <textarea
                          value={notes[item.id] || ""}
                          onChange={(e) =>
                            setNotes((n) => ({ ...n, [item.id]: e.target.value }))
                          }
                          placeholder={
                            item.kind === "choice"
                              ? "Optional note, for example: B stamp on A colors"
                              : "Tell us what to change"
                          }
                          rows={3}
                          className="w-full rounded-lg border border-[#d9d0c3] p-3 text-[14px] focus:outline-none focus:border-[#c8a55a]"
                        />
                        {item.kind !== "choice" && (
                          <button
                            disabled={busy === item.id || !(notes[item.id] || "").trim()}
                            onClick={() =>
                              submit(item, "Changes requested", notes[item.id])
                            }
                            className="mt-2 w-full py-3.5 rounded-lg bg-[#c8a55a] text-[#1a2f2f] text-[13px] font-bold disabled:opacity-40"
                          >
                            Send my changes
                          </button>
                        )}
                        {item.kind === "choice" && (notes[item.id] || "").trim() && (
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              submit(item, "Note only", notes[item.id])
                            }
                            className="mt-2 w-full py-3 rounded-lg bg-[#ede6d8] text-[#1a2f2f] text-[13px] font-semibold"
                          >
                            Send note without choosing
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        {done === total ? (
          <p className="text-[15px] font-semibold text-[#3d6b4f]">
            All done. Thank you. Everything you approved starts moving today.
          </p>
        ) : (
          <p className="text-[13px] text-[#5A5A5A]">
            Answers save one at a time. You can close this page and come back with the
            same link.
          </p>
        )}
      </div>
    </div>
  );
}
