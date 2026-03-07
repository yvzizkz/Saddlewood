import Image from "next/image";

export function Logo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/images/logo.svg"
      alt="Saddlewood Contracting LLC"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Saddlewood Contracting LLC logo"
    >
      {/* Outer circle */}
      <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle cx="100" cy="100" r="82" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />

      {/* House icon */}
      <path
        d="M100 45L65 75V120H85V95H115V120H135V75L100 45Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />

      {/* SC letters */}
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="28"
        fontWeight="500"
        fill="currentColor"
        opacity="0.8"
      >
        SC
      </text>

      {/* Curved text - top */}
      <path id="topArc" d="M 30,100 A 70,70 0 0,1 170,100" fill="none" />
      <text fontSize="10" letterSpacing="6" fill="currentColor" opacity="0.5" fontFamily="Georgia, serif">
        <textPath href="#topArc" startOffset="50%" textAnchor="middle">
          SADDLEWOOD
        </textPath>
      </text>

      {/* Curved text - bottom */}
      <path id="bottomArc" d="M 30,100 A 70,70 0 0,0 170,100" fill="none" />
      <text fontSize="9" letterSpacing="4" fill="currentColor" opacity="0.5" fontFamily="Georgia, serif">
        <textPath href="#bottomArc" startOffset="50%" textAnchor="middle">
          CONTRACTING LLC.
        </textPath>
      </text>
    </svg>
  );
}
