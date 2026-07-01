/**
 * Procore Network verification badge.
 *
 * Links out to Saddlewood's verified Procore Network profile. This is a
 * self-hosted SVG (next.config has no remotePatterns, so Procore's CDN can't be
 * used through next/image — and a plain <img> keeps it dependency-free).
 *
 * SEO: the link is intentionally DOFOLLOW — we do NOT add rel="nofollow", so
 * link equity flows to the verified Procore profile (the reciprocal of the
 * profile's backlink to saddlewoodcontracting.com). `noopener` is only for the
 * new-tab security boundary.
 */

const PROFILE_URL =
  "https://network.procore.com/p/saddlewood-contracting-llc-paradise-valley";

export function ProcoreBadge({
  className = "",
  width = 148,
}: {
  className?: string;
  width?: number;
}) {
  const height = Math.round((width * 120) / 200); // badge is 200×120

  return (
    <a
      href={PROFILE_URL}
      target="_blank"
      rel="noopener"
      aria-label="Saddlewood Contracting LLC — verified on the Procore Network (opens in a new tab)"
      className={`inline-block transition-opacity hover:opacity-80 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/procore-badge.svg"
        alt="Saddlewood Contracting LLC on the Procore Network"
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
