import type { Metadata } from "next";
import { TradePartnersForm } from "@/components/TradePartnersForm";
import { ShearWallSheet, SteelBeam } from "@/components/linework";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

export const metadata: Metadata = {
  title: {
    absolute:
      "Subcontractor Bid List | Work With Saddlewood Contracting (Scottsdale, AZ)",
  },
  description:
    "Subcontractors & trade partners: get on Saddlewood Contracting's bid list. We send plans and architectural drawings when new construction, framing, and remodel projects go out for bid in Scottsdale & Paradise Valley. Apply in minutes.",
  keywords: [
    "Saddlewood subcontractors",
    "Scottsdale subcontractor bid list",
    "Paradise Valley subcontractors wanted",
    "trade partners Scottsdale",
    "framing subcontractor Scottsdale",
    "general contractor bid list Arizona",
    "subcontractors wanted Phoenix",
    "become a subcontractor Scottsdale",
  ],
  alternates: {
    canonical: "/trade-partners",
  },
  openGraph: {
    title: "Work With Saddlewood Contracting | Subcontractor Bid List",
    description:
      "Get on our bid list. We send plans and drawings to trade partners when new construction, framing, and remodel projects go out for bid across Scottsdale & Paradise Valley.",
    type: "website",
    // No per-page image override — inherits the site OG image.
  },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${siteUrl}/trade-partners#webpage`,
  url: `${siteUrl}/trade-partners`,
  name: "Subcontractor Bid List — Work With Saddlewood Contracting",
  description:
    "Apply to join Saddlewood Contracting's subcontractor bid list. Trade partners receive plans and architectural drawings when projects go out for bid.",
  about: { "@id": `${siteUrl}/#business` },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Trade Partners",
        item: `${siteUrl}/trade-partners`,
      },
    ],
  },
};

const bidListSteps = [
  {
    n: "01",
    t: "Apply below",
    d: "Share your business, license, trades, and coverage area.",
  },
  {
    n: "02",
    t: "We review & file you",
    d: "You're added to our bid list, organized by trade classification.",
  },
  {
    n: "03",
    t: "We send you plans",
    d: "When a matching project goes out for bid, drawings land in your inbox.",
  },
];

export default function TradePartnersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />

      {/* Hero — the "document" treatment: the deep PageHero layout inlined
          so thin brass rules can bound the copy block like a bid sheet. */}
      <section
        className="relative flex items-end overflow-hidden pb-[clamp(48px,7vh,80px)] pt-32 sm:pt-36 lg:pt-40"
        role="banner"
      >
        {/* Ambient gold glow */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 30% 80%, rgba(200,165,90,0.08), transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-[1240px] items-end gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div>
            <div className="mb-7 h-px w-full bg-gold/40" aria-hidden="true" />
            <span className="section-label !mb-0">Trade Partners</span>
            <h1 className="mt-5 max-w-[16ch] font-heading text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-off-white sm:text-5xl lg:text-6xl xl:text-[68px]">
              Work With Us
            </h1>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
              Saddlewood is always looking for reliable subcontractors and
              vendors. Get on our bid list and we&apos;ll send you plans when
              the right project comes up.
            </p>
            <div className="mt-8 h-px w-full bg-gold/40" aria-hidden="true" />
          </div>
          <div className="hidden lg:block" aria-hidden="true">
            <SteelBeam className="ml-auto block h-auto w-full max-w-[440px]" glow />
          </div>
        </div>
      </section>

      {/* Intro — dark page ground, hairline-framed bid-list plate */}
      <section
        className="relative pb-[clamp(80px,10vh,120px)] pt-[clamp(56px,8vh,96px)]"
        aria-label="Subcontractors and vendors"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid items-start gap-[clamp(44px,6vw,90px)] lg:grid-cols-2">
            <div>
              <span className="section-label !mb-0">
                Subcontractors &amp; Vendors
              </span>
              <h2 className="mt-5 max-w-[14em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                Build With Scottsdale&apos;s In-House{" "}
                <em className="font-normal italic text-gold">Contractor</em>
              </h2>
              <p className="mt-7 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                Saddlewood Contracting builds ground-up new construction,
                self-performs framing, and delivers luxury remodels across
                Scottsdale and Paradise Valley. As our pipeline grows, we
                partner with trusted subcontractors and suppliers who share our
                standard of craftsmanship.
              </p>
              <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                Add your company to our bid list and, when a project matching
                your trade goes out for bid, we&apos;ll email you the plans and
                architectural drawings directly. No chasing, no guesswork. Tell
                us what you self-perform below.
              </p>
            </div>

            <div>
              <div className="rounded-[2px] border border-off-white/[0.12] bg-teal-dark p-8 lg:p-10">
                <h3 className="font-heading text-[clamp(22px,2.2vw,26px)] font-medium leading-[1.25] text-off-white">
                  How the bid list works
                </h3>
                <ol className="m-0 mt-7 list-none space-y-6 p-0">
                  {bidListSteps.map((step) => (
                    <li key={step.n} className="flex gap-5">
                      <span className="shrink-0 font-heading text-[20px] font-medium text-gold">
                        {step.n}
                      </span>
                      <div>
                        <p className="text-[15px] font-medium text-off-white">
                          {step.t}
                        </p>
                        <p className="mt-1 text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                          {step.d}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Quiet sheet fragment from the structural set */}
              <figure className="m-0 mt-10 max-w-[360px]" aria-hidden="true">
                <ShearWallSheet className="block h-auto w-full" />
                <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55]">
                  Perforated shear wall detail · S-series
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* The form paints its own cream section; night-on-cream restores the
          accessible-gold section label on the light ground. */}
      <div className="night-on-cream">
        <TradePartnersForm />
      </div>
    </>
  );
}
