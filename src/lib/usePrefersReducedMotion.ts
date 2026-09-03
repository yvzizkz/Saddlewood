"use client";

/**
 * Hydration-safe prefers-reduced-motion hook.
 *
 * framer-motion's `useReducedMotion()` reads the media query synchronously on
 * the first client render. Statically generated pages are rendered on the
 * server with the preference OFF, so for a reduced-motion visitor the first
 * client render disagrees with the server HTML — and React hydration does not
 * patch attribute differences. The result: linework strokes stay at the
 * server-rendered hidden state (stroke-dasharray "0 1") and VideoReel never
 * gains its native controls.
 *
 * This hook returns `false` during SSR and the hydration pass (matching the
 * server markup), then re-renders with the real preference — a genuine
 * post-hydration render that patches the DOM and remounts branched elements.
 * It also tracks live changes to the OS setting.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
