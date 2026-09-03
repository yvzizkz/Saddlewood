import Link from "next/link";
import { FullBleedHero } from "@/components/FullBleedHero";
import { ServicesCategories } from "@/components/ServicesCategories";
import { ServicesProcess } from "@/components/ServicesProcess";
import { CTABanner } from "@/components/CTABanner";
import { VideoReel } from "@/components/VideoReel";
import { SheetPair } from "@/components/SheetPair";
import { PhotoWipe } from "@/components/PhotoWipe";
import { VideoPanel } from "@/components/VideoPanel";
import { KitchenSheet } from "@/components/linework";
import { getCaseStudy } from "@/data/case-studies";

export const metadata = {
  title: "Kitchen, Bathroom, Whole-Home & Outdoor Living in Scottsdale",
  description:
    "Saddlewood Contracting handles every trade in-house: general, electrical, plumbing, and HVAC. Four dual-classification ROC licenses covering residential and commercial work, so one crew carries your project from the first demo swing to the final punch list.",
  alternates: { canonical: "/services" },
};

/**
 * Services page, Night Blueprint.
 *
 * Structure (top to bottom):
 *   1. FullBleedHero — premium standard: edge-to-edge wide crop of the
 *      in-progress kitchen remodel loop under the dark grade
 *   2. ServicesCategories — Kitchen / Bathroom / Whole-Home / Outdoor Living
 *      as hairline linework + type plates
 *   3. Kitchen & Bath sheet pair — cream interlude, traced millwork
 *      elevation beside the delivered kitchen photograph
 *   4. ServicesProcess — the six construction phases of the completed
 *      Paradise Valley whole-home build as a drawn, typographic timeline
 *   5. From the Field — the in-progress remodel reel
 *   6. Trades / credentials strip — the second cream interlude
 *   7. Quiet bottom CTA — single text link, conversion lives in the sticky nav
 *   8. Existing CTABanner — kept for parity with other top-level pages
 */

// The classifications exactly as they read on the ROC register. KB-2 is a
// dual residential and small commercial general license; the CR-class
// specialty licenses are dual commercial and residential. "Small commercial"
// stays on the general license rather than being rounded up.
const trades = [
  {
    name: "General",
    code: "KB-2",
    scope: "Dual residential and small commercial",
    roc: "ROC #305762",
  },
  {
    name: "Electrical",
    code: "CR-11",
    scope: "Dual commercial and residential",
    roc: "ROC #350715",
  },
  {
    name: "HVAC",
    code: "CR-39",
    scope: "Air conditioning and refrigeration",
    roc: "ROC #350714",
  },
  {
    name: "Plumbing",
    code: "CR-37",
    scope: "Dual commercial and residential",
    roc: "ROC #350716",
  },
];

// What each construction phase of the completed Paradise Valley whole-home
// build became in the finished home. The narrative stays grounded in the
// matching project entries in case-studies.ts.
const phaseOutcomes = [
  "The cleared site became the entry: exposed beams, oak floors, and arched mirrors at arrival.",
  "The slab became the chef's kitchen: natural stone island, coffered ceiling, pendant light.",
  "Exterior framing carried the great room: sliding doors dissolve into pool and patio beyond.",
  "Interior framing became the primary suite: oak headboard wall, skylight, framed window view.",
  "The trusses set the ceiling line over a master bath in bookmatched veined marble.",
  "Same crew through finish: herringbone marble, fluted glass, hammered silver tub.",
];

export default function ServicesPage() {
  const buildSequence =
    getCaseStudy("paradise-valley-structural-phase")?.timelinePhases ?? [];

  // Defensive: if processSteps is shorter than expected, only build what we have.
  const phases = buildSequence.map((step, i) => ({
    number: String(i + 1).padStart(2, "0"),
    label: step.phase,
    outcome: phaseOutcomes[i] ?? phaseOutcomes[phaseOutcomes.length - 1],
  }));

  // Media policy (owner directive, 2026-08-30): generated and enhanced
  // imagery is allowed here for embellishment, for illustrating a concept,
  // and as a stand-in where a client would rather their own project not be
  // shown. The one line that stays: an image only carries a "filmed on
  // site" or named-project caption when that is literally what it is.
  // Anything generated is captioned for what it is, or left uncaptioned as
  // decoration where no claim is implied.
  const categories = [
    {
      name: "Kitchen",
      scope:
        "Custom cabinetry, natural-stone islands, integrated appliances, and the lighting and millwork to tie it together.",
      media: {
        src: "/images/study-kitchen-luxury.jpg",
        alt: "Architectural study of the custom kitchen: bookmatched waterfall marble island, fluted oak cabinetry, and integrated appliances",
        caption: "Study · drawn from the design program",
      },
      href: "/portfolio",
      hrefLabel: "Kitchen projects",
    },
    {
      name: "Bathroom",
      scope:
        "Bookmatched stone, freestanding tubs, frameless glass, heated floors. Plumbed and wired by our own licensed crew.",
      media: {
        src: "/images/study-bath-luxury.jpg",
        alt: "Architectural study of the master bath: freestanding soaking tub, bookmatched marble walls, and fluted glass shower",
        caption: "Study · drawn from the design program",
      },
      href: "/portfolio",
      hrefLabel: "Bathroom projects",
    },
    {
      name: "Whole-Home",
      scope:
        "Full transformations from demolition through final reveal. One contract, one crew, every trade under our own four ROC licenses.",
      media: {
        src: "/images/steel-aerial-frame.jpg",
        alt: "Drone aerial of the steel deck on the active Paradise Valley build",
        caption: "From the active Paradise Valley build",
      },
      href: "/portfolio/paradise-valley-whole-home-build",
      hrefLabel: "Read the case study",
    },
    {
      name: "Outdoor Living",
      scope:
        "Pools, covered patios, outdoor kitchens, and architectural lighting designed for 300+ days of Sonoran sun.",
      media: {
        src: "/images/study-terrace-luxury.jpg",
        alt: "Architectural study of the outdoor living terrace: cantilevered steel overhang, sunken fire lounge, and reflection pool",
        caption: "Study · outdoor living program",
      },
      href: "/portfolio",
      hrefLabel: "Outdoor projects",
    },
  ];

  return (
    <>
      <FullBleedHero
        media={{
          kind: "image",
          src: "/images/services-hero-luxury.jpg",
          alt: "Completed modern luxury design-build estate at twilight with cantilevered terrace and reflecting pool",
          kenBurns: true,
        }}
        label="Completed modern luxury estate showcasing all-trade execution in Paradise Valley"
        mediaCaption="Architectural study · Paradise Valley estate"
        eyebrow="Services"
        title="Built start to finish, in-house."
        description="Four trades. One crew. Every phase of your remodel, from the first demo swing to the final punch list, handled by Saddlewood's own licensed team."
      />

      <ServicesCategories categories={categories} />

      {/* Kitchen & Bath sheet pair — cream interlude: off-white ground,
          teal drafting grid, traced millwork elevation beside the delivered
          photograph. Sits between two dark sections so the two cream
          interludes on this page never touch. */}
      <section
        className="night-on-cream relative border-y border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
        aria-label="Kitchen and bath, drawn and delivered"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">Services · Kitchen &amp; Bath</span>
          <h2 className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal">
            Built to the sixteenth.
          </h2>
          <p className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-charcoal-light">
            Every kitchen starts as a dimensioned elevation and ends flush to
            it. Waterfall edges, custom millwork, stone specified to the
            profile. Drawing and delivery, side by side.
          </p>

          <div className="mt-11">
            <SheetPair
              tone="cream"
              left={{
                tag: "Drawn",
                caption: "Traced from the project's millwork set",
                children: (
                  <div className="linework-ink w-full p-4">
                    <KitchenSheet className="block h-auto w-full" />
                  </div>
                ),
              }}
              right={{
                tag: "Delivered",
                caption: "Bespoke millwork & stone · delivered to the sixteenth",
                aspect: "min-h-[320px]",
                children: (
                  <PhotoWipe
                    src="/images/study-kitchen-luxury.jpg"
                    alt="Finished luxury chef's kitchen with fluted white oak millwork and Calacatta waterfall marble island"
                  />
                ),
              }}
            />
          </div>
        </div>
      </section>

      {phases.length > 0 && (
        <ServicesProcess
          phases={phases}
          closing="From cleared dirt to a finished estate. Every trade ran through our own crew."
        />
      )}

      {/* From the Field — the in-progress remodel reel, two-column
          layout modeled on the framing page's On Site Now section. */}
      <section
        className="relative border-t border-off-white/[0.08] py-[clamp(72px,9vh,112px)]"
        aria-label="Remodel in progress"
      >
        <div className="mx-auto grid w-full max-w-[1240px] items-start gap-[clamp(40px,6vw,96px)] px-5 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <span className="section-label !mb-0">From the Field</span>
            <h2 className="mt-6 max-w-[16ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              A remodel underway.
            </h2>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
              Saddlewood remodels homes across Scottsdale&apos;s communities
              with the same in-house crew that runs our ground-up builds. This
              reel follows one of them, filmed on site while the work is live.
            </p>
          </div>

          <div className="flex flex-col items-start lg:sticky lg:top-[110px] lg:items-center">
            <div className="night-reel w-[min(320px,80vw)]">
              <VideoReel
                src="/videos/saddlewood-reel-troon-remodel.mp4"
                poster="/videos/saddlewood-reel-troon-remodel-poster.jpg"
                label="Walkthrough of a remodel in progress in Scottsdale"
                aspect="9x16"
                mode="autoplay"
                className="rounded-none bg-teal-dark"
              />
              <span className="night-reel-chip">Remodel · In Progress</span>
            </div>
            <div className="mt-4 text-[10.5px] uppercase tracking-[0.2em] text-off-white/60">
              Remodel in progress · Scottsdale
            </div>
          </div>
        </div>
      </section>

      {/* Credentials strip — the second cream interlude in the page rhythm:
          off-white ground, teal drafting grid, accessible gold for small
          type, gold-display for the italic accent. */}
      <section
        className="night-on-cream relative border-t border-gold/[0.35] bg-off-white py-[clamp(80px,10vh,120px)] text-charcoal"
        aria-label="Licensed trades and ROC numbers"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="max-w-[640px]">
            <span className="section-label !mb-0">In-House Trades</span>
            <h2 className="mt-5 font-heading text-[clamp(32px,3.8vw,48px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
              Four ROC licenses, held in-house.
            </h2>
            <p className="mt-6 max-w-[520px] text-[15.5px] leading-[1.8] text-charcoal-light">
              We pull our own permits. We employ our own electricians, plumbers,
              and HVAC technicians. When something needs coordinating between
              trades, the conversation happens in our own office.
            </p>
            <p className="mt-5 max-w-[520px] text-[15.5px] leading-[1.8] text-charcoal-light">
              All four are dual classifications, so the same crew is licensed
              for commercial work as well as residential. If you have a
              tenant improvement, an office build-out, or a small commercial
              project alongside your home, it runs through the same team.
            </p>
          </div>

          <ul className="mt-12 grid list-none grid-cols-1 gap-px border border-teal/[0.18] bg-teal/[0.18] p-0 sm:grid-cols-2 lg:grid-cols-4">
            {trades.map((t) => (
              <li key={t.name} className="bg-off-white px-6 py-8 sm:px-8 sm:py-9">
                <div className="flex items-baseline gap-3">
                  <span className="font-heading text-xl font-medium text-charcoal sm:text-2xl">
                    {t.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#76580a]">
                    {t.code}
                  </span>
                </div>
                <p className="mt-2.5 max-w-[26ch] text-[13px] leading-[1.6] text-charcoal-light">
                  {t.scope}
                </p>
                <div className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-charcoal-light tabular-nums">
                  {t.roc}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
