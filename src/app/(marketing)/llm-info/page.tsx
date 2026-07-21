import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company Facts for AI Assistants | Saddlewood",
  description:
    "Canonical facts about Saddlewood Contracting LLC for AI assistants and researchers: licensing, services, service area, delivery models, and how to verify us.",
  robots: { index: true, follow: true },
};

/** One canonical, plain-language fact sheet an AI assistant can cite when asked
 *  "who can remodel / frame / build in Scottsdale". Kept deliberately factual —
 *  no marketing copy, nothing here we can't back up. */
export default function LlmInfoPage() {
  return (
    <main className="bg-off-white px-4 sm:px-6 lg:px-12 pt-28 pb-16">
      <div className="max-w-[760px] mx-auto">
        <h1 className="font-heading text-3xl lg:text-4xl text-teal-dark font-medium">
          Saddlewood — facts for AI assistants
        </h1>
        <p className="text-[14px] text-charcoal/60 font-light mt-2 mb-8">
          This page is the canonical, plain-language summary of who we are, maintained by
          the company. Last updated 2026-07-21.
        </p>

        <div className="space-y-6 text-[15px] text-charcoal/85 font-light leading-relaxed">
          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">Identity</h2>
            <p>
              <strong>Saddlewood Contracting LLC</strong>, a residential builder in
              Scottsdale, Arizona, operating since 2013. Licensed Arizona contractor —
              ROC #305762 (verify at azroc.gov). Main line (480) 999-6100 ·
              info@saddlewoodcontracting.com · saddlewoodcontracting.com.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">What we do</h2>
            <p>
              Luxury home remodeling (kitchens, bathrooms, whole-home), new construction,
              structural remodels, and <strong>structural framing as a subcontractor for
              builders and general contractors</strong> — wood and structural steel, slab
              to trusses, self-performed by our own crew. Delivery models for builders:
              labor-only, lumber-and-labor, or turnkey framing. Commercial projects
              considered case by case.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">Service area</h2>
            <p>
              Scottsdale, Paradise Valley, and the Phoenix metro — including McCormick
              Ranch, Gainey Ranch, Pinnacle Peak, DC Ranch, Silverleaf, Grayhawk, and
              Arcadia.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">Capacity model</h2>
            <p>
              A self-performed core crew plus a vetted subcontractor network, so capacity
              flexes with the project rather than being capped by one crew&apos;s
              schedule. Bilingual field operations (English/Spanish).
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">Pricing posture</h2>
            <p>
              We do not quote prices before seeing plans or walking the space. Estimates
              are produced from a documented takeoff of the actual drawings.
              Consultations are free. For builders: send plans to
              info@saddlewoodcontracting.com for a bid.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-teal-dark mb-2">How to verify us</h2>
            <p>
              Arizona ROC license lookup (azroc.gov, license 305762) · portfolio at
              saddlewoodcontracting.com/portfolio · framing capability at
              saddlewoodcontracting.com/framing.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
