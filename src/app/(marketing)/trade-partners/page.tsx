import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { TradePartnersForm } from "@/components/TradePartnersForm";

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
    images: [
      {
        url: "/images/logo.png",
        alt: "Saddlewood Contracting LLC",
      },
    ],
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

export default function TradePartnersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />

      <PageHero
        label="Trade Partners"
        title="Work With Us"
        description="Saddlewood is always looking for reliable subcontractors and vendors. Get on our bid list and we'll send you plans when the right project comes up."
        image="/images/pv-newbuild-steel-frame.jpg"
        imageAlt="Saddlewood Contracting steel framing on a Paradise Valley new-construction site"
      />

      {/* Intro */}
      <section className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px w-8 bg-gold" aria-hidden="true" />
                <span className="section-label">Subcontractors &amp; Vendors</span>
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-8 leading-tight">
                Build With Scottsdale&apos;s In-House Contractor
              </h2>
              <div className="space-y-6 text-charcoal-light font-light leading-relaxed">
                <p>
                  Saddlewood Contracting builds ground-up new construction, self-performs
                  framing, and delivers luxury remodels across Scottsdale and Paradise
                  Valley. As our pipeline grows, we partner with trusted subcontractors and
                  suppliers who share our standard of craftsmanship.
                </p>
                <p>
                  Add your company to our bid list and, when a project matching your trade
                  goes out for bid, we&apos;ll email you the plans and architectural
                  drawings directly — no chasing, no guesswork. Tell us what you
                  self-perform below.
                </p>
              </div>
            </div>

            <div className="bg-cream border border-charcoal-light p-8 lg:p-10">
              <h3 className="font-heading text-2xl font-light text-charcoal mb-6">
                How the bid list works
              </h3>
              <ol className="space-y-6 list-none p-0 m-0">
                {[
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
                ].map((step) => (
                  <li key={step.n} className="flex gap-5">
                    <span className="font-heading text-gold text-xl font-light shrink-0">
                      {step.n}
                    </span>
                    <div>
                      <p className="text-charcoal font-light">{step.t}</p>
                      <p className="text-charcoal-light text-sm font-light leading-relaxed">
                        {step.d}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <TradePartnersForm />
    </>
  );
}
