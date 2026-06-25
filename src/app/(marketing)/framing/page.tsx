import Link from "next/link";
import Image from "next/image";
import { PageHero } from "@/components/PageHero";
import { CTABanner } from "@/components/CTABanner";

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
    description: "A licensed Arizona framing crew that self-performs — slab to trusses, on schedule.",
    images: [{ url: "/images/pv-newbuild-steel-aerial.jpg", alt: "Aerial view of structural steel framing on a ground-up custom home in Paradise Valley by Saddlewood Contracting" }],
  },
};

export default function FramingPage() {
  return (
    <>
      <PageHero
        label="Framing Subcontractor"
        title="A licensed AZ framing crew that self-performs."
        description="From slab to trusses, we deliver structural precision on schedule. The reliable framing partner for Scottsdale's premier builders."
        image="/images/pv-newbuild-steel-aerial.jpg"
        imageAlt="Aerial view of structural steel framing on a ground-up custom home in Paradise Valley by Saddlewood Contracting"
      />

      {/* On Site Now — Steel Framing Gallery */}
      <section className="bg-off-white py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12 border-b border-stone-mid/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">On Site Now</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start mb-12">
            <div className="lg:col-span-6">
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2 mb-6">
                Structural steel, ground-up — Paradise Valley.
              </h2>
            </div>
            <div className="lg:col-span-6">
              <p className="text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base">
                An active ground-up build we are self-performing; the structural steel skeleton is currently going up. This project is in its framing stage and demonstrates our team&apos;s capacity for complex custom home engineering.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                src: "/images/pv-newbuild-steel-aerial.jpg",
                alt: "Aerial of structural steel roof framing on a Paradise Valley custom home build",
                caption: "Structural steel framing taking shape over a new Paradise Valley estate."
              },
              {
                src: "/images/pv-newbuild-steel-frame.jpg",
                alt: "Steel skeleton erected on the foundation of a Paradise Valley new build",
                caption: "The steel skeleton set on the foundation — self-performed, ground-up."
              },
              {
                src: "/images/pv-newbuild-steel-joists.jpg",
                alt: "Stacked galvanized structural steel members staged on site",
                caption: "Galvanized structural steel staged on site before erection."
              }
            ].map((img, idx) => (
              <div key={idx} className="group">
                <div className="relative aspect-[4/3] overflow-hidden bg-stone mb-4">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <p className="text-charcoal-light text-xs sm:text-sm font-light leading-relaxed">{img.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Frame */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">Capabilities</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2 mb-6">
                Structural framing for custom builds & major additions.
              </h2>
              <p className="text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base">
                Saddlewood provides dedicated structural framing services for custom home builders, general contractors, and architects who demand on-schedule execution and precise tolerances.
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  title: "Custom Homes",
                  description: "Full-scale wood framing for custom luxury estates, from foundation layout to engineered truss installation."
                },
                {
                  title: "Additions & Extensions",
                  description: "Complex tie-ins for structural additions, ensuring seamless transitions and structural load management."
                },
                {
                  title: "Structural Remodels",
                  description: "Wall removals, beam insertions, and roofline reconfigurations matching architectural plans exactly."
                }
              ].map((item, idx) => (
                <div key={idx} className="bg-off-white p-6 border border-stone-mid/30">
                  <h3 className="font-heading text-lg font-light text-charcoal mb-3">{item.title}</h3>
                  <p className="text-charcoal-light text-xs sm:text-sm font-light leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Proof Gallery */}
      <section className="bg-off-white py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12 border-t border-b border-stone-mid/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">Completed Build</span>
          </div>
          <div className="mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-[40px] font-light text-charcoal leading-tight">
              Wood-Framed Process: Slab to Trusses
            </h2>
            <p className="mt-4 text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base max-w-[720px]">
              A retrospective look at a separate, completed 40th Street whole-home build. This wood-framed project demonstrates our structural execution and self-performed crew timeline from slab to roof trusses.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                src: "/images/pv-process-01-slab.jpg",
                alt: "Concrete foundation and slab preparation showing rebar grid",
                title: "01 / Foundation & Slab",
                caption: "Precision concrete work forming the structural footprint."
              },
              {
                src: "/images/pv-process-02-framing-ext.jpg",
                alt: "Exterior wood framing of custom home structure against blue sky",
                title: "02 / Exterior Framing",
                caption: "Heavier structural members and wall plates erected on slab."
              },
              {
                src: "/images/pv-process-03-framing-int.jpg",
                alt: "Interior wood studs framing rooms and hallways",
                title: "03 / Interior Framing",
                caption: "Room configurations and load-bearing partition walls."
              },
              {
                src: "/images/pv-process-04-trusses.jpg",
                alt: "Engineered roof trusses installed on top of framing",
                title: "04 / Roof Trusses",
                caption: "Complex engineered truss layout securing the roofline."
              },
              {
                src: "/images/pv-process-05-crew.jpg",
                alt: "Framing crew members working on top of structural framing",
                title: "05 / In-House Crew",
                caption: "Our dedicated framing carpenters on-site."
              },
              {
                src: "/images/pv-process-00-demo.jpg",
                alt: "Heavy machinery doing demolition and site preparation",
                title: "06 / Demolition & Prep",
                caption: "Clean site clearing before structural building begins."
              }
            ].map((img, idx) => (
              <div key={idx} className="group">
                <div className="relative aspect-[4/3] overflow-hidden bg-stone mb-4">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <h3 className="font-heading text-base font-light text-charcoal mb-1">{img.title}</h3>
                <p className="text-charcoal-light text-xs font-light">{img.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Builders Hire Us */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">The Saddlewood Difference</span>
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.15] tracking-[-0.01em] mt-2 mb-12">
            Structure built to plan, on schedule.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: "Self-Performed",
                desc: "We don't sub out our framing. Our own employees swing the hammers, meaning consistent quality and accountability."
              },
              {
                title: "ROC Licensed",
                desc: "Fully licensed in Arizona (General ROC #305762) for residential building. We pull permits and coordinate inspections."
              },
              {
                title: "Single Crew",
                desc: "The same core crew handles slab, framing, and trusses, eliminating handoff gaps and errors."
              },
              {
                title: "On Schedule",
                desc: "We understand that framing is the critical path. We show up when promised and stay until the inspections pass."
              }
            ].map((item, idx) => (
              <div key={idx} className="border-l border-gold/40 pl-6">
                <h3 className="font-heading text-xl font-light text-charcoal mb-3">{item.title}</h3>
                <p className="text-charcoal-light text-sm font-light leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Builder CTA */}
      <section className="bg-teal-dark py-20 sm:py-24 px-4 sm:px-6 lg:px-12 text-center text-stone">
        <div className="max-w-[820px] mx-auto">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-[36px] font-light text-stone leading-[1.3] tracking-[-0.01em] mb-4">
            Need a reliable framing subcontractor for your next project?
          </h2>
          <p className="text-stone/75 text-[15px] font-light mb-8 max-w-[540px] mx-auto leading-relaxed">
            Send us your plans, engineering sheets, and schedule. We&apos;ll provide a detailed structural framing proposal.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-sm text-stone hover:text-gold transition-colors tracking-[0.05em] border-b border-stone/30 hover:border-gold pb-1"
          >
            Request a framing bid <span aria-hidden="true">&rarr;</span>
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
