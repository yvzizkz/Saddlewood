import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Framing Capability Statement — Wood & Steel, Slab to Trusses",
  description:
    "Saddlewood Contracting capability statement for builders and GCs: licensed AZ framing (ROC #305762), self-performed wood and structural steel framing, Scottsdale & Phoenix metro. Send plans to info@saddlewoodcontracting.com.",
  alternates: { canonical: "/framing/capabilities" },
  openGraph: {
    title: "Saddlewood — Framing Capability Statement",
    description:
      "Licensed AZ framing crew, self-performing wood & structural steel, slab to trusses.",
    images: [
      {
        url: "/images/pv-newbuild-steel-frame.jpg",
        alt: "Structural steel framing by Saddlewood Contracting in Paradise Valley",
      },
    ],
  },
};

const FACTS: [string, string][] = [
  ["Legal name", "Saddlewood Contracting LLC"],
  ["License", "Arizona ROC #305762"],
  ["Operating since", "2013"],
  ["Base", "Scottsdale, Arizona"],
  ["Service area", "Scottsdale · Paradise Valley · Phoenix metro"],
  ["Systems", "Wood framing · structural steel · hybrid"],
  ["Delivery", "Lumber-and-labor or labor-only"],
  ["Crew language", "English & Spanish — bilingual field leadership"],
  ["Insurance", "COI issued on request, certificate holder named"],
  ["Bid intake", "info@saddlewoodcontracting.com · Procore invitations accepted"],
];

const SCOPE = [
  {
    n: "01",
    t: "Layout & podium",
    d: "Snap lines from control, sill and anchor verification against the foundation as-built — tolerances reconciled before a single wall stands.",
  },
  {
    n: "02",
    t: "Walls & shear",
    d: "Bearing and partition walls, shear panels and hold-downs per plan, straight-line checked before inspection is ever called.",
  },
  {
    n: "03",
    t: "Beams, headers & steel",
    d: "Glulam, LVL, PSL and structural steel — moment frames and long-span members set, bolted and welded by our own crew.",
  },
  {
    n: "04",
    t: "Floors & decks",
    d: "Joist systems, sheathing, and elevated decks — flat enough for stone, quiet enough for the client who paid for it.",
  },
  {
    n: "05",
    t: "Rooflines & trusses",
    d: "Truss set and stick-framed rooflines to plan, complex intersections and desert-contemporary parapets included.",
  },
  {
    n: "06",
    t: "Backing, blocking & punch",
    d: "Trade backing, draft stops, hardware audit, and a framing punch walked with your super — before we ask for a sign-off.",
  },
];

export default function FramingCapabilitiesPage() {
  return (
    <main className="bg-off-white">
      {/* ============ HERO — document masthead ============ */}
      <section className="relative bg-teal-dark overflow-hidden">
        <div className="absolute inset-0 opacity-[0.16]">
          <Image
            src="/images/pv-newbuild-steel-frame.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(26,47,47,0.96) 0%, rgba(26,47,47,0.82) 55%, rgba(26,47,47,0.55) 100%)",
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 pt-32 sm:pt-36 pb-16 sm:pb-20">
          <div className="flex items-center gap-3 text-gold text-[11px] tracking-[0.3em] uppercase font-light">
            <span className="h-px w-8 bg-gold inline-block" />
            Capability Statement · For Builders &amp; GCs
          </div>
          <h1 className="font-heading font-light text-stone leading-[1.04] tracking-[-0.02em] text-[44px] sm:text-6xl lg:text-[76px] mt-6 max-w-[14ch]">
            Framing, <em className="italic text-gold">self-performed.</em>
            <br />
            Slab to trusses.
          </h1>
          <p className="text-stone/75 text-base sm:text-lg font-light leading-relaxed max-w-[52ch] mt-7">
            Wood and structural steel by one accountable crew — no broker layer, no
            borrowed labor. This page is our capability statement; print it, forward
            it, or send us the plans and skip the paperwork.
          </p>
          <div className="flex flex-wrap gap-4 mt-9">
            <a
              href="mailto:info@saddlewoodcontracting.com?subject=Framing%20bid%20invitation"
              className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.12em] uppercase no-underline hover:bg-[#d4a94c] transition-colors"
            >
              Send plans for pricing
            </a>
            <Link
              href="/framing"
              className="inline-block px-8 py-3.5 border border-stone/40 text-stone text-[12px] font-medium tracking-[0.12em] uppercase no-underline hover:border-gold hover:text-gold transition-colors"
            >
              See active framing work
            </Link>
          </div>
        </div>
        {/* masthead rule */}
        <div className="relative z-10 border-t border-stone/15">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-x-10 gap-y-1 text-[11px] tracking-[0.18em] uppercase text-stone/50">
            <span>ROC #305762</span>
            <span>Est. 2013</span>
            <span>Wood · Steel · Hybrid</span>
            <span>Scottsdale — Phoenix Metro</span>
          </div>
        </div>
      </section>

      {/* ============ FACT FILE — the spec card ============ */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="section-label">The file card</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-charcoal leading-[1.15]">
              Everything your PM needs, on one card.
            </h2>
            <p className="text-charcoal-light text-[15px] font-light leading-relaxed mt-5">
              The vitals a builder checks before a sub gets on the bid list. If your
              prequal packet needs more, ask — we answer the same day.
            </p>
          </div>
          <div className="lg:col-span-8">
            <dl className="bg-white border border-stone">
              {FACTS.map(([k, v], i) => (
                <div
                  key={k}
                  className={`grid grid-cols-[38%_62%] sm:grid-cols-[30%_70%] gap-4 px-6 sm:px-8 py-[13px] ${
                    i !== 0 ? "border-t border-stone/70" : ""
                  }`}
                >
                  <dt className="text-[11px] tracking-[0.16em] uppercase text-gold-accessible self-center">
                    {k}
                  </dt>
                  <dd className="text-[14px] sm:text-[15px] text-charcoal font-light self-center">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ============ SCOPE — numbered editorial rail ============ */}
      <section className="bg-cream border-y border-stone-mid/40 px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-[1100px] mx-auto">
          <p className="section-label">Scope of self-performance</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-charcoal leading-[1.15] max-w-[24ch]">
            What our own hands do — nothing on this list is brokered out.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-12 mt-12">
            {SCOPE.map((s) => (
              <div key={s.n} className="group">
                <div className="flex items-baseline gap-4 border-b border-stone-mid pb-3 group-hover:border-gold transition-colors duration-300">
                  <span className="font-heading text-[34px] leading-none text-gold/70">
                    {s.n}
                  </span>
                  <h3 className="font-heading text-xl text-teal-dark font-medium">
                    {s.t}
                  </h3>
                </div>
                <p className="text-[14px] text-charcoal-light font-light leading-relaxed mt-4">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PROOF — on site now ============ */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <p className="section-label">On site now</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-charcoal leading-[1.2]">
              A ground-up custom in Paradise Valley —{" "}
              <em className="italic text-teal">steel skeleton by our crew.</em>
            </h2>
            <p className="text-charcoal-light text-[15px] font-light leading-relaxed mt-5 max-w-[48ch]">
              Moment frames set, bolted and welded by the same crew that frames the
              wood — one sub, one schedule, no finger-pointing at the wood-to-steel
              interface. Ask to walk it; active work answers questions a brochure
              can&apos;t.
            </p>
          </div>
          <div className="lg:col-span-6">
            <Image
              src="/images/pv-newbuild-steel-aerial.jpg"
              alt="Aerial view of the structural steel skeleton on a Paradise Valley ground-up custom framed by Saddlewood"
              width={1200}
              height={800}
              className="w-full border border-stone"
            />
          </div>
        </div>
      </section>

      {/* ============ HOW WE BID ============ */}
      <section className="bg-teal-dark px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 text-gold text-[11px] tracking-[0.3em] uppercase font-light">
              <span className="h-px w-8 bg-gold inline-block" />
              How we bid
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-stone leading-[1.15] mt-5">
              A number we&apos;ll stand behind — which means we look first.
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-6">
            {[
              [
                "Send the plans",
                "Structural set + architecturals to info@saddlewoodcontracting.com, or invite us through Procore. We confirm receipt the same business day.",
              ],
              [
                "We do a real takeoff",
                "Member-by-member, from your sheets — and we flag plan conflicts before they become RFIs on your schedule.",
              ],
              [
                "Walk, then commit",
                "For occupied remodels and complex sites we walk the job before final numbers. A framing bid without eyes on the site is a guess with a signature.",
              ],
              [
                "Capacity, honestly",
                "Our core crew self-performs; vetted trade partners let us flex for larger packages. If a start date doesn't work, we say so at the bid — not at mobilization.",
              ],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-gold pl-5">
                <h3 className="text-stone text-[15px] font-medium tracking-wide">{t}</h3>
                <p className="text-stone/65 text-[14px] font-light leading-relaxed mt-1">
                  {d}
                </p>
              </div>
            ))}
            <div className="pt-4">
              <a
                href="mailto:info@saddlewoodcontracting.com?subject=Framing%20bid%20invitation"
                className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.12em] uppercase no-underline hover:bg-[#d4a94c] transition-colors"
              >
                info@saddlewoodcontracting.com
              </a>
              <p className="text-stone/50 text-[12px] font-light mt-3">
                Or call the office: (480) 999-6100 — Mon–Fri 7am–5pm.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
