"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ProjectLightboxProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  projectLocation: string;
}

const INACTIVITY_MS = 2000;
const SWIPE_THRESHOLD = 50;

export function ProjectLightbox({
  images,
  initialIndex,
  isOpen,
  onClose,
  projectTitle,
  projectLocation,
}: ProjectLightboxProps) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);

  if (isOpen !== prevIsOpen || (isOpen && initialIndex !== prevInitialIndex)) {
    setPrevIsOpen(isOpen);
    setPrevInitialIndex(initialIndex);
    if (isOpen && (!prevIsOpen || initialIndex !== prevInitialIndex)) {
      setIndex(initialIndex);
      setChromeVisible(true);
    }
  }

  const total = images.length;
  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % total);
  }, [total]);

  const armChromeTimer = useCallback(() => {
    setChromeVisible(true);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setChromeVisible(false);
    }, INACTIVITY_MS);
  }, []);

  // Body scroll lock + focus management while open
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the close button so keyboard interactions are predictable
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const rafHandle = requestAnimationFrame(() => {
      armChromeTimer();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      window.clearTimeout(focusTimer);
      cancelAnimationFrame(rafHandle);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, armChromeTimer]);

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        armChromeTimer();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        armChromeTimer();
      } else if (e.key === "Tab") {
        // Trap focus within the dialog
        const root = overlayRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, goPrev, goNext, armChromeTimer]);

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) goNext();
      else goPrev();
      armChromeTimer();
    }
    touchStartX.current = null;
  };

  if (total === 0) return null;

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: "easeOut" as const };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label={projectTitle}
          className="fixed inset-0 z-50 bg-teal-dark/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          onMouseMove={armChromeTimer}
          onTouchStart={(e) => {
            armChromeTimer();
            handleTouchStart(e);
          }}
          onTouchEnd={handleTouchEnd}
        >
          {/* Image */}
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 md:p-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={images[index]}
                className="relative w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              >
                <Image
                  src={images[index]}
                  alt={`${projectTitle} — image ${index + 1} of ${total}`}
                  fill
                  className="object-contain select-none"
                  sizes="100vw"
                  priority
                  draggable={false}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Top chrome — counter + close */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6 transition-opacity duration-300 ${
              chromeVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="pointer-events-auto text-white/40 text-xs sm:text-sm tracking-[0.2em] font-light">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close lightbox"
              className="pointer-events-auto w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-white/80 hover:text-gold focus-visible:text-gold transition-colors"
            >
              <X className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
            </button>
          </div>

          {/* Prev / Next */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => {
                  goPrev();
                  armChromeTimer();
                }}
                aria-label="Previous image"
                className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-white/70 hover:text-gold focus-visible:text-gold bg-black/0 hover:bg-black/20 rounded-full transition-all duration-300 ${
                  chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <ChevronLeft className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  goNext();
                  armChromeTimer();
                }}
                aria-label="Next image"
                className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-white/70 hover:text-gold focus-visible:text-gold bg-black/0 hover:bg-black/20 rounded-full transition-all duration-300 ${
                  chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <ChevronRight className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Bottom caption */}
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6 transition-opacity duration-300 ${
              chromeVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="text-white/70 text-xs sm:text-sm font-light tracking-wide text-center">
              <span className="font-heading italic">{projectTitle}</span>
              <span className="mx-2 text-white/30">—</span>
              <span>{projectLocation}</span>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
