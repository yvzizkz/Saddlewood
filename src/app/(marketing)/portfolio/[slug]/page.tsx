import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getAllCaseStudySlugs, getCaseStudy } from "@/data/case-studies";
import { CTABanner } from "@/components/CTABanner";
import { SpecTable } from "@/components/SpecTable";
import { TimelinePhases } from "@/components/TimelinePhases";
import {
  MassingDiagram,
  NeighborhoodPlat,
  PlanFragment,
  SteelBeam,
  WallSection,
} from "@/components/linework";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllCaseStudySlugs().map((slug) => ({ slug }));
}

/** First two sentences of narrative[0], verbatim — the lede and the meta description. */
function narrativeLede(paragraph: string): string {
  const two = paragraph.split(". ").slice(0, 2).join(". ");
  return two.endsWith(".") ? two : `${two}.`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) {
    return {
      title: "Case Study Not Found",
      description: "The case study you're looking for could not be found.",
    };
  }

  return {
    // The display titles are "Community · Phase"; a plain suffix keeps the
    // composed tab title to a single "·" separator.
    title: `${study.title} Case Study | Saddlewood Contracting`,
    description: narrativeLede(study.narrative[0] ?? ""),
    alternates: { canonical: `/portfolio/${study.slug}` },
  };
}

/**
 * Drawn hero plate per linework key — the registry components accept only
 * className, so the hero (which needs glow and, for the plat, opacity) maps
 * keys to concrete figures. Captions describe what each drawing depicts.
 */
function heroPlate(key: string): { figure: ReactNode; caption: string } | null {
  switch (key) {
    case "plan-fragment":
      return {
        figure: (
          <PlanFragment className="mx-auto block h-auto w-full max-w-[640px]" glow />
        ),
        caption: "Plan fragment · Great room opening to the pool terrace",
      };
    case "massing":
      return {
        figure: (
          <MassingDiagram className="mx-auto block h-auto w-full max-w-[560px]" glow />
        ),
        caption: "Massing study · Stepped volumes on the ground line",
      };
    case "wall-section":
      return {
        figure: (
          <WallSection className="mx-auto block h-auto w-full max-w-[480px]" glow />
        ),
        caption: "Wall section · Footing to roof line",
      };
    case "steel-beam":
      return {
        figure: (
          <SteelBeam className="mx-auto block h-auto w-full max-w-[480px]" glow />
        ),
        caption: "Structural detail · Steel column at baseplate",
      };
    case "plat":
      return {
        figure: (
          <NeighborhoodPlat
            className="mx-auto block h-auto w-full max-w-[480px]"
            opacity={0.9}
            glow
          />
        ),
        caption: "Survey plat · Lot lines and road alignment",
      };
    default:
      return null;
  }
}

/**
 * Splits the "Community · Phase" display title so the phase carries the gold
 * italic accent (the separator stays with the community). Titles without the
 * separator fall back to accenting the last word.
 */
function splitTitle(title: string): { head: string; accent: string } {
  const parts = title.split(" · ");
  if (parts.length === 2) {
    return { head: `${parts[0]} ·`, accent: parts[1] };
  }
  const words = title.split(" ");
  return {
    head: words.slice(0, -1).join(" "),
    accent: words[words.length - 1] ?? "",
  };
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) {
    notFound();
  }

  const plate = heroPlate(study.linework);
  const { head, accent } = splitTitle(study.title);
  const [lede, ...body] = study.narrative;

  return (
    <article className="relative">
      {/* ---- Title block ---- */}
      <header className="pb-[clamp(40px,6vh,72px)] pt-32 sm:pt-36 lg:pt-40">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          {/* The h1 already carries the community; the eyebrow carries the
              document type and category instead of repeating it. */}
          <span className="section-label !mb-0 flex-wrap">
            <span className="whitespace-nowrap">Case Study</span>
            <span className="text-off-white/50">· {study.category}</span>
          </span>
          <h1 className="mt-6 max-w-[16ch] font-heading text-[clamp(38px,5.4vw,76px)] font-medium leading-[1.08] tracking-[-0.02em] text-off-white">
            {head}{" "}
            <em className="font-normal italic text-gold">{accent}</em>
          </h1>
        </div>
      </header>

      {/* ---- Drawn hero plate ---- */}
      {plate ? (
        <section
          className="pb-[clamp(56px,8vh,96px)]"
          aria-label="Project drawing"
        >
          <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <figure className="m-0">
              <div
                className="border border-off-white/[0.12] px-[clamp(20px,6vw,88px)] py-[clamp(32px,6vh,72px)]"
                aria-hidden="true"
              >
                {plate.figure}
              </div>
              <figcaption className="mt-3.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[10.5px] uppercase tracking-[0.18em] text-off-white/60">
                <span>{plate.caption}</span>
                <span className="text-off-white/40">
                  Saddlewood Contracting · Scottsdale, AZ
                </span>
              </figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      {/* ---- Narrative ---- */}
      <section className="pb-[clamp(64px,9vh,120px)]" aria-label="The story">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">The Story</span>
          {lede ? (
            <p className="mt-7 max-w-[32em] font-heading text-[clamp(19px,2.2vw,24px)] font-medium leading-[1.55] tracking-[-0.01em] text-off-white/85">
              {lede}
            </p>
          ) : null}
          <div className="mt-7 max-w-[65ch] space-y-6">
            {body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="text-[15.5px] leading-[1.8] text-off-white/70"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Colophon ---- */}
      <section className="pb-[clamp(64px,9vh,120px)]" aria-label="Project details">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">Title Block</span>
          <SpecTable specs={study.specs} className="mt-8 max-w-[720px]" />
        </div>
      </section>

      {/* ---- Build sequence ---- */}
      {study.timelinePhases.length > 0 ? (
        <section
          className="pb-[clamp(64px,9vh,120px)]"
          aria-label="Build sequence"
        >
          <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <span className="section-label !mb-0">Build Sequence</span>
            <h2 className="mt-6 font-heading text-[clamp(28px,3.4vw,44px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Phase by <em className="font-normal italic text-gold">phase.</em>
            </h2>
            <TimelinePhases
              phases={study.timelinePhases}
              className="mt-9 max-w-[840px]"
            />
          </div>
        </section>
      ) : null}

      {/* ---- Selected scope ---- */}
      <section className="pb-[clamp(72px,10vh,128px)]" aria-label="Selected scope">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.25em] text-gold">
            Selected Scope
          </div>
          <ul className="mt-5 grid max-w-[960px] list-none grid-cols-1 gap-x-7 gap-y-2.5 p-0 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {study.scope.map((item) => (
              <li
                key={item}
                className="relative pl-5 text-[13.5px] leading-snug text-off-white/80"
              >
                <span
                  className="absolute left-0 top-[0.62em] h-px w-2.5 bg-gold"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>

          {/* Quiet footer nav */}
          <div className="mt-[clamp(56px,8vh,88px)] flex flex-col items-start justify-between gap-5 border-t border-off-white/[0.14] pt-9 sm:flex-row sm:items-center">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 no-underline transition-colors hover:text-gold"
            >
              <ArrowRight
                className="h-3.5 w-3.5 rotate-180"
                aria-hidden="true"
              />
              All case studies
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
            >
              Start a similar project
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <CTABanner />
    </article>
  );
}
