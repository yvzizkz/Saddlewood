import Link from "next/link";
import { FullBleedHero } from "@/components/FullBleedHero";
import { CTABanner } from "@/components/CTABanner";
import { VideoReel } from "@/components/VideoReel";
import { SheetPair } from "@/components/SheetPair";
import { PhotoWipe } from "@/components/PhotoWipe";
import { ShearWallSheet, WallSection } from "@/components/linework";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

export const metadata = {
  title: "Framing Contractor for Builders & GCs in Scottsdale | Saddlewood",
  description:
    "A licensed Arizona framing contractor (ROC #305762) self-performing structural framing, concrete slab to roof trusses, on schedule in Scottsdale and Paradise Valley.",
  keywords: [
    "framing contractor scottsdale",
    "framing subcontractor arizona",
    "structural framing",
    "framing crew for builders",
    "custom home framing scottsdale",
    "subcontractor ROC 305762",
  ],
  alternates: {
    canonical: "/framing",
  },
  openGraph: {
    title: "Framing Contractor for Builders & GCs in Scottsdale | Saddlewood",
    description: "A licensed Arizona framing crew that self-performs: slab to trusses, on schedule.",
  },
};

// Field notes from the active Paradise Valley ground-up build.
const siteNotes = [
  "Framing taking shape over a new Paradise Valley estate.",
  "The structural frame set on the foundation; our crews carry the framing from here.",
  "Galvanized structural-phase steel (set by the project's steel trade) staged on site before erection.",
];

// The completed Paradise Valley wood-framed build, phase by phase, in
// build order. (Blind-review catch: the old carry-over list had
// "Demolition & Prep" as step 06, after the trusses.)
const woodPhases = [
  {
    number: "01",
    title: "Demolition & Prep",
    caption: "Clean site clearing before structural building begins.",
  },
  {
    number: "02",
    title: "Foundation & Slab",
    caption: "Precision concrete work forming the structural footprint.",
  },
  {
    number: "03",
    title: "Exterior Framing",
    caption: "Heavier structural members and wall plates erected on slab.",
  },
  {
    number: "04",
    title: "Interior Framing",
    caption: "Room configurations and load-bearing partition walls.",
  },
  {
    number: "05",
    title: "Roof Trusses",
    caption: "Complex engineered truss layout securing the roofline.",
  },
  {
    number: "06",
    title: "Structural Closeout",
    caption: "Holdowns, straps, and truss hardware verified before inspection.",
  },
];

const capabilities = [
  {
    title: "Custom Homes",
    description:
      "Full-scale wood framing for custom luxury estates, from foundation layout to engineered truss installation.",
  },
  {
    title: "Additions & Extensions",
    description:
      "Complex tie-ins for structural additions, ensuring clean transitions and structural load management.",
  },
  {
    title: "Structural Remodels",
    description:
      "Wall removals, beam insertions, and roofline reconfigurations matching architectural plans exactly.",
  },
];

const differentiators = [
  {
    title: "Self-Performed",
    desc: "We don't sub out our framing. Our own employees swing the hammers, meaning consistent quality and accountability.",
  },
  {
    title: "ROC Licensed",
    desc: "Fully licensed in Arizona (General ROC #305762) for residential building. We pull permits and coordinate inspections.",
  },
  {
    title: "Single Crew",
    desc: "The same core crew handles slab, framing, and trusses, eliminating handoff gaps and errors.",
  },
  {
    title: "On Schedule",
    desc: "We understand that framing is the critical path. We show up when promised and stay until the inspections pass.",
  },
];

export default function FramingPage() {
  return (
    <>
      <FullBleedHero
        media={{
          kind: "video",
          src: "/videos/saddlewood-transition-band-b.mp4",
          poster: "/videos/saddlewood-transition-band-b-poster.jpg",
        }}
        label="Interior steel stud walls of the active Paradise Valley build"
        chip={{ text: "Self-Performed", live: true }}
        eyebrow="Framing Subcontractor"
        title="A licensed AZ framing crew that self-performs."
        description="From slab to trusses, we deliver structural precision on schedule. The reliable framing partner for Scottsdale's premier builders."
      />

      {/* On Site Now — active ground-up build */}
      <section
        className="relative py-[clamp(72px,9vh,112px)]"
        aria-label="Active framing project"
      >
        <div className="mx-auto grid w-full max-w-[1240px] items-start gap-[clamp(40px,6vw,96px)] px-5 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <span className="section-label !mb-0">On Site Now</span>
            <h2 className="mt-6 max-w-[16ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Ground-up framing in Paradise Valley.
            </h2>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
              An active ground-up build we are self-performing; the structural phase is underway. This project is in its framing stage and demonstrates our team&apos;s capacity for complex custom home engineering.
            </p>

            <div className="mt-10">
              <div className="text-[10.5px] font-medium uppercase tracking-[0.25em] text-gold">
                Field Notes
              </div>
              <ul className="mt-4 grid max-w-[560px] list-none grid-cols-1 gap-y-2.5 p-0">
                {siteNotes.map((note) => (
                  <li
                    key={note}
                    className="relative pl-5 text-[13.5px] leading-snug text-off-white/80"
                  >
                    <span
                      className="absolute left-0 top-[0.62em] h-px w-2.5 bg-gold"
                      aria-hidden="true"
                    />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* On-site reel — dusk treatment + gold edge-light */}
          <div className="flex flex-col items-start lg:sticky lg:top-[110px] lg:items-center">
            <div className="night-reel night-reel--dusk w-[min(320px,80vw)]">
              <VideoReel
                src="/videos/saddlewood-steel-framing-full.mp4"
                poster="/videos/saddlewood-steel-framing-full-poster.jpg"
                label="The full steel framing reel from the active Paradise Valley build"
                aspect="9x16"
                mode="autoplay"
                className="rounded-none bg-teal-dark"
              />
              <span className="night-reel-chip">
                <i className="night-live-dot" aria-hidden="true" />
                On site now
              </span>
            </div>
            <div className="mt-4 text-[10.5px] uppercase tracking-[0.2em] text-off-white/60">
              Active Paradise Valley build · structural phase
            </div>
          </div>
        </div>
      </section>

      {/* The Working Set — traced shear wall detail beside the installed
          steel, the Drawn/Delivered pair pattern on the cream interlude:
          off-white ground, teal drafting grid, charcoal type. */}
      <section
        className="night-on-cream relative border-y border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
        aria-label="Structural drawings and installed framing"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">The Working Set</span>
          <h2 className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
            Engineered, then self-performed.
          </h2>
          <p className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-charcoal-light">
            Steel studs at 16 inches on center, shear panels screwed to
            schedule, holdowns where the plans call them. The same crew that
            reads the S-sheets installs them.
          </p>

          <div className="mt-11">
            <SheetPair
              tone="cream"
              left={{
                tag: "Drawn",
                caption: "Traced from the engineer's structural set",
                children: (
                  <div className="linework-ink w-full p-4">
                    <ShearWallSheet className="block h-auto w-full" />
                  </div>
                ),
              }}
              right={{
                tag: "Installed",
                caption: "Structural phase · Paradise Valley · self-performed",
                aspect: "min-h-[320px]",
                children: (
                  <PhotoWipe
                    src="/images/steel-built.jpg"
                    alt="Steel framing installed on the active Paradise Valley build"
                  />
                ),
              }}
            />
          </div>
        </div>
      </section>

      {/* What We Frame */}
      <section className="relative py-[clamp(72px,9vh,112px)]" aria-label="Framing capabilities">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <span className="section-label !mb-0">Capabilities</span>
              <h2 className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                Structural framing for custom builds &amp; major additions.
              </h2>
              <p className="mt-6 max-w-[520px] text-[15.5px] leading-[1.8] text-off-white/70">
                Saddlewood provides dedicated structural framing services for custom home builders, general contractors, and architects who demand on-schedule execution and precise tolerances.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] sm:grid-cols-3">
              {capabilities.map((item, idx) => (
                <div key={item.title} className="flex h-full flex-col bg-teal-dark p-6 lg:p-7">
                  <div className="text-[10.5px] font-medium tracking-[0.25em] text-gold">
                    0{idx + 1}
                  </div>
                  <h3 className="mt-4 font-heading text-[19px] font-medium leading-[1.3] text-off-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[13px] leading-[1.7] text-off-white/[0.62]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Completed build — drawn wood-framed process ledger on the cream
          interlude: off-white ground, teal drafting grid, charcoal type. */}
      <section
        className="night-on-cream relative border-y border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
        aria-label="Completed wood-framed build process"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">Completed Build</span>
          <h2 className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
            Wood-Framed Process: Slab to Trusses
          </h2>
          <p className="mt-6 max-w-[720px] text-[15.5px] leading-[1.8] text-charcoal-light">
            A retrospective look at a separate, completed wood-framed whole-home build in Paradise Valley. The project demonstrates our structural execution and self-performed crew timeline from slab to roof trusses.
          </p>

          {/* Drawn wall section above the phase ledger, single flow */}
          <div className="mt-[clamp(44px,6vh,72px)] max-w-[880px]">
            <figure className="mb-0 ml-0 mr-0" aria-hidden="true">
              <div className="linework-ink max-w-[320px]">
                <WallSection className="block h-auto w-full" />
              </div>
              <figcaption className="mt-3.5 text-[10.5px] uppercase tracking-[0.18em] text-charcoal/[0.65]">
                Wall section · Footing to double top plate
              </figcaption>
            </figure>
            <ol className="mt-10 list-none border-t border-charcoal/[0.14] p-0" role="list">
              {woodPhases.map((phase) => (
                <li
                  key={phase.number}
                  className="grid grid-cols-[56px_1fr] items-baseline gap-x-5 border-b border-charcoal/[0.14] py-5 sm:grid-cols-[64px_180px_1fr] sm:gap-x-6"
                >
                  <span className="font-heading text-[26px] font-medium leading-none text-gold-accessible sm:text-[30px]">
                    {phase.number}
                  </span>
                  <h3 className="m-0 text-[11.5px] font-medium uppercase tracking-[0.2em] text-charcoal">
                    {phase.title}
                  </h3>
                  <p className="col-span-2 m-0 mt-2 text-[13.5px] leading-[1.7] text-charcoal-light sm:col-span-1 sm:mt-0">
                    {phase.caption}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Why Builders Hire Us */}
      <section className="relative py-[clamp(72px,9vh,112px)]" aria-label="Why builders hire Saddlewood">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">The Saddlewood Difference</span>
          <h2 className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
            Structure built to plan, on schedule.
          </h2>
          <div className="mt-[clamp(40px,5vh,64px)] grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {differentiators.map((item) => (
              <div key={item.title} className="border-l border-gold/40 pl-6">
                <h3 className="font-heading text-[20px] font-medium leading-[1.3] text-off-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/[0.65]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Builder CTA — hairline-framed panel with the soft gold glow */}
      <section className="relative pb-[clamp(80px,10vh,120px)]" aria-label="Request a framing bid">
        <div className="mx-auto w-full max-w-[900px] px-5 sm:px-8">
          <div className="relative overflow-hidden border border-gold/[0.28] px-7 py-14 text-center sm:px-12 sm:py-16">
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(200,165,90,0.09), transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-[20ch] font-heading text-[clamp(26px,3.2vw,40px)] font-medium leading-[1.25] tracking-[-0.01em] text-off-white">
                Need a reliable framing subcontractor for your next project?
              </h2>
              <p className="mx-auto mt-5 max-w-[540px] text-[15px] leading-[1.8] text-off-white/[0.68]">
                Send us your plans, engineering sheets, and schedule. We&apos;ll provide a detailed structural framing proposal.
              </p>
              <Link
                href="/contact"
                className="mt-8 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
              >
                Request a framing bid <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CTABanner variant="builders" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Structural Framing Contractor & Subcontractor",
            "serviceType": "Structural Wood Framing",
            "provider": {
              "@type": "HomeAndConstructionBusiness",
              "@id": `${siteUrl}/#business`,
              "name": "Saddlewood Contracting LLC"
            },
            "areaServed": [
              {
                "@type": "City",
                "name": "Scottsdale",
                "containedInPlace": { "@type": "State", "name": "Arizona" }
              },
              {
                "@type": "Place",
                "name": "Paradise Valley, AZ"
              }
            ],
            "description": "Licensed framing contractor in Scottsdale and Paradise Valley. We self-perform slab to trusses on schedule under Arizona ROC license #305762."
          })
        }}
      />
    </>
  );
}
