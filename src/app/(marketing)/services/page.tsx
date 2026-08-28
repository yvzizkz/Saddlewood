import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { ServicesCategories } from "@/components/ServicesCategories";
import { ServicesProcess } from "@/components/ServicesProcess";
import { CTABanner } from "@/components/CTABanner";
import { WallSection } from "@/components/linework";
import { getProjectBySlug } from "@/data/projects";

export const metadata = {
  title: "Services | Kitchen, Bathroom, Whole-Home & Outdoor Living in Scottsdale | Saddlewood",
  description:
    "Saddlewood Contracting handles every trade in-house — general, electrical, plumbing, and HVAC. From a Paradise Valley demo day to a finished whole-home build, see how four ROC licenses on one crew gets your project from start to finish.",
  alternates: { canonical: "/services" },
};

/**
 * Services page, Night Blueprint.
 *
 * Structure (top to bottom):
 *   1. PageHero — gold kicker, Fraunces title, wall-section linework
 *   2. ServicesCategories — Kitchen / Bathroom / Whole-Home / Outdoor Living
 *      as hairline linework + type plates
 *   3. ServicesProcess — the six construction phases of the 40th Street
 *      whole-home build as a drawn, typographic timeline
 *   4. Trades / credentials strip — the one cream interlude in the rhythm
 *   5. Quiet bottom CTA — single text link, conversion lives in the sticky nav
 *   6. Existing CTABanner — kept for parity with other top-level pages
 */

const trades = [
  { name: "General", roc: "ROC #305762" },
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

// What each construction phase of the 40th Street build became in the
// finished home. The narrative stays grounded in the matching project
// entries in projects.ts.
const phaseOutcomes = [
  "The cleared site became the entry: exposed beams, oak floors, and arched mirrors at arrival.",
  "The slab became the chef's kitchen: natural stone island, coffered ceiling, pendant light.",
  "Exterior framing carried the great room: sliding doors dissolve into pool and patio beyond.",
  "Interior framing became the primary suite: oak headboard wall, skylight, framed window view.",
  "The trusses set the ceiling line over a master bath in bookmatched veined marble.",
  "Same crew through finish: herringbone marble, fluted glass, hammered silver tub.",
];

export default function ServicesPage() {
  const wholeHome = getProjectBySlug("paradise-valley-40th-street-whole-home-build");
  const processSteps = wholeHome?.processSteps ?? [];

  // Defensive: if processSteps is shorter than expected, only build what we have.
  const phases = processSteps.map((step, i) => ({
    number: String(i + 1).padStart(2, "0"),
    label: step.label,
    outcome: phaseOutcomes[i] ?? phaseOutcomes[phaseOutcomes.length - 1],
  }));

  const categories = [
    {
      name: "Kitchen",
      scope:
        "Custom cabinetry, natural-stone islands, integrated appliances, and the lighting and millwork to tie it together.",
      linework: "plan-fragment",
      href: "/portfolio",
      hrefLabel: "Kitchen projects",
    },
    {
      name: "Bathroom",
      scope:
        "Bookmatched stone, freestanding tubs, frameless glass, heated floors. Plumbed and wired by our own licensed crew.",
      linework: "wall-section",
      href: "/portfolio",
      hrefLabel: "Bathroom projects",
    },
    {
      name: "Whole-Home",
      scope:
        "Full transformations from demolition through final reveal. One contract, one crew, every trade under our four ROC licenses.",
      linework: "massing",
      href: "/portfolio/paradise-valley-40th-street-whole-home-build",
      hrefLabel: "Read the case study",
    },
    {
      name: "Outdoor Living",
      scope:
        "Pools, covered patios, outdoor kitchens, and architectural lighting designed for 300+ days of Sonoran sun.",
      linework: "plat",
      href: "/portfolio",
      hrefLabel: "Outdoor projects",
    },
  ];

  return (
    <>
      <PageHero
        label="Services"
        title="Built start to finish, in-house."
        description="Four trades. One crew. Every phase of your remodel, from the first demo swing to the final punch list, handled by Saddlewood's own licensed team."
        linework={
          <WallSection glow className="block h-auto w-full max-w-[440px] lg:ml-auto" />
        }
      />

      <ServicesCategories categories={categories} />

      {phases.length > 0 && (
        <ServicesProcess
          phases={phases}
          closing="From cleared dirt to a finished estate. Every trade ran through our own crew."
        />
      )}

      {/* Credentials strip — the one cream interlude in the page rhythm,
          following the HeritageInterlude treatment: off-white ground, teal
          drafting grid, accessible gold for small type, gold-display for
          the italic accent. */}
      <section
        className="night-on-cream relative border-t border-gold/[0.35] bg-off-white py-[clamp(80px,10vh,120px)] text-charcoal"
        aria-label="Licensed trades and ROC numbers"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="max-w-[640px]">
            <span className="section-label !mb-0">In-House Trades</span>
            <h2 className="mt-5 font-heading text-[clamp(32px,3.8vw,48px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
              Four ROC licenses.{" "}
              <em className="font-normal italic text-gold-display">
                No outside subs.
              </em>
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

      {/* Quiet bottom CTA — single text link. Sticky nav carries the
          primary conversion path; this is just a soft handoff. */}
      <section className="relative py-[clamp(88px,11vh,128px)]">
        <div className="mx-auto w-full max-w-[820px] px-5 text-center sm:px-8">
          <p className="font-heading text-[clamp(26px,3vw,38px)] font-medium leading-[1.3] tracking-[-0.01em] text-off-white">
            If your project belongs in this company,{" "}
            <em className="font-normal italic text-gold">let&apos;s talk.</em>
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            Start a conversation <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
