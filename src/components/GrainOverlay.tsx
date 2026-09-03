/**
 * Film grain over full-bleed media (premium-standard global rule). Held at
 * 3%: at 5% it stacked with the compression noise in the footage and the
 * owner read the heroes as grainy (2026-08-28).
 * Inline SVG turbulence, blended overlay; purely decorative.
 */

const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.9'/%3E%3C/svg%3E\")";

export function GrainOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
      aria-hidden="true"
      style={{ backgroundImage: GRAIN_URI }}
    />
  );
}
