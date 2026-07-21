import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { ServicesCategories } from "@/components/ServicesCategories";
import { ServicesProcess } from "@/components/ServicesProcess";
import { CTABanner } from "@/components/CTABanner";
import { getProjectBySlug } from "@/data/projects";

export const metadata = {
  title: "Services | Kitchen, Bathroom, Whole-Home & Outdoor Living in Scottsdale | Saddlewood",
  description:
    "Saddlewood Contracting handles every trade in-house — general, electrical, plumbing, and HVAC. From a Paradise Valley demo day to a finished whole-home build, see how four ROC licenses on one crew gets your project from start to finish.",
  alternates: { canonical: "/services" },
};

/**
 * Services page.
 *
 * Structure (top to bottom):
 *   1. PageHero — single quiet line of intent, restrained typography
 *   2. ServicesCategories — Kitchen / Bathroom / Whole-Home / Outdoor Living
 *      as alternating editorial rows
 *   3. ServicesProcess — the centerpiece. Pairs the six construction phases
 *      of the 40th Street whole-home build with finished interiors from the
 *      same Paradise Valley project, ending with a widescreen finished hero.
 *      Replaces the previous generic "Five Steps to Your Dream Space".
 *   4. Trades / credentials strip — dark teal, four ROC licenses
 *   5. Quiet bottom CTA — single text link, conversion lives in the sticky nav
 *   6. Existing CTABanner — kept for parity with other top-level pages
 */

const trades = [
  { name: "General", roc: "ROC #305762" },
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

export default function ServicesPage() {
  const wholeHome = getProjectBySlug("paradise-valley-40th-street-whole-home-build");
  const processSteps = wholeHome?.processSteps ?? [];

  // Pair each construction phase with a finished image from the same
  // Paradise Valley project. The pairings tell the story: the rebar slab
  // becomes the kitchen island; the framing becomes the great room; the
  // crew becomes the master bath. Captions come from the matching project
  // entries in projects.ts so the narrative stays grounded.
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

  // Defensive: if processSteps is shorter than expected, only build what we have.
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

  const categories = [
    {
      name: "Kitchen",
      scope:
        "Custom cabinetry, natural-stone islands, integrated appliances, and the lighting and millwork to tie it together.",
      image: "/images/pv-kitchen-from-wine-wall.jpg",
      imageAlt:
        "Paradise Valley chef's kitchen with stone wine wall, coffered ceiling, and pendant lighting",
      href: "/portfolio",
      hrefLabel: "Kitchen projects",
    },
    {
      name: "Bathroom",
      scope:
        "Bookmatched stone, freestanding tubs, frameless glass, heated floors — plumbed and wired by our own licensed crew.",
      image: "/images/pv-master-bath-veined-marble-wide.jpg",
      imageAlt:
        "Paradise Valley master bath with bookmatched veined marble and freestanding tub",
      href: "/portfolio",
      hrefLabel: "Bathroom projects",
    },
    {
      name: "Whole-Home",
      scope:
        "Full transformations from demolition through final reveal. One contract, one crew, every trade under our four ROC licenses.",
      image: "/images/pv-exterior-aerial-sunset-mountain.jpg",
      imageAlt:
        "Aerial sunset view of completed Paradise Valley whole-home build",
      href: "/portfolio/paradise-valley-40th-street-whole-home-build",
      hrefLabel: "Read the case study",
    },
    {
      name: "Outdoor Living",
      scope:
        "Pools, covered patios, outdoor kitchens, and architectural lighting designed for 300+ days of Sonoran sun.",
      image: "/images/pv-exterior-pool-yard-twilight.jpg",
      imageAlt:
        "Paradise Valley pool deck and outdoor lounge at twilight with landscape lighting",
      href: "/portfolio",
      hrefLabel: "Outdoor projects",
    },
  ];

  return (
    <>
      <PageHero
        label="Services"
        title="Built start to finish, in-house."
        description="Four trades. One crew. Every phase of your remodel — from the first demo swing to the final punch list — handled by Saddlewood's own licensed team."
        image="/images/pv-great-room-chandelier-pool.jpg"
        imageAlt="Paradise Valley great room with sculptural chandelier opening to pool and patio"
      />

      <ServicesCategories categories={categories} />

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

      {/* Credentials strip — slightly more prominent than ServicesGrid's
          treatment. Stays on a light ground (the bottom CTA below uses the
          same off-white, the CTABanner is dark) so the page rhythm reads
          cream → off-white → off-white → dark, without two dark slabs in a
          row. */}
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

      {/* Quiet bottom CTA — single text link. Sticky nav carries the
          primary conversion path; this is just a soft handoff. */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[820px] mx-auto text-center">
          <p className="font-heading text-2xl sm:text-3xl lg:text-[36px] font-light text-charcoal leading-[1.3] tracking-[-0.01em] mb-8">
            If your project belongs in this company,{" "}
            <em className="italic text-teal font-normal">let&apos;s talk.</em>
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-sm text-charcoal hover:text-gold-accessible transition-colors tracking-[0.05em] border-b border-charcoal/30 hover:border-gold-accessible py-2"
          >
            Start a conversation{" "}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
