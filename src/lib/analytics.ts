import posthog from "posthog-js";

/**
 * Thin wrapper around posthog.capture that no-ops until PostHog has loaded
 * (e.g. when NEXT_PUBLIC_POSTHOG_KEY is unset, or on the server / before init).
 * Use for funnel events: cta_click, phone_tap, form_started, lead_submitted.
 */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;
  posthog.capture(event, properties);
}
