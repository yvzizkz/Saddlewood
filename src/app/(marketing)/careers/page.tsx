import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { CareersForm } from "@/components/CareersForm";

export const metadata: Metadata = {
  title: "Careers | Build With Saddlewood in Scottsdale | Saddlewood",
  description:
    "Saddlewood is hiring in Scottsdale: framing carpenters, an estimating & sales admin, and a part-time bookkeeper. Real projects, steady work, a team that pays attention.",
};

const roles = [
  {
    id: "estimating-admin",
    title: "Estimating & Sales Admin",
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
    type: "Full-time · Field · Scottsdale & Phoenix metro",
    blurb:
      "Self-performing crew on custom homes and structural remodels — slab to trusses, wood and steel. Steady work on real projects for builders who care how it's done.",
    blurbEs:
      "Cuadrilla propia en casas custom y remodelaciones estructurales — de losa a armaduras, madera y acero. Trabajo estable en proyectos reales.",
    points: [
      "Layout, walls, beams, rooflines to plan — tolerances matter here",
      "Experience framing custom residential; steel experience a plus",
      "Se habla español — la mitad de nuestro equipo trabaja en español",
      "Pay matched to what you can do, reviewed against real production",
    ],
  },
];

function jobPostingJsonLd() {
  const base = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    hiringOrganization: {
      "@type": "Organization",
      name: "Saddlewood Contracting LLC",
      sameAs: "https://saddlewoodcontracting.com",
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
    employmentType: "FULL_TIME",
    datePosted: "2026-07-21",
  };
  return roles.map((r) => ({
    ...base,
    title: r.title,
    description: r.blurb,
    employmentType: r.id === "bookkeeper" ? "PART_TIME" : "FULL_TIME",
  }));
}

export default function CareersPage() {
  return (
    <main className="bg-off-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd()) }}
      />
      <section className="bg-teal-dark px-4 sm:px-6 lg:px-12 pt-28 pb-16 text-center">
        <h1 className="font-heading text-4xl lg:text-6xl text-white font-medium leading-[1.1] tracking-[-0.02em]">
          Build with <em className="italic text-gold font-normal">Saddlewood.</em>
        </h1>
        <p className="text-[15px] text-white/60 max-w-[560px] mx-auto font-light leading-relaxed mt-6">
          We&apos;re a Scottsdale builder — luxury remodels, new construction, and a
          self-performing framing crew. We&apos;re small enough that your work is visible
          and growing fast enough that the next role up usually exists.
        </p>
      </section>

      <section className="px-4 sm:px-6 lg:px-12 py-14 max-w-[880px] mx-auto">
        <div className="space-y-10">
          {roles.map((r) => (
            <article key={r.id} id={r.id} className="bg-white border border-stone p-7 sm:p-9">
              <h2 className="font-heading text-2xl text-teal-dark font-medium">{r.title}</h2>
              <p className="text-[12px] tracking-[0.08em] uppercase text-gold-accessible mt-1 mb-4">
                {r.type}
              </p>
              <p className="text-[15px] text-charcoal/80 font-light leading-relaxed">{r.blurb}</p>
              {"blurbEs" in r && r.blurbEs ? (
                <p className="text-[15px] text-charcoal/60 font-light leading-relaxed mt-2 italic">
                  {r.blurbEs}
                </p>
              ) : null}
              <ul className="mt-5 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="text-[14px] text-charcoal/75 font-light leading-relaxed pl-4 border-l-2 border-gold">
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href="#apply"
                className="inline-block mt-7 px-7 py-3 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all"
              >
                Apply below
              </a>
            </article>
          ))}
        </div>

        <div id="apply" className="mt-14 scroll-mt-28">
          <CareersForm />
        </div>

        <div className="mt-12 text-center text-[14px] text-charcoal/60 font-light">
          <p>
            Don&apos;t see your role? Tell us what you do —{" "}
            <a href="mailto:info@saddlewoodcontracting.com?subject=Careers" className="text-teal underline">
              info@saddlewoodcontracting.com
            </a>{" "}
            or{" "}
            <a href="tel:4809996100" className="text-teal underline inline-flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> (480) 999-6100
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
