import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { CareersForm } from "@/components/CareersForm";
import { DimensionTicks } from "@/components/linework";

export const metadata: Metadata = {
  title: "Careers | Build With Saddlewood in Scottsdale | Saddlewood",
  description:
    "Saddlewood is hiring in Scottsdale: framing carpenters, an estimating & sales admin, and a part-time bookkeeper. Real projects, steady work, a team that pays attention.",
};

const roles = [
  {
    id: "estimating-admin",
    title: "Estimating & Sales Admin",
    seoTitle: "Estimating & Sales Admin",
    salary: { min: 52000, max: 65000, unit: "YEAR" },
    type: "Full-time · Office / Hybrid · Scottsdale, AZ",
    blurb:
      "Own the front of the pipeline: every lead logged with its source the day it arrives, every finished estimate sent, tracked, and followed up. You keep the machine honest so our estimator can focus on the numbers.",
    points: [
      "Intake every lead (calls, forms, referrals, builder invitations) into our CRM — with the source, every time",
      "Send, log, and follow up on estimates; confirm receipt within two business days",
      "Queue client change requests for pricing — you route, you don't price",
      "Comfortable in a CRM and a spreadsheet; bilingual English/Spanish a plus",
    ],
  },
  {
    id: "bookkeeper",
    title: "Bookkeeper (Part-Time)",
    seoTitle: "Bookkeeper (Part-Time)",
    salary: { min: 28, max: 36, unit: "HOUR" },
    type: "Part-time · Office / Hybrid · Scottsdale, AZ",
    blurb:
      "Keep subs paid on the day we promised and the books tied to reality. QuickBooks reconciliation, sub invoice intake and approval routing, receipt exception follow-ups.",
    points: [
      "QuickBooks Online reconciliation and AP/AR",
      "Subcontractor invoice intake, approval routing, payment runs on a fixed cadence",
      "Weekly receipt exception list — chase the missing job names, close the loop",
      "Construction bookkeeping experience preferred",
    ],
  },
  {
    id: "framing-carpenter",
    title: "Framing Carpenters / Carpinteros de Estructura",
    // Google wants a plain job title in the schema — no slashes, no second
    // language. The bilingual display title stays; only the indexed one changes.
    seoTitle: "Framing Carpenter",
    salary: { min: 24, max: 34, unit: "HOUR" },
    type: "Full-time · Field · Scottsdale & Phoenix metro",
    blurb:
      "Self-performing crew on custom homes and structural remodels — slab to trusses, custom wood and metal stud. Steady work on real projects for builders who care how it's done.",
    blurbEs:
      "Cuadrilla propia en casas custom y remodelaciones estructurales — de losa a armaduras, madera y metal stud. Trabajo estable en proyectos reales.",
    points: [
      "Layout, walls, beams, rooflines to plan — tolerances matter here",
      "Experience framing custom residential; metal stud framing experience a plus",
      "Se habla español — la mitad de nuestro equipo trabaja en español",
      "Pay matched to what you can do, reviewed against real production",
    ],
  },
];

const SITE = "https://saddlewoodcontracting.com";
const DATE_POSTED = "2026-07-21";
/**
 * Google drops JobPosting results once they go stale, and a posting with no
 * validThrough is treated as indefinite and eventually dropped anyway. Push
 * this date forward (or clear the role) whenever the opening is still live.
 */
const VALID_THROUGH = "2026-10-31";

/** Google prefers an HTML description; the bullets are the substance. */
function descriptionHtml(r: (typeof roles)[number]) {
  const items = r.points.map((p) => `<li>${p}</li>`).join("");
  return `<p>${r.blurb}</p><ul>${items}</ul>`;
}

function jobPostingJsonLd() {
  const base = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    hiringOrganization: {
      "@type": "Organization",
      name: "Saddlewood Contracting LLC",
      sameAs: SITE,
      url: SITE,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Scottsdale",
        addressRegion: "AZ",
        addressCountry: "US",
      },
    },
    datePosted: DATE_POSTED,
    validThrough: VALID_THROUGH,
    // Applications are taken by the form on this page, not a third-party board.
    directApply: true,
  };
  return roles.map((r) => ({
    ...base,
    title: r.seoTitle,
    description: descriptionHtml(r),
    employmentType: r.id === "bookkeeper" ? "PART_TIME" : "FULL_TIME",
    identifier: {
      "@type": "PropertyValue",
      name: "Saddlewood Contracting LLC",
      value: r.id,
    },
    url: `${SITE}/careers#${r.id}`,
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: r.salary.min,
        maxValue: r.salary.max,
        unitText: r.salary.unit,
      },
    },
  }));
}

/**
 * The description now carries HTML, so the serialised JSON contains `<`. Left
 * raw, a `</script>` sequence would close the tag early; escaping it is the
 * standard guard for JSON-LD injected via dangerouslySetInnerHTML.
 */
function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function CareersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jobPostingJsonLd()) }}
      />

      {/* Header — dark page ground, centered title block */}
      <section className="relative px-5 pb-16 pt-32 text-center sm:px-8 sm:pt-36">
        {/* Ambient gold glow */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 50% 90%, rgba(200,165,90,0.08), transparent 70%)",
          }}
        />
        <div className="relative">
          <span className="section-label !mb-0 justify-center">Careers</span>
          <h1 className="mx-auto mt-5 font-heading text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-off-white lg:text-6xl">
            Build with{" "}
            <em className="font-normal italic text-gold">Saddlewood.</em>
          </h1>
          <div aria-hidden="true" className="mt-7 flex justify-center">
            <DimensionTicks className="block h-[14px] w-[64px]" />
          </div>
          <p className="mx-auto mt-6 max-w-[560px] text-[15px] leading-[1.8] text-off-white/[0.62]">
            We&apos;re a Scottsdale builder: luxury remodels, new construction,
            and a self-performing framing crew. We&apos;re small enough that
            your work is visible and growing fast enough that the next role up
            usually exists.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[880px] px-5 py-14 sm:px-8">
        <div className="space-y-10">
          {roles.map((r) => (
            <article
              key={r.id}
              id={r.id}
              className="scroll-mt-28 rounded-[2px] border border-off-white/[0.12] bg-teal-dark p-7 sm:p-9"
            >
              <h2 className="font-heading text-2xl font-medium text-off-white">
                {r.title}
              </h2>
              <p className="mb-4 mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
                {r.type}
              </p>
              <p className="text-[15px] leading-[1.8] text-off-white/[0.72]">{r.blurb}</p>
              {"blurbEs" in r && r.blurbEs ? (
                <p className="mt-2 text-[15px] italic leading-[1.8] text-off-white/[0.55]">
                  {r.blurbEs}
                </p>
              ) : null}
              <ul className="mt-5 space-y-2.5">
                {r.points.map((p) => (
                  <li
                    key={p}
                    className="border-l-2 border-gold pl-4 text-[14px] leading-[1.7] text-off-white/[0.65]"
                  >
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href="#apply"
                className="mt-7 inline-block rounded-[2px] bg-gold px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c]"
              >
                Apply below
              </a>
            </article>
          ))}
        </div>

        {/* The form paints its own white panel, so it stays legible on the
            dark ground exactly as shipped. */}
        <div id="apply" className="mt-14 scroll-mt-28">
          <CareersForm />
        </div>

        <div className="mt-12 text-center text-[14px] text-off-white/[0.62]">
          <p>
            Don&apos;t see your role? Tell us what you do:{" "}
            <a
              href="mailto:info@saddlewoodcontracting.com?subject=Careers"
              className="text-gold underline decoration-gold/40 transition-colors hover:decoration-gold"
            >
              info@saddlewoodcontracting.com
            </a>{" "}
            or{" "}
            <a
              href="tel:4809996100"
              className="inline-flex items-center gap-1 text-gold underline decoration-gold/40 transition-colors hover:decoration-gold"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> (480) 999-6100
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
