import Link from "next/link";
import Image from "next/image";
import { PageHero } from "@/components/PageHero";
import { ServicesProcess } from "@/components/ServicesProcess";
import { CTABanner } from "@/components/CTABanner";
import { getProjectBySlug } from "@/data/projects";
import { VideoReel } from "@/components/VideoReel";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

export const metadata = {
  title: "Custom Home Builder & New Construction in Scottsdale | Saddlewood Contracting",
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
    images: [{ url: "/images/pv-exterior-front-entrance-dusk.jpg", alt: "Custom home build in Paradise Valley by Saddlewood Contracting" }],
  },
};

const trades = [
  { name: "General", roc: "ROC #305762" },
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

export default function NewConstructionPage() {
  const wholeHome = getProjectBySlug("paradise-valley-40th-street-whole-home-build");
  const processSteps = wholeHome?.processSteps ?? [];

  const pairedFinished = [
    {
      finishedSrc: "/images/pv-entry-foyer.jpg",
      finishedAlt:
        "Finished entry foyer with exposed beams, oak floors, and arched mirrors",
      finishedCaption:
        "The cleared site became the entry — exposed beams, oak floors, and arched mirrors at arrival.",
    },
    {
      finishedSrc: "/images/pv-kitchen-island-wide.jpg",
      finishedAlt:
        "Finished chef's kitchen with natural stone island and coffered ceiling",
      finishedCaption:
        "The slab became the chef's kitchen — natural stone island, coffered ceiling, pendant light.",
    },
    {
      finishedSrc: "/images/pv-great-room-chandelier-pool.jpg",
      finishedAlt:
        "Finished great room with sculptural chandelier opening to pool",
      finishedCaption:
        "Exterior framing carried the great room — sliding doors dissolve into pool and patio beyond.",
    },
    {
      finishedSrc: "/images/pv-master-bedroom-wide.jpg",
      finishedAlt:
        "Finished primary bedroom with oak headboard wall and oversized skylight",
      finishedCaption:
        "Interior framing became the primary suite — oak headboard wall, skylight, framed window view.",
    },
    {
      finishedSrc: "/images/pv-master-bath-veined-marble-wide.jpg",
      finishedAlt:
        "Finished master bath with bookmatched veined marble and freestanding tub",
      finishedCaption:
        "The trusses set the ceiling line over a master bath in bookmatched veined marble.",
    },
    {
      finishedSrc: "/images/pv-master-bath-silver-tub-wide.jpg",
      finishedAlt:
        "Finished master bath with hammered silver tub and bubble chandelier",
      finishedCaption:
        "Same crew through finish — herringbone marble, fluted glass, hammered silver tub.",
    },
  ];

  const pairs = processSteps.map((step, i) => {
    const pair = pairedFinished[i] ?? pairedFinished[pairedFinished.length - 1];
    return {
      number: String(i + 1).padStart(2, "0"),
      label: step.label,
      duringSrc: step.image,
      duringAlt: `${step.label} — 40th Street whole-home build, Paradise Valley`,
      finishedSrc: pair.finishedSrc,
      finishedAlt: pair.finishedAlt,
      finishedCaption: pair.finishedCaption,
    };
  });

  return (
    <>
      <PageHero
        label="New Construction"
        title="We build from the studs up."
        description="From the initial slab to the final roof trusses, we self-perform the entire structure. A true ground-up builder for Scottsdale and Paradise Valley."
        image="/images/pv-exterior-front-entrance-dusk.jpg"
        imageAlt="Custom home front entrance at dusk, designed and built by Saddlewood Contracting"
      />

      {/* Intro/positioning section */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-6">
            <div className="section-label">Bespoke Residential Building</div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2 mb-6">
              A single, self-performing crew for your custom home.
            </h2>
          </div>
          <div className="lg:col-span-6 text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base space-y-6">
            <p>
              Many builders subcontract the structural phases to outside crews. We self-perform them—the foundation, framing, and trusses are built by our own team, so the skeleton of your home is held to the same standard as its finishes.
            </p>
            <p>
              By keeping the structure in-house and managing all four critical trades (general, electrical, plumbing, and HVAC) under our own licenses, we eliminate scheduling gaps, reduce miscommunications, and maintain uncompromising quality from the day we break ground.
            </p>
          </div>
        </div>
      </section>

      {/* On Site Now — Ground-Up Construction Project */}
      <section className="bg-off-white py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12 border-t border-b border-stone-mid/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">On Site Now</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-5">
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2 mb-6">
                Currently breaking ground in Paradise Valley.
              </h2>
              <p className="text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base mb-6">
                We are currently self-performing the structural phase on an active custom estate in Paradise Valley. The structural phase is underway now; our crews take the build from there with custom wood and metal stud framing.
              </p>
              <p className="text-charcoal-light/80 font-light leading-relaxed text-sm">
                <em>Note: This is an active, in-progress steel-frame build. The demolition-to-finish sequence shown below highlights a separate, completed wood-framed home (our 40th Street project) to demonstrate the complete lifecycle of our construction process.</em>
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-12 gap-6 items-end">
              <div className="sm:col-span-5 flex flex-col justify-end">
                <VideoReel
                  src="/videos/breaking-ground-steel-9x16.mp4"
                  poster="/videos/breaking-ground-steel-9x16-poster.jpg"
                  label="On-site footage of framing progress in Paradise Valley"
                  aspect="9x16"
                  mode="autoloop"
                  className="mb-3"
                />
                <p className="text-charcoal-light text-xs font-light">On-site footage of the active Paradise Valley steel framing.</p>
              </div>
              <div className="sm:col-span-7 flex flex-col gap-6">
                <div className="group">
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone mb-3">
                    <Image
                      src="/images/pv-newbuild-steel-frame.jpg"
                      alt="Structural frame erected on the foundation of a Paradise Valley new build"
                      fill
                      sizes="(min-width: 1024px) 35vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="text-charcoal-light text-xs font-light">The structural frame erected on the foundation.</p>
                </div>
                <div className="group">
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone mb-3">
                    <Image
                      src="/images/pv-newbuild-steel-joists.jpg"
                      alt="Stacked galvanized structural-phase steel (set by the project's steel trade) members staged on site"
                      fill
                      sizes="(min-width: 1024px) 35vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="text-charcoal-light text-xs font-light">Galvanized structural-phase steel (set by the project's steel trade) staged on site before erection.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process section */}
      {pairs.length > 0 && (
        <ServicesProcess
          pairs={pairs}
          finalHero={{
            src: "/images/pv-exterior-aerial-sunset-mountain.jpg",
            alt: "Aerial sunset view of finished Paradise Valley estate against the mountains",
            caption:
              "From cleared dirt to a finished estate — every trade ran through our own crew.",
          }}
        />
      )}

      {/* Trades / ROC credential strip */}
      <section
        className="bg-off-white py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12 border-t border-stone-mid/40"
        aria-label="Licensed trades and ROC numbers"
      >
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-[640px] mb-12 sm:mb-16">
            <div className="section-label">In-House Trades</div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2">
              Four ROC licenses.{" "}
              <em className="italic text-teal font-normal">No outside subs.</em>
            </h2>
            <p className="mt-6 text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base max-w-[520px]">
              We pull our own permits. We employ our own electricians, plumbers,
              and HVAC technicians. When something needs coordinating between
              trades, the conversation happens in our own office.
            </p>
          </div>

          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stone-mid/40 border border-stone-mid/40">
            {trades.map((t) => (
              <li
                key={t.name}
                className="bg-off-white px-6 py-8 sm:px-8 sm:py-10"
              >
                <div className="font-heading text-xl sm:text-2xl font-light text-charcoal">
                  {t.name}
                </div>
                <div className="mt-2 text-[11px] tracking-[0.2em] uppercase text-gold-accessible font-medium">
                  {t.roc}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quiet bottom CTA */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[820px] mx-auto text-center">
          <p className="font-heading text-2xl sm:text-3xl lg:text-[36px] font-light text-charcoal leading-[1.3] tracking-[-0.01em] mb-8">
            Ready to build your custom home?{" "}
            <em className="italic text-teal font-normal">Let&apos;s talk.</em>
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-sm text-charcoal hover:text-gold-accessible transition-colors tracking-[0.05em] border-b border-charcoal/30 hover:border-gold-accessible py-2"
          >
            Book a free consultation{" "}
            <span aria-hidden="true">&rarr;</span>
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
