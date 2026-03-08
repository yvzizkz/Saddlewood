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
      {/* Outer double ring */}
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="3" opacity="0.8" />
      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="3" opacity="0.8" />

      {/* Cross lines spanning the ring gap */}
      <line x1="100" y1="1" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5" opacity="0.8" />
      <line x1="100" y1="180" x2="100" y2="199" stroke="currentColor" strokeWidth="2.5" opacity="0.8" />
      <line x1="1" y1="100" x2="20" y2="100" stroke="currentColor" strokeWidth="2.5" opacity="0.8" />
      <line x1="180" y1="100" x2="199" y2="100" stroke="currentColor" strokeWidth="2.5" opacity="0.8" />

      {/* House icon — bold geometric */}
      <path
        d="M100 44L68 70V110H88V90H112V110H132V70Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="miter"
        fill="none"
        opacity="0.9"
      />

      {/* SC letters — bold */}
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="34"
        fontWeight="600"
        fill="currentColor"
        opacity="0.9"
      >
        SC
      </text>

      {/* Curved text - top */}
      <path id="topArc" d="M 25,100 A 75,75 0 0,1 175,100" fill="none" />
      <text fontSize="15" letterSpacing="5.5" fill="currentColor" opacity="0.8" fontFamily="Georgia, serif">
        <textPath href="#topArc" startOffset="50%" textAnchor="middle">
          SADDLEWOOD
        </textPath>
      </text>

      {/* Curved text - bottom */}
      <path id="bottomArc" d="M 25,100 A 75,75 0 0,0 175,100" fill="none" />
      <text fontSize="13" letterSpacing="3.5" fill="currentColor" opacity="0.8" fontFamily="Georgia, serif">
        <textPath href="#bottomArc" startOffset="50%" textAnchor="middle">
          CONTRACTING LLC.
        </textPath>
      </text>
    </svg>
  );
}
