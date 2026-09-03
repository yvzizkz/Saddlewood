"use client";

/**
 * Engagement planner — "find your path" (owner ask, 2026-08-31: "an easy
 * tool for users that presents this to them, maybe in the contact form").
 *
 * Three answers in, one path out. The visitor says who they are and where
 * their project stands; the tool answers with the Saddlewood engagement
 * model tailored to them — consultation, then the paid preconstruction
 * phase (the Cory/Minima system: fee quoted at consultation, credited in
 * part or in full toward construction), then contract, then build — and
 * takes the lead right there.
 *
 * Three lanes, three doors:
 *   homeowner → tailored path + lead form (role: "homeowner")
 *   builder   → bid-request form with scopes and a plans link (role: "builder")
 *   trade     → routed to the bid list at /trade-partners
 *
 * The fee amount is deliberately not published; the structure is. Submits
 * to /api/contact with lane-specific tags so GHL can pipeline homeowner
 * leads and builder bids separately.
 */

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const EASE = [0.22, 1, 0.36, 1] as const;

type Audience = "homeowner" | "builder" | "trade" | "direct";

const projectTypes = [
  "New construction",
  "Whole-home remodel",
  "Kitchen or bath",
  "Addition or structural",
  "Outdoor living",
];

const planStates = [
  {
    value: "Permitted plans in hand",
    path: "Your set is bid-ready. Preconstruction moves straight to trade pricing on your drawings, so the budget you sign is built from real numbers.",
  },
  {
    value: "In design now",
    path: "We join the design as it develops, pricing each revision so the drawings and the budget land together instead of surprising each other.",
  },
  {
    value: "No plans yet",
    path: "Preconstruction starts before a sheet is drawn: feasibility, budget targets, and introductions to design teams we trust.",
  },
];

const budgetRanges = [
  "Under $100k",
  "$100k - $250k",
  "$250k - $500k",
  "$500k - $1M",
  "$1M+",
  "Not sure yet",
];

const builderScopes = [
  "Rough carpentry & framing",
  "Wood framing",
  "Structural concrete",
  "Specialty ceilings & millwork",
  "Stucco / roofing",
  "Electrical",
  "Plumbing",
  "HVAC",
];

const inputCls =
  "w-full border border-off-white/25 bg-teal-dark/60 px-4 py-3 text-[15px] font-light text-off-white outline-none transition-colors placeholder:text-off-white/40 focus:border-gold";
const labelCls =
  "block font-mono text-[10.5px] uppercase tracking-[0.18em] text-off-white/60 mb-2.5";

/** Option tile shared by every choice step. */
function Tile({
  active,
  onClick,
  children,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full border px-5 py-4 text-left transition-colors ${
        active
          ? "border-gold bg-gold/[0.08]"
          : "border-off-white/[0.18] bg-teal-dark/40 hover:border-gold/60"
      }`}
    >
      <span className="block font-heading text-[17px] font-medium leading-[1.3] text-off-white">
        {children}
      </span>
      {sub ? (
        <span className="mt-1 block text-[13px] leading-[1.6] text-off-white/[0.55]">
          {sub}
        </span>
      ) : null}
    </button>
  );
}

/** The four-step path, with the preconstruction line tailored to the answers. */
function PathLedger({ preconLine }: { preconLine: string }) {
  const steps = [
    {
      n: "01",
      t: "Consultation",
      d: "We walk the property, hear the vision, and tell you plainly whether it's a project for us.",
    },
    { n: "02", t: "Preconstruction", d: preconLine },
    {
      n: "03",
      t: "The contract",
      d: "A construction agreement built on developed numbers, not guesses. When plans refine, the numbers refine with them, and you see how.",
    },
    {
      n: "04",
      t: "The build",
      d: "One crew, four licenses, one point of contact from chalk line to closeout.",
    },
  ];
  return (
    <ol className="m-0 list-none space-y-5 border-l border-gold/30 p-0 pl-6">
      {steps.map((s) => (
        <li key={s.n}>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[11px] tracking-[0.2em] text-gold tabular-nums">
              {s.n}
            </span>
            <span className="font-heading text-[18px] font-medium text-off-white">
              {s.t}
            </span>
          </div>
          <p className="mt-1 max-w-[54ch] text-[13.5px] leading-[1.7] text-off-white/[0.65]">
            {s.d}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function EngagementPlanner({ embedded = false }: { embedded?: boolean } = {}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [audience, setAudience] = useState<Audience | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  // Homeowner answers
  const [projectType, setProjectType] = useState("");
  const [plans, setPlans] = useState<(typeof planStates)[number] | null>(null);
  const [budget, setBudget] = useState("");
  // Builder answers
  const [scopes, setScopes] = useState<string[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [plansLink, setPlansLink] = useState("");
  const [bidDue, setBidDue] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  // Shared contact fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  // Honeypot — same server-side rule as the classic form.
  const [company, setCompany] = useState("");

  const reset = () => {
    setAudience(null);
    setStep(0);
    setStatus("idle");
  };

  const submit = async () => {
    setStatus("submitting");
    const isBuilder = audience === "builder";
    const isDirect = audience === "direct";
    const payload = {
      firstName: name.split(" ")[0] || name,
      lastName: name.split(" ").slice(1).join(" ") || "",
      name,
      email,
      phone,
      role: audience ?? "homeowner",
      projectType: isBuilder ? "Builder bid request" : isDirect ? "Direct inquiry" : projectType,
      plansStatus: isBuilder || isDirect ? undefined : plans?.value,
      budget: isBuilder || isDirect ? undefined : budget,
      scopes: isBuilder ? scopes : undefined,
      businessName: isBuilder ? businessName : undefined,
      plansLink: isBuilder ? plansLink : undefined,
      bidDue: isBuilder ? bidDue : undefined,
      projectLocation: isBuilder ? projectLocation : undefined,
      message,
      source: "Engagement Planner",
      tags: [
        isBuilder ? "builder-bid" : isDirect ? "direct-inquiry" : "website-lead",
        "engagement-planner",
        isBuilder || isDirect ? undefined : projectType,
        isBuilder || isDirect ? undefined : budget,
      ].filter(Boolean),
      company,
    };
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  const stepAnim = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.5, ease: EASE },
      };

  const back = () => {
    if (step === 0) setAudience(null);
    else setStep(step - 1);
  };

  const contactFields = (
    <div className="space-y-5">
      {/* Honeypot — humans never see it; bots that fill it are dropped. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label htmlFor="planner-company">Company (leave this field empty)</label>
        <input
          id="planner-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="planner-name" className={labelCls}>
            Full name
          </label>
          <input
            id="planner-name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="planner-email" className={labelCls}>
            Email
          </label>
          <input
            id="planner-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={audience === "direct" ? "sm:col-span-2" : ""}>
          <label htmlFor="planner-phone" className={labelCls}>
            Phone {audience === "direct" ? <span className="text-off-white/40">(optional)</span> : null}
          </label>
          <input
            id="planner-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
            placeholder="(480) 555-0123"
          />
        </div>
        {audience !== "direct" ? (
          <div>
            <label htmlFor="planner-message" className={labelCls}>
              Anything else
            </label>
            <input
              id="planner-message"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={inputCls}
              placeholder="Optional notes or timeline"
            />
          </div>
        ) : null}
      </div>
      {audience === "direct" ? (
        <div>
          <label htmlFor="planner-message-direct" className={labelCls}>
            How can we help?
          </label>
          <textarea
            id="planner-message-direct"
            rows={4}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="Tell us about your project, timeline, or general questions..."
          />
        </div>
      ) : null}
      <label className="flex cursor-pointer items-start gap-3 text-[12.5px] leading-relaxed text-off-white/60">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-gold"
        />
        <span>
          I consent to being contacted by Saddlewood Contracting about my
          inquiry. See the{" "}
          <Link href="/privacy" className="text-off-white/80 underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {status === "error" ? (
        <p className="border border-red-400/40 bg-red-950/30 p-3 text-[13px] text-red-200">
          Something went wrong. Please try again or call (480) 999-6100.
        </p>
      ) : null}
      <button
        type="button"
        disabled={
          status === "submitting" ||
          !name ||
          !email ||
          !consent ||
          (audience === "direct" && !message.trim())
        }
        onClick={submit}
        className="inline-flex items-center gap-2 rounded-[2px] bg-gold px-[30px] py-[14px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark transition-all hover:-translate-y-px hover:bg-[#d4a94c] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending
          </>
        ) : audience === "builder" ? (
          "Send bid request"
        ) : audience === "direct" ? (
          "Send message"
        ) : (
          "Request my consultation"
        )}
      </button>
    </div>
  );

  const content = (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-[880px] px-5 sm:px-8"}>
      <span className="section-label !mb-0">
        {audience === "direct" ? "Direct Inquiry" : "Find Your Path"}
      </span>
      <h2 className="mt-5 max-w-[24ch] font-heading text-[clamp(28px,3.4vw,44px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
        {audience === "direct"
          ? "Drop us a note. We reply within 24 hours."
          : "Three answers. Then we show you exactly how this works."}
      </h2>

      <div className="mt-10 min-h-[320px]">
        <AnimatePresence mode="wait">
          {/* ---- Success ---- */}
          {status === "success" ? (
            <motion.div key="done" {...stepAnim} role="status" aria-live="polite">
              <p className="font-heading text-[26px] font-medium text-gold">
                Received.
              </p>
              <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.8] text-off-white/70">
                {audience === "builder"
                  ? "Your bid request is in front of us. We review the plans and come back with a real number, fast."
                  : audience === "direct"
                  ? "Your note is in front of our team. We review every message and reply within one business day."
                  : "We'll be in touch within one business day to schedule your consultation."}
              </p>
            </motion.div>
          ) : audience === null ? (
            /* ---- Step: audience ---- */
            <motion.div key="aud" {...stepAnim}>
              <p className={labelCls}>To start: who are we talking to?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tile
                  active={false}
                  onClick={() => {
                    setAudience("homeowner");
                    setStep(0);
                  }}
                  sub="A home to build or transform"
                >
                  A homeowner
                </Tile>
                <Tile
                  active={false}
                  onClick={() => {
                    setAudience("builder");
                    setStep(0);
                  }}
                  sub="A GC or builder with a scope to bid"
                >
                  A builder
                </Tile>
                <Tile
                  active={false}
                  onClick={() => setAudience("trade")}
                  sub="A sub or vendor who wants our plans"
                >
                  A trade partner
                </Tile>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-off-white/[0.1] pt-5">
                <span className="text-[13px] text-off-white/60">
                  Have a general question or prefer to write directly?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAudience("direct");
                    setStep(0);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.16em] text-gold transition-colors hover:text-off-white"
                >
                  Send a direct note
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          ) : audience === "direct" ? (
            /* ---- Direct inquiry lane ---- */
            <motion.div key="direct" {...stepAnim}>
              <p className={labelCls}>Direct inquiry · Send a message directly to our team</p>
              <div className="mt-6">
                {contactFields}
              </div>
            </motion.div>
            ) : audience === "trade" ? (
              /* ---- Trade: route out ---- */
              <motion.div key="trade" {...stepAnim}>
                <p className="max-w-[54ch] text-[15px] leading-[1.8] text-off-white/70">
                  You want the bid list. Get on it and we&apos;ll email you
                  plans when a project matching your trade goes out for bid.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <Link
                    href="/trade-partners"
                    className="inline-flex items-center gap-2 rounded-[2px] bg-gold px-[30px] py-[14px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c]"
                  >
                    Join the bid list
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-off-white/60 transition-colors hover:text-gold"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Back
                  </button>
                </div>
              </motion.div>
            ) : audience === "homeowner" ? (
              step === 0 ? (
                <motion.div key="h0" {...stepAnim}>
                  <p className={labelCls}>What are we building?</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {projectTypes.map((t) => (
                      <Tile
                        key={t}
                        active={projectType === t}
                        onClick={() => {
                          setProjectType(t);
                          setStep(1);
                        }}
                      >
                        {t}
                      </Tile>
                    ))}
                  </div>
                </motion.div>
              ) : step === 1 ? (
                <motion.div key="h1" {...stepAnim}>
                  <p className={labelCls}>Where do the plans stand?</p>
                  <div className="grid grid-cols-1 gap-3">
                    {planStates.map((p) => (
                      <Tile
                        key={p.value}
                        active={plans?.value === p.value}
                        onClick={() => {
                          setPlans(p);
                          setStep(2);
                        }}
                      >
                        {p.value}
                      </Tile>
                    ))}
                  </div>
                </motion.div>
              ) : step === 2 ? (
                <motion.div key="h2" {...stepAnim}>
                  <p className={labelCls}>Anticipated investment</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {budgetRanges.map((b) => (
                      <Tile
                        key={b}
                        active={budget === b}
                        onClick={() => {
                          setBudget(b);
                          setStep(3);
                        }}
                      >
                        {b}
                      </Tile>
                    ))}
                  </div>
                </motion.div>
              ) : (
                /* ---- Homeowner: the path + form ---- */
                <motion.div key="h3" {...stepAnim}>
                  <p className={labelCls}>
                    Your path · {projectType} · {budget}
                  </p>
                  <PathLedger
                    preconLine={`${
                      plans?.path ?? ""
                    } Preconstruction is a paid engagement, quoted at your consultation; some or all of it credits toward construction when we build together.`}
                  />
                  <div className="mt-9 border-t border-off-white/[0.14] pt-8">
                    {contactFields}
                  </div>
                </motion.div>
              )
            ) : /* ---- Builder lane ---- */
            step === 0 ? (
              <motion.div key="b0" {...stepAnim}>
                <p className={labelCls}>Which scopes are you bidding?</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {builderScopes.map((s) => (
                    <Tile
                      key={s}
                      active={scopes.includes(s)}
                      onClick={() =>
                        setScopes((prev) =>
                          prev.includes(s)
                            ? prev.filter((x) => x !== s)
                            : [...prev, s]
                        )
                      }
                    >
                      {s}
                    </Tile>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={scopes.length === 0}
                  onClick={() => setStep(1)}
                  className="mt-6 inline-flex items-center gap-2 rounded-[2px] bg-gold px-[26px] py-[13px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark transition-all hover:-translate-y-px hover:bg-[#d4a94c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </motion.div>
            ) : (
              <motion.div key="b1" {...stepAnim}>
                <p className={labelCls}>The project</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="planner-biz" className={labelCls}>
                      Company
                    </label>
                    <input
                      id="planner-biz"
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="planner-loc" className={labelCls}>
                      Project location
                    </label>
                    <input
                      id="planner-loc"
                      type="text"
                      value={projectLocation}
                      onChange={(e) => setProjectLocation(e.target.value)}
                      className={inputCls}
                      placeholder="City or community"
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="planner-plans" className={labelCls}>
                      Link to plans
                    </label>
                    <input
                      id="planner-plans"
                      type="url"
                      value={plansLink}
                      onChange={(e) => setPlansLink(e.target.value)}
                      className={inputCls}
                      placeholder="SharePoint, Procore, Dropbox…"
                    />
                  </div>
                  <div>
                    <label htmlFor="planner-due" className={labelCls}>
                      Bid due
                    </label>
                    <input
                      id="planner-due"
                      type="date"
                      value={bidDue}
                      onChange={(e) => setBidDue(e.target.value)}
                      className={`${inputCls} [color-scheme:dark]`}
                    />
                  </div>
                </div>
                <div className="mt-8 border-t border-off-white/[0.14] pt-8">
                  {contactFields}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {audience !== null && status !== "success" && audience !== "trade" ? (
          <button
            type="button"
            onClick={back}
            className="mt-8 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-off-white/60 transition-colors hover:text-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
        ) : null}
    </div>
  );

  if (embedded) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <section
      className="relative border-b border-gold/[0.22] py-[clamp(64px,8vh,104px)]"
      aria-label="Find your path"
    >
      {content}
    </section>
  );
}
