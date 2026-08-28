import type { Metadata } from "next";
import Image from "next/image";

/**
 * Temporary holding page while the site redesign is finished (owner request,
 * 2026-08-28). All marketing routes 307 here via next.config redirects; the
 * portal, review, share, and API routes stay live. Remove by reverting the
 * single "hold" commit when the redesign ships.
 */

export const metadata: Metadata = {
  title: "Saddlewood Contracting",
  description:
    "Saddlewood Contracting, Scottsdale, Arizona. Our new website is under construction. Call (480) 999-6100.",
  robots: { index: false, follow: false },
};

export default function UnderConstructionPage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "#1a2f2f",
        color: "#f5f0e8",
        padding: "48px 24px",
      }}
    >
      <Image
        src="/images/logo-roundel.png"
        alt="Saddlewood Contracting"
        width={110}
        height={110}
        priority
      />
      <h1
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontWeight: 500,
          fontSize: "clamp(30px, 5vw, 48px)",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          maxWidth: "18ch",
          margin: "36px 0 0",
        }}
      >
        A new Saddlewood site is{" "}
        <em style={{ fontStyle: "italic", color: "#c8a55a", fontWeight: 400 }}>
          under construction.
        </em>
      </h1>
      <p
        style={{
          maxWidth: "44ch",
          margin: "20px 0 0",
          fontSize: "16px",
          lineHeight: 1.75,
          color: "rgba(245,240,232,0.72)",
        }}
      >
        We are rebuilding saddlewoodcontracting.com. In the meantime, reach us
        directly. We answer.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "14px",
          justifyContent: "center",
          marginTop: "32px",
        }}
      >
        <a
          href="tel:4809996100"
          style={{
            background: "#c8a55a",
            color: "#1a2f2f",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "15px 28px",
            borderRadius: "2px",
          }}
        >
          (480) 999-6100
        </a>
        <a
          href="mailto:info@saddlewoodcontracting.com"
          style={{
            border: "1px solid rgba(245,240,232,0.35)",
            color: "rgba(245,240,232,0.85)",
            textDecoration: "none",
            fontSize: "13px",
            letterSpacing: "0.06em",
            padding: "14px 26px",
            borderRadius: "2px",
          }}
        >
          info@saddlewoodcontracting.com
        </a>
      </div>
      <p
        style={{
          marginTop: "40px",
          fontSize: "10.5px",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "rgba(245,240,232,0.5)",
        }}
      >
        Scottsdale, Arizona · AZ ROC #305762 · Licensed · Bonded · Insured
      </p>
    </main>
  );
}
