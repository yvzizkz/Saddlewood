"use client";

/**
 * About — premium standard. This is the people page, so it opens on the
 * crew: a full-bleed graded still of the crew leads on the active Paradise
 * Valley build, with a play affordance that jumps to the on-site interview
 * reel. No drawings anywhere on this page. The rhythm alternates grounds:
 * media hero, cream story, deep credentials, cream reel, teal close.
 * Copy carried verbatim from the previous version (no em dashes anywhere).
 */

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import Link from "next/link";
import { Phone, Play } from "lucide-react";
import { FullBleedHero } from "@/components/FullBleedHero";
import { ProcoreBadge } from "@/components/ProcoreBadge";
import { VideoReel } from "@/components/VideoReel";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";

const credentials = [
  {
    title: "General Contractor",
    detail: "ROC #305762",
    description: "Full-scope general contracting for residential remodels of any size.",
  },
  {
    title: "HVAC License",
    detail: "ROC #350714",
    description: "We install and service climate systems built for Arizona heat.",
  },
  {
    title: "Electrical License",
    detail: "ROC #350715",
    description: "Licensed electricians on every project. No outside subs needed.",
  },
  {
    title: "Plumbing License",
    detail: "ROC #350716",
    description: "From fixture swaps to full re-pipes, all done in-house.",
  },
];

const values = [
  {
    title: "Craftsmanship First",
    description:
      "We never cut corners. Every joint, every seam, every finish is executed to the highest standard.",
  },
  {
    title: "Client Partnership",
    description:
      "Your home, your vision. We listen first, advise second, and build exactly what you want.",
  },
  {
    title: "Local Expertise",
    description:
      "We know Scottsdale's HOA requirements, permit processes, and architectural styles inside and out.",
  },
];

const serviceAreas = [
  "McCormick Ranch · 85258",
  "Gainey Ranch · 85258",
  "Paradise Valley · 85253",
  "Pinnacle Peak CC · 85255",
];

const goldBtn =
  "inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]";

const lineBtn =
  "inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 px-[26px] py-[14px] text-[12px] font-medium uppercase tracking-[0.08em] text-off-white/80 no-underline transition-colors hover:border-gold hover:text-gold";

export default function AboutContent() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <>
      <FullBleedHero
        media={{
          kind: "image",
          src: "/images/about-crew-poster.jpg",
          alt: "Two Saddlewood crew leads talking on the active steel-build site",
          positionClass: "object-[50%_35%]",
        }}
        label="Saddlewood crew on the active Paradise Valley build"
        eyebrow="About Saddlewood"
        title={
          <>
            Our <em className="font-normal italic text-gold">Story</em>
          </>
        }
        description="Built on a foundation of integrity, quality, and a deep love for transforming Scottsdale homes."
      >
        <a
          href="#crew-reel"
          className="inline-flex items-center gap-2.5 rounded-[2px] border border-gold/60 px-[26px] py-[14px] text-[12px] font-medium uppercase tracking-[0.1em] text-gold no-underline transition-colors hover:border-gold hover:bg-gold/10"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Watch the crew reel
        </a>
      </FullBleedHero>

      {/* Story — cream interlude after the media hero */}
      <section
        className="night-on-cream relative bg-off-white pb-[clamp(80px,10vh,120px)] pt-[clamp(56px,8vh,96px)]"
        aria-label="Our story"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid gap-[clamp(44px,6vw,100px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <motion.div
                variants={variants}
                initial="hidden"
                whileInView="visible"
                viewport={REVEAL_VIEWPORT}
              >
                <span className="section-label !mb-0">Heritage</span>
                <h2 className="mt-5 max-w-[11em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
                  Where Craftsmanship Meets{" "}
                  <em className="font-normal italic text-gold-display">Character</em>
                </h2>
              </motion.div>
              <motion.div
                variants={variants}
                custom={REVEAL_STEP}
                initial="hidden"
                whileInView="visible"
                viewport={REVEAL_VIEWPORT}
              >
                <p className="mt-7 max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light">
                  Saddlewood Contracting was founded with a simple belief:
                  homeowners in Scottsdale&apos;s finest neighborhoods deserve a
                  contractor who treats their home with the same care and
                  attention to detail as if it were their&nbsp;own.
                </p>
                <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light">
                  What sets us apart is our ability to handle every aspect of
                  your remodel{" "}
                  <span className="whitespace-nowrap">in-house</span>. With four
                  active ROC licenses in General, HVAC, Electrical, and
                  Plumbing, we eliminate the coordination headaches that come
                  with managing multiple&nbsp;subcontractors.
                </p>
                <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light">
                  We specialize in the communities we know best: McCormick
                  Ranch, Gainey Ranch, Paradise Valley, and Pinnacle Peak
                  Country Club. This hyper-local focus means we understand the
                  architectural styles, HOA requirements, and design
                  preferences that make each neighborhood unique.
                </p>
                <div className="mt-9 text-[11px] font-medium uppercase tracking-[0.25em] text-gold-accessible">
                  Est. 2007 · Licensed, Bonded &amp; Insured
                </div>
              </motion.div>
            </div>

            {/* Values rail — gold hairlines in place of the old project photo */}
            <motion.div
              variants={variants}
              custom={REVEAL_STEP * 2}
              initial="hidden"
              whileInView="visible"
              viewport={REVEAL_VIEWPORT}
            >
              <span className="section-label !mb-0">Values</span>
              <h3 className="mt-5 font-heading text-[clamp(24px,2.4vw,32px)] font-medium leading-[1.2] tracking-[-0.02em] text-charcoal">
                What Drives Us
              </h3>
              <div className="mt-7 flex flex-col border-t border-gold-accessible/[0.35]">
                {values.map((value) => (
                  <div
                    key={value.title}
                    className="flex flex-1 flex-col justify-center border-b border-gold-accessible/[0.35] py-6"
                  >
                    <h4 className="font-heading text-[21px] font-medium leading-[1.3] text-charcoal">
                      {value.title}
                    </h4>
                    <p className="mt-2 text-[13.5px] leading-[1.7] text-charcoal-light">
                      {value.description}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Credentials — numbered license plates on the deep page ground */}
      <section
        className="relative pb-[clamp(72px,9vh,112px)] pt-[clamp(56px,8vh,96px)]"
        aria-label="Credentials"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <motion.div
            variants={variants}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
          >
            <span className="section-label !mb-0">Credentials</span>
            <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Licensed, Bonded &amp;{" "}
              <em className="font-normal italic text-gold">Insured</em>
            </h2>
          </motion.div>

          <div className="mt-[clamp(40px,6vh,64px)] grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] sm:grid-cols-2 lg:grid-cols-4">
            {credentials.map((c, i) => (
              <motion.div
                key={c.title}
                className="h-full"
                variants={variants}
                custom={i * REVEAL_STEP}
                initial="hidden"
                whileInView="visible"
                viewport={REVEAL_VIEWPORT}
              >
                <div className="flex h-full flex-col bg-teal-dark p-7 lg:p-9">
                  <div className="mb-5 text-[10.5px] font-medium tracking-[0.25em] text-gold">
                    {c.detail}
                  </div>
                  <h3 className="font-heading text-[19px] font-medium leading-[1.3] text-off-white">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                    {c.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Verified on the Procore Network */}
          <motion.div
            className="mt-[clamp(44px,6vh,64px)] flex flex-col items-center gap-4"
            variants={variants}
            custom={REVEAL_STEP}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-off-white/65">
              Verified on the Procore Network
            </p>
            <ProcoreBadge width={168} />
          </motion.div>
        </div>
      </section>

      {/* From the crew — interview reel filmed on an active job site.
          Cream interlude; #crew-reel is the hero play affordance's target. */}
      <section
        id="crew-reel"
        className="night-on-cream relative scroll-mt-24 bg-off-white pb-[clamp(72px,9vh,112px)] pt-[clamp(56px,8vh,96px)]"
        aria-label="From the crew"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid items-center gap-[clamp(44px,6vw,100px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <motion.div
                variants={variants}
                initial="hidden"
                whileInView="visible"
                viewport={REVEAL_VIEWPORT}
              >
                <span className="section-label !mb-0">From the Crew</span>
                <h2 className="mt-6 max-w-[14em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
                  Hear it from the people who{" "}
                  <em className="font-normal italic text-gold-display">build</em> it.
                </h2>
              </motion.div>
              <motion.p
                variants={variants}
                custom={REVEAL_STEP}
                initial="hidden"
                whileInView="visible"
                viewport={REVEAL_VIEWPORT}
                className="mt-7 max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light"
              >
                This reel was filmed with our crew on an active job site, not
                in a studio. Press play to hear them in their own words; the
                sound is on.
              </motion.p>
            </div>

            <motion.div
              variants={variants}
              custom={REVEAL_STEP * 2}
              initial="hidden"
              whileInView="visible"
              viewport={REVEAL_VIEWPORT}
              className="flex lg:justify-center"
            >
              <div className="night-reel w-[min(320px,80vw)]">
                <VideoReel
                  src="/videos/saddlewood-reel-lets-build-together.mp4"
                  poster="/videos/saddlewood-reel-lets-build-together-poster.jpg"
                  label="Let's build together: from the crew on site"
                  aspect="9x16"
                  mode="clickToPlay"
                  className="rounded-none bg-teal-dark"
                />
                <span className="night-reel-chip">
                  Let&apos;s Build Together
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Service area — teal band with gold hairlines, CTA close */}
      <section
        className="relative overflow-hidden border-y border-gold/[0.22] bg-teal py-[clamp(80px,10vh,120px)]"
        aria-label="Service area"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 50% 50%, rgba(200,165,90,0.10), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <motion.div
            variants={variants}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
          >
            <span className="section-label !mb-0">Service Area</span>
            <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Proudly Serving{" "}
              <em className="font-normal italic text-gold">Scottsdale</em>
            </h2>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/[0.68]">
              Our hyper-local focus means deeper expertise and stronger
              relationships in the communities where we work.
            </p>
            <div className="mt-12 grid max-w-[1000px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {serviceAreas.map((area) => (
                <div
                  key={area}
                  className="rounded-[2px] border border-gold/[0.3] bg-off-white/[0.04] px-6 py-4"
                >
                  <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-off-white/85">
                    {area}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href="/contact" className={goldBtn}>
                Schedule Consultation
              </Link>
              <a href="tel:4809996100" className={lineBtn}>
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                (480) 999-6100
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
