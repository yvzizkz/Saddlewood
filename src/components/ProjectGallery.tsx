"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Project } from "@/data/projects";
import { ProjectLightbox } from "@/components/ProjectLightbox";

interface ProjectGalleryProps {
  project: Project;
  /**
   * Content rendered between the full-bleed hero image and the body gallery.
   * Typically the description / scope block.
   */
  children?: ReactNode;
}

/**
 * Client wrapper for the case-study image experience.
 *
 * Renders the full-bleed hero image, an optional middle slot (passed via
 * `children` from the server page — typically the description + scope),
 * and the vertical body gallery beneath. Owns the lightbox state.
 *
 * The lightbox always works against the full `images[]` set with the
 * heroImage promoted to index 0 — so clicking the hero opens the lightbox
 * at index 0, and clicking the Nth body image opens the lightbox at N.
 */
export function ProjectGallery({ project, children }: ProjectGalleryProps) {
  // Compose the canonical lightbox image list. hero always lives at index 0.
  const lightboxImages = useMemo(() => {
    if (project.images.length === 0) return [project.heroImage];
    if (project.images[0] === project.heroImage) return project.images;
    if (project.images.includes(project.heroImage)) {
      // hero is somewhere else in images[]; promote to front
      return [
        project.heroImage,
        ...project.images.filter((img) => img !== project.heroImage),
      ];
    }
    return [project.heroImage, ...project.images];
  }, [project.heroImage, project.images]);

  // Body gallery skips the hero (already shown above).
  const bodyImages = useMemo(() => lightboxImages.slice(1), [lightboxImages]);

  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((index: number) => {
    setLightboxIndex(index);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      {/* b. Full-bleed hero image */}
      <button
        type="button"
        onClick={() => open(0)}
        aria-label={`View ${project.title} gallery`}
        className="group relative block w-full aspect-[3/2] sm:aspect-[16/9] overflow-hidden bg-stone focus-visible:outline-none"
      >
        <Image
          src={project.heroImage}
          alt={project.title}
          fill
          priority
          sizes="100vw"
          className="object-cover transition-opacity duration-500 group-hover:opacity-95"
        />
      </button>

      {/* c. Slot for narrative/scope (rendered by parent server component) */}
      {children}

      {/* d. Body gallery */}
      {bodyImages.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
          <div className="flex flex-col gap-16 sm:gap-20 lg:gap-24">
            {bodyImages.map((src, i) => {
              const lbIndex = i + 1; // bodyImages start at lightbox index 1
              return (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => open(lbIndex)}
                  aria-label={`View image ${lbIndex + 1} of ${lightboxImages.length}`}
                  className="group relative block w-full aspect-[3/2] overflow-hidden bg-stone focus-visible:outline-none"
                >
                  <Image
                    src={src}
                    alt={`${project.title} — detail ${i + 1}`}
                    fill
                    loading="lazy"
                    sizes="(min-width: 1400px) 1400px, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.01]"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ProjectLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={isOpen}
        onClose={close}
        projectTitle={project.title}
        projectLocation={project.location}
      />
    </>
  );
}
