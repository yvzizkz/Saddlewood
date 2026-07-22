"use client";

import { useState } from "react";

const ROLES = [
  "Estimating & Sales Admin",
  "Bookkeeper (Part-Time)",
  "Framing Carpenter / Carpintero",
  "Other",
];

const inputCls =
  "w-full bg-white border border-stone px-4 py-3 text-[14px] text-charcoal font-light focus:outline-none focus:border-gold transition-colors";
const labelCls =
  "block text-[11px] tracking-[0.12em] uppercase text-teal-dark font-medium mb-1.5";

export function CareersForm({ defaultRole }: { defaultRole?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/careers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setState("done");
        form.reset();
      } else {
        setState("error");
        setError(json.error || "Something went wrong — please try again.");
      }
    } catch {
      setState("error");
      setError("Something went wrong — please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="bg-white border border-gold p-8 text-center">
        <p className="font-heading text-xl text-teal-dark mb-2">Application received.</p>
        <p className="text-[14px] text-charcoal/70 font-light leading-relaxed">
          Thank you — a member of the team will get back to you. If you have a resume,
          reply to our email when it arrives, or send it to{" "}
          <a href="mailto:info@saddlewoodcontracting.com" className="text-teal underline">
            info@saddlewoodcontracting.com
          </a>
          . / Gracias — el equipo se comunicará contigo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="bg-white border border-stone p-7 sm:p-9">
      <h2 className="font-heading text-2xl text-teal-dark font-medium mb-1">Apply now</h2>
      <p className="text-[13px] text-charcoal/60 font-light mb-6">
        Two minutes, no resume required to start — we&apos;ll ask for one when we reply.
        / Dos minutos, sin currículum para empezar.
      </p>

      {/* Honeypot — hidden from humans, dropped server-side when filled. */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <label htmlFor="role" className={labelCls}>Role / Puesto *</label>
          <select id="role" name="role" required defaultValue={defaultRole || ""} className={inputCls}>
            <option value="" disabled>Select a role…</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="name" className={labelCls}>Full name / Nombre *</label>
          <input id="name" name="name" required autoComplete="name" className={inputCls} />
        </div>
        <div>
          <label htmlFor="city" className={labelCls}>City / Ciudad</label>
          <input id="city" name="city" autoComplete="address-level2" placeholder="e.g. Phoenix" className={inputCls} />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className={inputCls} />
        </div>
        <div>
          <label htmlFor="phone" className={labelCls}>Phone / Teléfono</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputCls} />
        </div>
        <div>
          <label htmlFor="salary" className={labelCls}>Salary or hourly expectation / Sueldo esperado</label>
          <input id="salary" name="salary" placeholder="e.g. $28/hr or $65K" className={inputCls} />
        </div>
        <div>
          <label htmlFor="startDate" className={labelCls}>Earliest start / Fecha de inicio</label>
          <input id="startDate" name="startDate" placeholder="e.g. two weeks, Aug 1" className={inputCls} />
        </div>
        <div>
          <label htmlFor="experience" className={labelCls}>Years of experience / Años de experiencia</label>
          <input id="experience" name="experience" placeholder="e.g. 6 years framing custom homes" className={inputCls} />
        </div>
        <div>
          <label htmlFor="languages" className={labelCls}>Languages / Idiomas</label>
          <select id="languages" name="languages" className={inputCls} defaultValue="">
            <option value="" disabled>Select…</option>
            <option>English</option>
            <option>Español</option>
            <option>Both / Ambos</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="heardFrom" className={labelCls}>How did you hear about us? / ¿Cómo supiste de nosotros?</label>
          <input id="heardFrom" name="heardFrom" placeholder="e.g. Google, a friend, Indeed" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="message" className={labelCls}>Anything else? / ¿Algo más? (optional)</label>
          <textarea id="message" name="message" rows={3} className={inputCls} />
        </div>
      </div>

      {state === "error" ? (
        <p className="mt-4 text-[13px] text-[#8f3b2d]">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-7 px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase hover:bg-[#d4a94c] transition-all disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Submit application / Enviar"}
      </button>
    </form>
  );
}
