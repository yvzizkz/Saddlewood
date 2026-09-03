"use client";

/**
 * Area hero panoramas, north sheet set — the McDowell Sonoran Preserve
 * corridor of north Scottsdale drawn in the site's two-ink drafting
 * standard: heavy ink structure (cream), brass detail (gold), poché and
 * earth hatch arriving with the annotations. Real geography, stylized as
 * architectural line art; the only numeric facts drawn are the two public
 * summit elevations (Thompson Peak 3,910 ft, Pinnacle Peak 3,169 ft).
 *
 * Wrap in `.linework-ink` on cream grounds (warm ink + accessible brass);
 * on dark grounds the same tones read as cream structure + gold detail.
 */

import {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
  StrokeCircle,
  StrokeRect,
} from "./AnimatedLinework";

const HEAVY = { tone: "cream", width: 1.8 } as const;
const HEAVIER = { tone: "cream", width: 2.2 } as const;
const DETAIL = { tone: "gold", width: 0.7, opacity: 0.9 } as const;
const FLORA = { tone: "gold", width: 1, opacity: 0.95 } as const;

/* ------------------------------------------------------------------ */
/* Silverleaf — the McDowell foothill canyons                          */
/* ------------------------------------------------------------------ */

export function SilverleafScape({ className }: { className?: string }) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 260"
      className={className}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="silverleaf-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Earth hatch below grade — arrives with the annotations */}
      <FigureGroup>
        <rect x="20" y="234" width="920" height="9" fill="url(#silverleaf-earth)" />
      </FigureGroup>

      {/* Distant preserve crest, broken serrated segments */}
      <Stroke d="M20 106 L88 90 L148 100 L214 76 L272 90" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M262 92 L330 70 L396 86 L452 66 L500 80" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M492 82 L558 62 L648 84 L708 70 L770 88" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M762 90 L828 74 L888 92 L940 82" tone="gold" width={0.6} opacity={0.55} />

      {/* Low moon over the crest */}
      <StrokeCircle cx={882} cy={44} r={13} tone="gold" width={0.8} opacity={0.6} />

      {/* Mid canyon ridges falling toward the viewer, converging on the wash */}
      <Stroke d="M20 148 L96 128 L162 140 L226 120" {...HEAVY} />
      <Stroke d="M218 122 L288 148 L344 166 L404 184" {...HEAVY} />
      <Stroke d="M940 140 L866 122 L804 136 L744 124" {...HEAVY} />
      <Stroke d="M752 126 L694 148 L636 170 L578 188" {...HEAVY} />

      {/* Foreground canyon shoulders, heavier ink */}
      <Stroke d="M20 194 L92 176 L164 188 L240 204" {...HEAVIER} />
      <Stroke d="M232 206 L312 220 L376 232" {...HEAVIER} />
      <Stroke d="M940 188 L862 172 L796 186 L726 202" {...HEAVIER} />
      <Stroke d="M734 200 L662 220 L604 232" {...HEAVIER} />

      {/* Slope hatch ticks on the shoulders */}
      <Stroke d="M120 184 L128 194 M150 186 L158 196 M180 192 L188 202 M210 198 L218 208" tone="gold" width={0.6} opacity={0.7} />
      <Stroke d="M820 180 L812 190 M790 184 L782 194 M760 192 L752 202 M732 198 L724 208" tone="gold" width={0.6} opacity={0.7} />

      {/* Arroyo banks at the canyon mouth */}
      <Stroke d="M468 190 C458 202 452 210 440 218 C430 224 416 229 402 232" tone="gold" width={0.9} opacity={0.95} />
      <Stroke d="M524 192 C520 204 526 212 540 220 C550 226 564 230 578 232" tone="gold" width={0.9} opacity={0.95} />
      <Stroke d="M500 176 C494 184 500 190 494 196" tone="gold" width={0.7} opacity={0.8} />
      <FigurePath d="M494 194 C488 204 492 214 486 224 C483 228 480 230 478 232" dash="4 4" tone="gold" width={0.6} />

      {/* Ground line, heavy ink */}
      <Stroke d="M20 232 H940" tone="cream" width={2.6} />

      {/* Saguaro stand, dense foreground */}
      <Stroke d="M140 232 V150 M140 172 C128 172 125 162 125 154 M125 154 V138 M140 188 C152 188 155 178 155 170 M155 170 V152" tone="cream" width={1.5} />
      <Stroke d="M68 232 V178 M68 194 C60 194 58 187 58 180 M58 180 V170" {...FLORA} />
      <Stroke d="M330 232 V170 M330 188 C321 188 319 180 319 173 M319 173 V160 M330 200 C339 200 341 193 341 186 M341 186 V176" tone="gold" width={1.1} opacity={0.95} />
      <Stroke d="M655 232 V168 M655 186 C646 186 644 178 644 170 M644 170 V158 M655 198 C664 198 666 190 666 184 M666 184 V172" tone="gold" width={1.1} opacity={0.95} />
      <Stroke d="M790 232 V152 M790 172 C778 172 775 163 775 155 M775 155 V140 M790 190 C802 190 805 181 805 173 M805 173 V158" tone="cream" width={1.5} />
      <Stroke d="M900 232 V186 M900 200 C908 200 910 193 910 187 M910 187 V178" {...FLORA} />

      {/* Tiny saguaros up on the ridges, for depth */}
      <Stroke d="M292 148 V134 M292 140 C288 140 287 137 287 134" tone="gold" width={0.7} opacity={0.8} />
      <Stroke d="M700 146 V132 M700 139 C704 139 705 136 705 133" tone="gold" width={0.7} opacity={0.8} />

      {/* Brittlebush domes */}
      <Stroke d="M204 232 C208 222 218 220 222 227 M212 232 C217 223 226 222 230 229" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M588 232 C592 223 601 221 605 228 M596 232 C600 224 609 223 613 230" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M854 232 C858 223 867 221 871 228 M862 232 C866 224 875 223 879 230" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M366 232 C369 225 376 224 380 229" tone="gold" width={0.8} opacity={0.85} />

      {/* Annotations, brass, after the linework */}
      <FigurePath d="M558 62 V40" tone="gold" width={0.7} />
      <Figure x={558} y={34} anchor="middle" size={10}>
        McDOWELL SONORAN PRESERVE
      </Figure>
      <Figure x={28} y={256} size={10}>
        AREA PANORAMA · SILVERLEAF
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* DC Ranch — the McDowell front range, Thompson Peak prominent        */
/* ------------------------------------------------------------------ */

export function DCRanchScape({ className }: { className?: string }) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 260"
      className={className}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="dcranch-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Earth hatch + shaded summit facets — arrive with the annotations */}
      <FigureGroup>
        <rect x="20" y="234" width="920" height="9" fill="url(#dcranch-earth)" />
        <path d="M600 46 L646 80 L602 96 Z" fill="url(#dcranch-earth)" />
        <path d="M646 80 L690 98 L648 118 Z" fill="url(#dcranch-earth)" />
      </FigureGroup>

      {/* Far peaks behind the wall */}
      <Stroke d="M20 118 L96 102 L168 112 L238 96 L300 108" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M700 96 L768 82 L836 100 L900 88 L940 96" tone="gold" width={0.6} opacity={0.55} />

      {/* The front range as a long serrated wall, broken segments */}
      <Stroke d="M20 152 L76 128 L122 142 L170 116 L218 136" tone="cream" width={1.9} />
      <Stroke d="M208 138 L260 110 L306 128 L354 102 L402 122" tone="cream" width={1.9} />
      <Stroke d="M392 124 L450 94 L502 110 L556 70 L600 46" tone="cream" width={2.3} />
      <Stroke d="M600 46 L642 76 L690 96 L740 84 L788 108" tone="cream" width={2.3} />
      <Stroke d="M778 110 L826 90 L872 114 L912 100 L940 114" tone="cream" width={1.9} />

      {/* Thompson Peak antenna masts, two ticks at the summit */}
      <Stroke d="M595 46 V38 M604 44 V36" tone="gold" width={0.8} />

      {/* Rock hatch on the wall faces */}
      <Stroke d="M240 128 L246 138 M282 122 L288 132 M330 116 L336 126" tone="gold" width={0.6} opacity={0.7} />
      <Stroke d="M660 92 L654 102 M700 92 L706 102 M745 92 L739 102" tone="gold" width={0.6} opacity={0.7} />

      {/* Base of the range meeting the bajada */}
      <Stroke d="M20 166 L150 158 L290 168 L430 158 L570 168 L710 158 L850 168 L940 162" tone="gold" width={0.9} opacity={0.9} />

      {/* Gentle bajada contours toward the viewer */}
      <Stroke d="M20 190 C220 182 480 194 700 186 C790 183 880 190 940 186" tone="gold" width={0.7} opacity={0.75} />
      <Stroke d="M20 212 C260 204 560 216 940 206" tone="gold" width={0.7} opacity={0.75} />
      <FigurePath d="M350 168 C360 190 344 210 356 232" dash="5 4" tone="gold" width={0.6} />
      <FigurePath d="M720 166 C712 190 728 210 718 232" dash="5 4" tone="gold" width={0.6} />

      {/* Ground line, heavy ink */}
      <Stroke d="M20 232 H940" tone="cream" width={2.6} />

      {/* Saguaros on the fan */}
      <Stroke d="M95 232 V156 M95 176 C84 176 81 167 81 159 M81 159 V144 M95 192 C106 192 109 183 109 176 M109 176 V160" tone="cream" width={1.5} />
      <Stroke d="M620 232 V172 M620 190 C611 190 609 182 609 175 M609 175 V162 M620 202 C629 202 631 194 631 188 M631 188 V176" tone="gold" width={1.1} opacity={0.95} />
      <Stroke d="M300 232 V190 M300 203 C293 203 291 197 291 191 M291 191 V182" {...FLORA} />
      <Stroke d="M775 232 V188 M775 201 C783 201 785 194 785 188 M785 188 V179" {...FLORA} />

      {/* Cholla, chunky forked arms */}
      <Stroke d="M185 232 V214 M185 220 L176 210 M176 210 L173 202 M185 220 L194 211 M194 211 L198 203 M185 214 L181 205" tone="gold" width={0.9} opacity={0.9} />
      <Stroke d="M505 232 V216 M505 222 L497 213 M497 213 L494 206 M505 222 L513 214 M513 214 L517 207" tone="gold" width={0.9} opacity={0.9} />
      <Stroke d="M875 232 V215 M875 221 L866 212 M866 212 L863 204 M875 221 L883 213 M883 213 L887 205" tone="gold" width={0.9} opacity={0.9} />

      {/* Brittlebush domes */}
      <Stroke d="M402 232 C406 223 415 221 419 228 M410 232 C414 224 423 223 427 230" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M682 232 C686 223 695 221 699 228 M690 232 C694 224 703 223 707 230" tone="gold" width={0.8} opacity={0.85} />

      {/* Annotations, brass, after the linework */}
      <FigurePath d="M610 42 L654 28" tone="gold" width={0.7} />
      <Figure x={660} y={31} size={10}>
        THOMPSON PK · EL. 3,910&apos;
      </Figure>
      <Figure x={28} y={256} size={10}>
        AREA PANORAMA · DC RANCH
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* Grayhawk — high-desert flat, north McDowells right, Pinnacle far    */
/* ------------------------------------------------------------------ */

export function GrayhawkScape({ className }: { className?: string }) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 260"
      className={className}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="grayhawk-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Earth hatch below grade — arrives with the annotations */}
      <FigureGroup>
        <rect x="20" y="234" width="920" height="9" fill="url(#grayhawk-earth)" />
      </FigureGroup>

      {/* Long horizon of the high desert */}
      <Stroke d="M20 150 H560" tone="gold" width={0.6} opacity={0.6} />

      {/* Pinnacle Peak, small on the far left horizon */}
      <Stroke d="M46 150 L60 140 L70 132 L78 120 L84 114 L90 122 L97 132 L106 141 L118 150" tone="cream" width={1.5} />
      <Stroke d="M80 118 L84 110 L89 119" tone="cream" width={1.2} />

      {/* North McDowells to the right, broken segments */}
      <Stroke d="M560 150 L618 126 L666 140 L714 114 L760 132" {...HEAVY} />
      <Stroke d="M750 134 L798 110 L844 130 L888 106 L940 124" {...HEAVY} />
      <Stroke d="M600 118 L664 102 L720 112" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M770 96 L830 84 L884 100" tone="gold" width={0.6} opacity={0.55} />
      <Stroke d="M556 160 L668 154 L780 162 L880 154 L940 160" tone="gold" width={0.8} opacity={0.9} />

      {/* Flat contours of the golf plain */}
      <Stroke d="M20 192 C220 186 460 196 660 190 C780 187 880 194 940 190" tone="gold" width={0.7} opacity={0.75} />
      <Stroke d="M20 214 C300 206 640 220 940 210" tone="gold" width={0.7} opacity={0.75} />
      <FigurePath d="M20 224 C240 218 560 228 940 220" dash="8 6" tone="gold" width={0.6} />

      {/* Low mounds */}
      <Stroke d="M150 232 C186 220 246 220 284 232" tone="cream" width={1.4} />
      <Stroke d="M598 232 C636 221 700 221 738 232" tone="cream" width={1.4} />
      <Stroke d="M420 232 C446 225 474 225 498 232" tone="cream" width={1.4} />

      {/* Flagstick on the near mound */}
      <Stroke d="M462 226 V202 M462 202 L474 206 L462 210" tone="gold" width={0.9} />

      {/* Ground line, heavy ink */}
      <Stroke d="M20 232 H940" tone="cream" width={2.6} />

      {/* Palo verde: airy multi-stem canopies */}
      <Stroke d="M340 232 C336 218 328 206 320 198 M340 232 C341 216 343 204 347 196 M340 232 C346 218 356 208 364 202" tone="gold" width={0.8} opacity={0.9} />
      <Stroke d="M306 202 C314 190 328 186 338 191 M330 192 C338 182 352 181 360 188" tone="gold" width={0.6} opacity={0.8} />
      <Stroke d="M348 194 C356 186 370 186 378 194 M316 208 C322 200 332 197 340 201" tone="gold" width={0.6} opacity={0.8} />
      <Stroke d="M820 232 C816 218 809 208 802 201 M820 232 C822 216 825 206 830 199 M820 232 C826 220 834 211 841 206" tone="gold" width={0.8} opacity={0.9} />
      <Stroke d="M788 205 C796 194 809 190 818 195 M810 196 C818 186 831 185 839 192" tone="gold" width={0.6} opacity={0.8} />
      <Stroke d="M828 198 C836 190 849 190 856 198" tone="gold" width={0.6} opacity={0.8} />
      <Stroke d="M545 232 C542 221 537 213 531 207 M545 232 C547 220 549 212 553 206" tone="gold" width={0.8} opacity={0.9} />
      <Stroke d="M522 210 C529 201 540 198 548 202 M540 203 C547 195 558 194 565 201" tone="gold" width={0.6} opacity={0.8} />

      {/* Saguaro, cholla, brittlebush at the margins */}
      <Stroke d="M905 232 V184 M905 198 C897 198 895 191 895 185 M895 185 V175 M905 210 C912 210 914 204 914 199 M914 199 V190" {...FLORA} />
      <Stroke d="M128 232 V217 M128 223 L120 214 M120 214 L117 207 M128 223 L136 215 M136 215 L140 208" tone="gold" width={0.9} opacity={0.9} />
      <Stroke d="M252 232 C256 224 264 222 268 228 M260 232 C264 225 272 224 276 230" tone="gold" width={0.8} opacity={0.85} />

      {/* Annotations, brass, after the linework */}
      <FigurePath d="M84 110 V84 H126" tone="gold" width={0.7} />
      <Figure x={132} y={87} size={10}>
        PINNACLE PK · EL. 3,169&apos;
      </Figure>
      <Figure x={28} y={256} size={10}>
        AREA PANORAMA · GRAYHAWK
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* Pinnacle Peak — the granite spire, close                            */
/* ------------------------------------------------------------------ */

export function PinnaclePeakScape({ className }: { className?: string }) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 260"
      className={className}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="pinnacle-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Earth hatch + shaded summit facets — arrive with the annotations */}
      <FigureGroup>
        <rect x="20" y="234" width="920" height="9" fill="url(#pinnacle-earth)" />
        <path d="M430 40 L454 60 L432 66 Z" fill="url(#pinnacle-earth)" />
        <path d="M454 60 L474 86 L448 92 Z" fill="url(#pinnacle-earth)" />
      </FigureGroup>

      {/* The spire in heavy ink, broken flank segments */}
      <Stroke d="M130 214 L196 182 L252 160" tone="cream" width={2.3} />
      <Stroke d="M244 162 L306 128 L358 100 L404 64 L430 40" tone="cream" width={2.3} />
      <Stroke d="M430 40 L454 60 L474 86 L508 106" tone="cream" width={2.3} />
      <Stroke d="M500 108 L544 134 L592 160 L648 186 L706 210" tone="cream" width={2.3} />
      <Stroke d="M96 224 L130 214" tone="gold" width={0.8} opacity={0.9} />
      <Stroke d="M706 210 L760 220 L820 226" tone="gold" width={0.8} opacity={0.9} />

      {/* Stacked granite boulders, clustered rounded forms */}
      <StrokeRect x={410} y={56} width={42} height={26} rx={8} tone="cream" strokeW={1.9} />
      <StrokeRect x={398} y={82} width={34} height={24} rx={8} tone="cream" strokeW={1.9} />
      <StrokeRect x={446} y={76} width={30} height={22} rx={7} tone="cream" strokeW={1.9} />
      <StrokeRect x={368} y={106} width={36} height={24} rx={8} tone="cream" strokeW={1.9} />
      <StrokeRect x={296} y={138} width={40} height={26} rx={9} tone="cream" strokeW={1.8} />
      <StrokeRect x={334} y={152} width={30} height={22} rx={8} tone="cream" strokeW={1.8} />
      <StrokeRect x={508} y={120} width={36} height={24} rx={8} tone="cream" strokeW={1.8} />
      <StrokeRect x={548} y={146} width={30} height={20} rx={7} tone="cream" strokeW={1.8} />
      <StrokeRect x={240} y={172} width={34} height={22} rx={8} tone="cream" strokeW={1.8} />
      <StrokeRect x={600} y={172} width={32} height={20} rx={7} tone="cream" strokeW={1.8} />

      {/* Rounded boulder caps */}
      <Stroke d="M282 160 C294 148 314 148 324 160" {...HEAVY} />
      <Stroke d="M478 100 C490 90 506 92 514 102" {...HEAVY} />
      <Stroke d="M582 168 C592 158 608 160 616 170" {...HEAVY} />
      <Stroke d="M196 190 C208 178 228 180 238 192" {...HEAVY} />

      {/* Joint and fracture lines in the granite */}
      <Stroke d="M352 112 L392 132 L428 122" {...DETAIL} />
      <Stroke d="M320 152 L354 172" {...DETAIL} />
      <Stroke d="M462 104 L502 132" {...DETAIL} />
      <Stroke d="M428 66 L446 90" {...DETAIL} />
      <Stroke d="M540 150 L578 172 L614 186" {...DETAIL} />

      {/* Trail contouring the base */}
      <FigurePath
        d="M110 232 C180 222 250 224 310 214 C380 204 420 200 480 198 C560 196 620 206 680 214 C720 219 760 224 800 228"
        dash="5 5"
        tone="gold"
        width={0.7}
      />

      {/* Ground line, heavy ink */}
      <Stroke d="M20 232 H940" tone="cream" width={2.6} />

      {/* Big saguaros, this is saguaro country */}
      <Stroke d="M76 232 V126 M76 156 C62 156 58 144 58 134 M58 134 V112 M76 176 C90 176 94 164 94 156 M94 156 V136" tone="cream" width={1.6} />
      <Stroke d="M852 232 V138 M852 164 C840 164 836 154 836 145 M836 145 V126 M852 184 C864 184 868 174 868 166 M868 166 V148 M852 200 C843 200 840 194 840 188 M840 188 V180" tone="cream" width={1.4} />
      <Stroke d="M174 232 V170 M174 188 C165 188 163 180 163 173 M163 173 V160 M174 202 C183 202 185 194 185 188 M185 188 V176" tone="gold" width={1.1} opacity={0.95} />
      <Stroke d="M742 232 V166 M742 184 C733 184 731 176 731 168 M731 168 V156 M742 198 C751 198 753 190 753 184 M753 184 V172" tone="gold" width={1.1} opacity={0.95} />
      <Stroke d="M918 232 V190 M918 203 C910 203 908 196 908 190 M908 190 V181" {...FLORA} />

      {/* Agave and brittlebush at grade */}
      <Stroke d="M118 232 C114 220 108 214 102 210 M118 232 C118 218 117 212 116 206 M118 232 C122 218 128 212 134 208 M118 232 C124 222 130 218 136 216" tone="gold" width={0.9} opacity={0.9} />
      <Stroke d="M624 232 C628 223 637 221 641 228 M632 232 C636 224 645 223 649 230" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M212 232 C216 224 224 222 228 228 M220 232 C224 225 232 224 236 230" tone="gold" width={0.8} opacity={0.85} />

      {/* Annotations, brass, after the linework */}
      <FigurePath d="M436 36 L478 24" tone="gold" width={0.7} />
      <Figure x={484} y={27} size={10}>
        PINNACLE PK · EL. 3,169&apos;
      </Figure>
      <Figure x={28} y={256} size={10}>
        AREA PANORAMA · PINNACLE PEAK
      </Figure>
    </AnimatedLinework>
  );
}
