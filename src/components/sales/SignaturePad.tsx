"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";

import { SIGNATURE_FONTS, type SignatureFont } from "@/lib/sales/settings";
import { SIGNATURE_FAMILY, SIGNATURE_SCALE } from "./signatureFonts";

// A signature, drawn with a finger (or mouse, or pen) or typed in a script
// style the signer picks. Either way it ends as one PNG, trimmed to the ink,
// which is what the record keeps and what the page and the PDF show.

export type PadValue = { method: "draw" | "type"; typed?: string; font?: SignatureFont; image: string } | null;

const INK = "#1b2f6b";
const OUT_MAX_W = 640;
const OUT_MAX_H = 200;

/** Crop a canvas to its ink (with a margin) and scale it into the output box. */
function trimToPng(src: HTMLCanvasElement): string | null {
  const ctx = src.getContext("2d");
  if (!ctx) return null;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxX - minX < 6) return null;
  const pad = Math.round(Math.max(width, height) * 0.02) + 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const scale = Math.min(1, OUT_MAX_W / w, OUT_MAX_H / h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const o = out.getContext("2d");
  if (!o) return null;
  o.drawImage(src, minX, minY, w, h, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Size the drawing surface to the screen's pixels, once it has a width.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative rounded-xl border border-dashed border-[var(--color-stone-mid)] bg-white">
        <canvas
          ref={ref}
          aria-label="Draw your signature here"
          role="img"
          className="block h-40 w-full touch-none rounded-xl"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
            const ctx = ref.current?.getContext("2d");
            if (ctx && last.current) {
              ctx.beginPath();
              ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
              ctx.fillStyle = INK;
              ctx.fill();
            }
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = ref.current?.getContext("2d");
            if (!ctx) return;
            const p = point(e);
            // A pen pressing harder draws a bolder line; a finger gets a steady one.
            ctx.lineWidth = e.pointerType === "pen" && e.pressure > 0 ? 1.2 + e.pressure * 2.4 : 2.4;
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
            ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            if (empty) setEmpty(false);
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
            if (ref.current) onChange(trimToPng(ref.current));
          }}
          onPointerCancel={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
        {empty ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-sm text-[#9a938a]">Sign here with your finger or mouse</span>
        ) : null}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-[var(--color-stone-mid)]" />
      </div>
      <button type="button" onClick={clear} className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--color-charcoal-light)]">
        <Eraser className="size-3.5" aria-hidden="true" /> Clear
      </button>
    </div>
  );
}

/** Set a typed name in a font onto a canvas, once the font has loaded, and trim it. */
async function renderTyped(text: string, font: SignatureFont): Promise<string | null> {
  const family = SIGNATURE_FAMILY[font];
  const size = Math.round(72 * SIGNATURE_SCALE[font]);
  try {
    await document.fonts.load(`${size}px ${family}`, text);
  } catch {
    // Draw with whatever loaded; the picture shows what was used.
  }
  const c = document.createElement("canvas");
  c.width = 1400;
  c.height = 300;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  const scale = w > c.width - 80 ? (c.width - 80) / w : 1;
  ctx.save();
  ctx.translate(40, c.height / 2);
  ctx.scale(scale, scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return trimToPng(c);
}

function TypePad({
  name,
  fonts,
  onChange,
}: {
  name: string;
  fonts: SignatureFont[];
  onChange: (v: { typed: string; font: SignatureFont; image: string } | null) => void;
}) {
  const [text, setText] = useState(name);
  const [touched, setTouched] = useState(false);
  const [font, setFont] = useState<SignatureFont>(fonts[0] ?? "dancing");
  const shown = touched ? text : name;

  const emit = useCallback(
    async (t: string, f: SignatureFont) => {
      if (t.trim().length < 2) return onChange(null);
      const image = await renderTyped(t.trim(), f);
      onChange(image ? { typed: t.trim(), font: f, image } : null);
    },
    [onChange],
  );

  useEffect(() => {
    void emit(shown, font);
  }, [shown, font, emit]);

  const styles = SIGNATURE_FONTS.filter((f) => fonts.includes(f.key));
  return (
    <div className="space-y-2">
      <input
        value={shown}
        onChange={(e) => {
          setTouched(true);
          setText(e.target.value);
        }}
        aria-label="Type your signature"
        placeholder="Your name"
        className="w-full rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 py-2.5 text-base text-[var(--color-charcoal)] focus:border-[var(--color-teal)] focus:outline-none"
      />
      <div role="radiogroup" aria-label="Signature style" className="grid grid-cols-2 gap-2">
        {styles.map((f) => {
          const on = f.key === font;
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={f.label}
              onClick={() => setFont(f.key)}
              className={`flex h-16 items-center justify-center overflow-hidden rounded-xl border px-2 transition-colors ${on ? "border-[var(--color-teal)] bg-[var(--color-cream)] ring-1 ring-[var(--color-teal)]" : "border-[var(--color-stone-mid)] bg-white"}`}
            >
              <span className="truncate" style={{ fontFamily: SIGNATURE_FAMILY[f.key], fontSize: `${26 * SIGNATURE_SCALE[f.key]}px`, color: INK, lineHeight: 1.3 }}>
                {shown.trim() || "Your Name"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SignaturePad({ name, fonts, onChange }: { name: string; fonts: SignatureFont[]; onChange: (v: PadValue) => void }) {
  const [method, setMethod] = useState<"draw" | "type">("type");
  // Switching how they sign starts that way over; nothing from the other way is kept.
  const pick = (m: "draw" | "type") => {
    setMethod(m);
    onChange(null);
  };
  const onTyped = useCallback((v: { typed: string; font: SignatureFont; image: string } | null) => onChange(v ? { method: "type", ...v } : null), [onChange]);
  return (
    <div>
      <div role="tablist" aria-label="How to sign" className="mb-2 flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1">
        {(
          [
            ["type", "Type", Type],
            ["draw", "Draw", PenLine],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={method === k}
            onClick={() => pick(k)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ${method === k ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {method === "draw" ? <DrawPad onChange={(png) => onChange(png ? { method: "draw", image: png } : null)} /> : <TypePad name={name} fonts={fonts.length ? fonts : ["dancing"]} onChange={onTyped} />}
    </div>
  );
}
