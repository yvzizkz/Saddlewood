"use client";

/**
 * Neighborhood landing page, Night Blueprint v2 — no photography. The
 * PageHero carries the NeighborhoodPlat linework figure; every SEO body
 * section (description paragraphs, expertise list, project index,
 * process phases, testimonials, localized CTA) renders as type and
 * hairlines on the dark page ground. Copy comes verbatim from
 * src/lib/neighborhoods.ts and src/data/case-studies.ts.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import type { NeighborhoodData } from "@/lib/neighborhoods";
import { caseStudies, getCaseStudy } from "@/data/case-studies";
import { PageHero } from "@/components/PageHero";
import { NeighborhoodPlat } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

const goldBtn =
  "inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]";

const lineBtn =
  "inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 px-[26px] py-[14px] text-[12px] font-medium uppercase tracking-[0.08em] text-off-white/80 no-underline transition-colors hover:border-gold hover:text-gold";

export function NeighborhoodPage({ data }: { data: NeighborhoodData }) {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  const projects = caseStudies
    .filter((cs) => cs.neighborhood === data.name)
    .map((cs) => ({
      slug: cs.slug,
      title: cs.title,
      category: cs.category,
      description: (cs.narrative[0] ?? "").split(". ")[0] + ".",
    }));
  // The framing case study carries the real six-phase build sequence;
  // only Paradise Valley surfaces it.
  const processSteps =
    data.slug === "paradise-valley"
      ? getCaseStudy("fortieth-street-breaking-ground")?.timelinePhases?.map(
          (p) => ({ label: p.phase }),
        )
      : undefined;

  return (
    <>
      <PageHero
        label={`Service Area · ${data.zip}`}
        title={`Remodeling in ${data.fullName}`}
        description={data.tagline}
        linework={<NeighborhoodPlat className="block h-auto w-full" opacity={0.5} />}
      />

      {/* About — the SEO body copy, on the dark page ground */}
      <section
        className="relative py-[clamp(80px,10vh,128px)]"
        aria-label={`About remodeling in ${data.name}`}
      >
        <div className="relative mx-auto grid w-full max-w-[1240px] gap-[clamp(44px,6vw,96px)] px-5 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <motion.div
            variants={revealVariants}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            <span className="section-label !mb-0">About</span>
            <h2 className="mt-6 max-w-[14em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Why Saddlewood for{" "}
              <em className="font-normal italic text-gold">{data.name}?</em>
            </h2>
            <div className="mt-8 space-y-5">
              {data.description.map((p, i) => (
                <p
                  key={i}
                  className="max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70"
                >
                  {p}
                </p>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="space-y-6"
            variants={revealVariants}
            custom={0.14}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            {/* Expertise ledger — hairline frame instead of a photo card */}
            <div className="rounded-[2px] border border-off-white/[0.14] p-8 lg:p-10">
              <h3 className="font-heading text-[24px] font-medium leading-[1.25] tracking-[-0.02em] text-off-white">
                Our {data.name} Expertise
              </h3>
              <ul className="mt-7 list-none space-y-0 p-0">
                {data.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-4 border-b border-off-white/[0.1] py-4 last:border-b-0"
                  >
                    <span
                      className="mt-[3px] h-4 w-px shrink-0 bg-gold"
                      aria-hidden="true"
                    />
                    <span className="text-[13.5px] leading-[1.7] text-off-white/[0.72]">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Consultation card — teal ground with gold hairline */}
            <div className="relative overflow-hidden rounded-[2px] border border-gold/[0.28] bg-teal p-8 lg:p-10">
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(ellipse 70% 80% at 50% 100%, rgba(200,165,90,0.1), transparent 70%)",
                }}
              />
              <div className="relative">
                <h3 className="font-heading text-[21px] font-medium leading-[1.3] text-off-white">
                  Ready to start your {data.name} project?
                </h3>
                <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/[0.68]">
                  Schedule your free, no-obligation design consultation today.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/contact" className={goldBtn + " text-center"}>
                    Schedule Consultation
                  </Link>
                  <a href="tel:4809996100" className={lineBtn + " justify-center"}>
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    (480) 999-6100
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Project index — the photo gallery replaced by a Fraunces ledger
          of the same case studies, keeping the internal links */}
      {projects.length > 0 && (
        <section
          className="relative py-[clamp(80px,10vh,128px)]"
          aria-label={`${data.name} projects`}
        >
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <motion.div
              variants={revealVariants}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Projects</span>
              <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                {data.name} <em className="font-normal italic text-gold">Projects</em>
              </h2>
            </motion.div>

            <div className="mt-[clamp(36px,5vh,60px)] border-t border-off-white/[0.12]">
              {projects.map((project, i) => (
                <motion.div
                  key={project.slug}
                  variants={revealVariants}
                  custom={Math.min(i, 4) * 0.08}
                  initial={initial}
                  whileInView="visible"
                  viewport={viewport}
                >
                  <Link
                    href={`/portfolio/${project.slug}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-2 border-b border-off-white/[0.12] py-6 no-underline transition-all duration-500 hover:border-gold/60 hover:pl-2.5 md:grid-cols-[auto_minmax(0,0.55fr)_minmax(0,0.45fr)_auto]"
                  >
                    <span className="text-[10.5px] font-medium tracking-[0.2em] text-gold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-heading text-[clamp(21px,2.2vw,28px)] font-medium leading-[1.25] tracking-[-0.02em] text-off-white transition-colors duration-500 group-hover:text-gold">
                        {project.title}
                      </span>
                      <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.22em] text-gold/80">
                        {project.category}
                      </span>
                    </span>
                    <span className="col-start-2 text-[13px] leading-[1.7] text-off-white/[0.62] md:col-start-3 md:self-center">
                      {project.description}
                    </span>
                    <ArrowRight
                      className="hidden h-4 w-4 self-center text-off-white/40 transition-colors duration-500 group-hover:text-gold md:block"
                      aria-hidden="true"
                    />
                  </Link>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="mt-10"
              variants={revealVariants}
              custom={0.1}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 no-underline transition-colors hover:text-gold"
              >
                View All Projects
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </motion.div>
          </div>
        </section>
      )}

      {/* Construction process — phase ledger, no photography */}
      {processSteps && processSteps.length > 0 && (
        <section
          className="relative py-[clamp(80px,10vh,128px)]"
          aria-label="Construction process"
        >
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <motion.div
              variants={revealVariants}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Our Process</span>
              <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                From <em className="font-normal italic text-gold">Ground Up</em>
              </h2>
              <p className="mt-5 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
                This {data.name} project showcases our full-scope capabilities,
                from demolition through luxury finishes, every phase handled by
                our in-house licensed team.
              </p>
            </motion.div>

            <div className="mt-[clamp(36px,5vh,60px)] grid grid-cols-1 gap-x-[clamp(40px,6vw,96px)] sm:grid-cols-2 lg:grid-cols-3">
              {processSteps.map((step, i) => (
                <motion.div
                  key={step.label}
                  className="flex items-baseline gap-5 border-t border-off-white/[0.12] py-6"
                  variants={revealVariants}
                  custom={(i % 3) * 0.1}
                  initial={initial}
                  whileInView="visible"
                  viewport={viewport}
                >
                  <span className="text-[10.5px] font-medium tracking-[0.2em] text-gold tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-[clamp(19px,1.8vw,23px)] font-medium leading-[1.3] tracking-[-0.01em] text-off-white">
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials — renders once real quotes land in the data */}
      {data.testimonials.length > 0 && (
        <section
          className="relative py-[clamp(80px,10vh,128px)]"
          aria-label={`${data.name} homeowner stories`}
        >
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <motion.div
              variants={revealVariants}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Stories</span>
              <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                From {data.name}{" "}
                <em className="font-normal italic text-gold">Homeowners</em>
              </h2>
            </motion.div>

            <div className="mt-[clamp(36px,5vh,60px)] grid grid-cols-1 gap-x-[clamp(40px,6vw,96px)] gap-y-10 md:grid-cols-2">
              {data.testimonials.map((t, i) => (
                <motion.blockquote
                  key={t.name}
                  className="m-0 border-l border-gold/60 py-2 pl-8"
                  variants={revealVariants}
                  custom={(i % 2) * 0.12}
                  initial={initial}
                  whileInView="visible"
                  viewport={viewport}
                >
                  <p className="font-heading text-[clamp(19px,1.9vw,24px)] font-normal italic leading-[1.5] text-off-white/[0.88]">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <footer className="mt-6">
                    <p className="text-[14px] text-off-white">{t.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gold/80">
                      {t.project} · {data.name}
                    </p>
                  </footer>
                </motion.blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Localized CTA — teal band with gold hairlines */}
      <section
        className="relative overflow-hidden border-y border-gold/[0.22] bg-teal px-5 py-[clamp(88px,11vh,140px)] text-center sm:px-8"
        aria-label="Call to action"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 50% 50%, rgba(200,165,90,0.10), transparent 70%)",
          }}
        />
        <motion.div
          className="relative"
          variants={revealVariants}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <h2 className="font-heading text-[clamp(38px,5vw,64px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
            Let&apos;s Talk About Your
            <br />
            <em className="font-normal italic text-gold">{data.name} Home</em>
          </h2>
          <p className="mx-auto mt-6 max-w-[520px] text-[15px] leading-[1.8] text-off-white/[0.68]">
            Schedule your free consultation and discover what Saddlewood can do
            for your {data.name} property.
          </p>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
            <Link href="/contact" className={goldBtn}>
              Schedule Consultation
            </Link>
            <a href="tel:4809996100" className={lineBtn}>
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              (480) 999-6100
            </a>
          </div>
        </motion.div>
      </section>
    </>
  );
}
