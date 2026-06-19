import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getAllSlugs, getProjectBySlug } from "@/data/projects";
import { ProjectGallery } from "@/components/ProjectGallery";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    return {
      title: { absolute: "Project Not Found — Saddlewood Contracting" },
      description: "The project you're looking for could not be found.",
    };
  }

  return {
    title: { absolute: `${project.title} — Saddlewood Contracting` },
    description: project.description,
    alternates: { canonical: `/portfolio/${project.slug}` },
  };
}

export default async function ProjectCaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const eyebrow = (project.category || "Project").toUpperCase();

  return (
    <article className="bg-off-white">
      {/* a. Title block — quiet typography, account for fixed nav */}
      <header className="pt-32 sm:pt-36 lg:pt-40 pb-12 sm:pb-16 lg:pb-20">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="section-label">{eyebrow}</div>
          <h1 className="font-heading text-4xl md:text-5xl lg:text-[56px] font-light text-charcoal leading-[1.1] tracking-[-0.02em] mt-2">
            {project.title}
          </h1>
          <p className="mt-6 text-sm sm:text-[15px] text-charcoal-light font-light tracking-wide">
            {project.location}
            {project.scope.length > 0 && (
              <>
                <span className="mx-3 text-charcoal-light/50" aria-hidden="true">
                  ·
                </span>
                {project.scope.join(" · ")}
              </>
            )}
          </p>
        </div>
      </header>

      {/* b. Hero image (full-bleed) + c. narrative slot + d. body gallery
          — all owned by the client wrapper so the lightbox state can be shared. */}
      <ProjectGallery project={project}>
        <section className="py-20 sm:py-24 lg:py-28 bg-off-white">
          <div className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="font-heading text-xl sm:text-2xl lg:text-[26px] font-light text-charcoal leading-[1.55] italic">
              {project.description}
            </p>

            {(project.scope.length > 0 || project.timeline) && (
              <div className="mt-12 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 text-left max-w-md mx-auto">
                {project.scope.map((item) => (
                  <div
                    key={item}
                    className="text-[13px] text-charcoal-light font-light tracking-wide flex items-baseline gap-2"
                  >
                    <span
                      className="w-1 h-1 rounded-full bg-gold shrink-0 translate-y-[-3px]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </div>
                ))}
                {project.timeline && (
                  <div className="text-[13px] text-charcoal-light font-light tracking-wide flex items-baseline gap-2 sm:col-span-2 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-stone-mid/50">
                    <span className="text-charcoal/60 uppercase tracking-[0.18em] text-[11px]">
                      Timeline
                    </span>
                    <span>{project.timeline}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </ProjectGallery>

      {/* e. Process timeline (conditional) */}
      {project.processSteps && project.processSteps.length > 0 && (
        <section className="py-20 sm:py-28 lg:py-32 bg-cream">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14 sm:mb-20">
              <div className="section-label justify-center">Build Process</div>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mt-2">
                Construction Timeline
              </h2>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 sm:gap-12 lg:gap-14">
              {project.processSteps.map((step, i) => (
                <li key={step.image} className="flex flex-col">
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone">
                    <Image
                      src={step.image}
                      alt={step.label}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-5 flex items-baseline gap-4">
                    <span className="font-heading text-2xl sm:text-3xl text-gold-accessible font-light">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] sm:text-sm text-charcoal tracking-wide">
                      {step.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* f. Before / After (conditional) */}
      {project.beforeImage && project.afterImage && (
        <section className="py-20 sm:py-28 lg:py-32 bg-off-white">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              <figure>
                <span className="block text-[11px] tracking-[0.25em] uppercase text-charcoal-light font-medium mb-3">
                  Before
                </span>
                <div className="relative aspect-[4/3] overflow-hidden bg-stone">
                  <Image
                    src={project.beforeImage}
                    alt={`${project.title} — before`}
                    fill
                    loading="lazy"
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </figure>
              <figure>
                <span className="block text-[11px] tracking-[0.25em] uppercase text-gold-accessible font-medium mb-3">
                  After
                </span>
                <div className="relative aspect-[4/3] overflow-hidden bg-stone">
                  <Image
                    src={project.afterImage}
                    alt={`${project.title} — after`}
                    fill
                    loading="lazy"
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </figure>
            </div>
          </div>
        </section>
      )}

      {/* g. Testimonial (conditional) */}
      {project.testimonial && (
        <section className="py-20 sm:py-28 lg:py-32 bg-off-white">
          <div className="max-w-[820px] mx-auto px-4 sm:px-6 lg:px-8">
            <blockquote className="font-heading text-xl lg:text-[26px] font-normal italic text-teal leading-[1.5] pl-8 border-l-2 border-gold">
              {project.testimonial.quote}
            </blockquote>
            <div className="mt-6 pl-8">
              <div className="text-[11px] tracking-[0.25em] uppercase text-charcoal-light font-medium">
                {project.testimonial.author}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* h1. Conversion CTA — quiet but present, before the back/forward nav */}
      <section className="bg-cream py-20 sm:py-24 lg:py-28">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="font-heading text-2xl sm:text-3xl lg:text-[34px] font-medium text-teal leading-[1.25] tracking-[-0.01em] mb-8">
            Ready to build something like this?
          </p>
          <Link
            href="/contact"
            className="inline-block px-10 py-4 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase rounded-sm no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
          >
            Book Your Consultation
          </Link>
        </div>
      </section>

      {/* h2. Footer nav — quiet */}
      <section className="border-t border-stone-mid/60 py-14 sm:py-16">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <Link
            href="/portfolio"
            className="text-sm text-charcoal-light hover:text-teal transition-colors tracking-wide"
          >
            <span aria-hidden="true">&larr;</span> Back to all work
          </Link>
          <Link
            href="/contact"
            className="text-sm text-charcoal hover:text-gold-accessible transition-colors tracking-wide"
          >
            Start a similar project <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>
    </article>
  );
}
