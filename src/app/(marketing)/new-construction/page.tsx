import Link from "next/link";
import { FullBleedHero } from "@/components/FullBleedHero";
import { TransitionBand } from "@/components/TransitionBand";
import { ServicesProcess } from "@/components/ServicesProcess";
import { CTABanner } from "@/components/CTABanner";
import { getCaseStudy } from "@/data/case-studies";
import { SteelBeam } from "@/components/linework";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

export const metadata = {
  title: "Custom Home Builder & New Construction in Scottsdale",
  description:
    "Ground-up new construction and whole-home builds in Scottsdale & Paradise Valley. We self-perform framing, trusses, slab, and all four trades in-house.",
  keywords: [
    "custom home builder Scottsdale",
    "new construction Scottsdale",
    "whole-home build Paradise Valley",
    "Scottsdale custom home construction",
    "ground-up builder Arizona",
  ],
  alternates: {
    canonical: "/new-construction",
  },
  openGraph: {
    title: "Custom Home Builder & New Construction in Scottsdale | Saddlewood",
    description: "Ground-up new construction and whole-home builds in Scottsdale & Paradise Valley. Self-performing structure and finishes in-house.",
  },
};

const trades = [
  { name: "General", roc: "ROC #305762" },
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

// What each construction phase of the completed Paradise Valley wood build
// became in the finished home. The narrative stays grounded in the matching
// project entries in case-studies.ts.
const phaseOutcomes = [
  "The cleared site became the entry: exposed beams, oak floors, and arched mirrors at arrival.",
  "The slab became the chef's kitchen: natural stone island, coffered ceiling, pendant light.",
  "Exterior framing carried the great room: sliding doors dissolve into pool and patio beyond.",
  "Interior framing became the primary suite: oak headboard wall, skylight, framed window view.",
  "The trusses set the ceiling line over a master bath in bookmatched veined marble.",
  "Same crew through finish: herringbone marble, fluted glass, hammered silver tub.",
];

// Field notes from the active Paradise Valley steel-frame build.
const siteNotes = [
  "The structural frame erected on the foundation.",
  "Galvanized structural-phase steel (set by the project's steel trade) staged on site before erection.",
];

export default function NewConstructionPage() {
  const buildSequence =
    getCaseStudy("paradise-valley-structural-phase")?.timelinePhases ?? [];

  const phases = buildSequence.map((step, i) => ({
    number: String(i + 1).padStart(2, "0"),
    label: step.phase,
    outcome: phaseOutcomes[i] ?? phaseOutcomes[phaseOutcomes.length - 1],
  }));

  return (
    <>
      <FullBleedHero
        media={{
          kind: "video",
          src: "/videos/saddlewood-reel-how-it-started-wide.mp4",
          poster: "/videos/saddlewood-reel-how-it-started-wide-poster.jpg",
        }}
        label="Steel structure of the active Paradise Valley build, from the how-it-started reel"
        chip={{ text: "On site now · Paradise Valley", live: true }}
        eyebrow="New Construction"
        title="We build from the studs up."
        description="From the initial slab to the final roof trusses, we self-perform the entire structure. A true ground-up builder for Scottsdale and Paradise Valley."
      />

      {/* Intro/positioning section — the first cream interlude: off-white
          ground, teal drafting grid, charcoal type. */}
      <section className="night-on-cream relative border-b border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal">
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto grid w-full max-w-[1240px] items-start gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="section-label !mb-0">Ground-Up Residential Building</span>
            <h2 className="mt-6 max-w-[16ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
              A single, self-performing crew for your custom home.
            </h2>
          </div>
          <div className="space-y-6 text-[15.5px] leading-[1.8] text-charcoal-light">
            <p>
              Many builders subcontract the structural phases to outside crews. We self-perform them: the foundation, framing, and trusses are built by our own team, so the skeleton of your home is held to the same standard as its finishes.
            </p>
            <p>
              By keeping the structure in-house and managing all four critical trades (general, electrical, plumbing, and HVAC) under our own licenses, we eliminate scheduling gaps, reduce miscommunications, and maintain uncompromising quality from the day we break ground.
            </p>
          </div>
        </div>
      </section>

      {/* On Site Now — active ground-up build. The hero above carries this
          build's footage; here the copy sits beside the drawn steel detail
          and field notes. */}
      <section
        className="relative border-b border-off-white/[0.08] py-[clamp(72px,9vh,112px)]"
        aria-label="Active new construction project"
      >
        <div className="mx-auto grid w-full max-w-[1240px] items-start gap-[clamp(40px,6vw,96px)] px-5 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <span className="section-label !mb-0">On Site Now</span>
            <h2 className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,3.8vw,52px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Currently breaking ground in Paradise Valley.
            </h2>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
              We are currently self-performing the structural phase on an active custom estate in Paradise Valley. The structural phase is underway now; our crews take the build from there with custom wood and metal stud framing.
            </p>
            <p className="mt-5 max-w-[560px] text-[13.5px] leading-[1.75] text-off-white/[0.55]">
              <em>Note: This is an active, in-progress steel-frame build. The demolition-to-finish sequence shown below highlights a separate, completed wood-framed home in Paradise Valley to demonstrate the complete lifecycle of our construction process.</em>
            </p>
          </div>

          {/* Drawn steel detail + field notes */}
          <div>
            <figure className="mb-0 ml-0 mr-0 mt-0" aria-hidden="true">
              <SteelBeam className="block h-auto w-full max-w-[340px]" />
            </figure>
            <div className="mt-8">
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
        </div>
      </section>

      {/* Process section */}
      {phases.length > 0 && (
        <ServicesProcess
          phases={phases}
          closing="From cleared dirt to a finished estate. Every trade ran through our own crew."
        />
      )}

      {/* Transition band — interior steel studs on the active build, a
          media ground between the deep process section and the cream
          trades strip. */}
      <TransitionBand
        src="/videos/saddlewood-transition-band-b.mp4"
        poster="/videos/saddlewood-transition-band-b-poster.jpg"
        eyebrow="Steel Framing · Filmed On Site"
        label="Interior steel stud walls of the active Paradise Valley build"
      />

      {/* Trades / ROC credential strip — cream interlude: off-white ground,
          teal drafting grid, accessible gold for small type, gold-display
          for the italic accent. */}
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
          </div>

          <ul className="mt-12 grid list-none grid-cols-2 gap-px border border-teal/[0.18] bg-teal/[0.18] p-0 lg:grid-cols-4">
            {trades.map((t) => (
              <li key={t.name} className="bg-off-white px-6 py-8 sm:px-8 sm:py-10">
                <div className="font-heading text-xl font-medium text-charcoal sm:text-2xl">
                  {t.name}
                </div>
                <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-gold-accessible">
                  {t.roc}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quiet bottom CTA */}
      <section className="relative py-[clamp(88px,11vh,128px)]">
        <div className="mx-auto w-full max-w-[820px] px-5 text-center sm:px-8">
          <p className="font-heading text-[clamp(26px,3vw,38px)] font-medium leading-[1.3] tracking-[-0.01em] text-off-white">
            Ready to build your custom home?{" "}
            <em className="font-normal italic text-gold">Let&apos;s talk.</em>
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            Book a free consultation <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      <CTABanner />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Custom Home Builder & New Construction",
            "serviceType": "New Construction & Custom Home Building",
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
            "description": "Ground-up new construction and whole-home builds in Scottsdale and Paradise Valley. We self-perform all structure and trades with our in-house crew and four ROC licenses."
          })
        }}
      />
    </>
  );
}
