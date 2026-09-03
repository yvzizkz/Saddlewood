"use client";

/**
 * Area panoramas, southern set — drawn hero horizons for the four Areas
 * pages nearest Camelback: Paradise Valley, Arcadia, McCormick Ranch and
 * Gainey Ranch. Each is a wide two-ink drafting panorama of the area's
 * real geography (heavy warm-ink structure, brass detail), truthful as
 * art: ridge profiles follow the real mountains and the only elevation
 * figures used are public USGS numbers.
 *
 * Wrap in `.linework-ink` on cream grounds. Quality bar: GarageElevation.
 */

import {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
  StrokeCircle,
} from "./AnimatedLinework";

export interface AreaScapeProps {
  className?: string;
}

/** Main ridge crest: heaviest ink. */
const RIDGE = { tone: "cream", width: 2.4 } as const;
/** Secondary ridge / mid-ground structure. */
const RIDGE_SOFT = { tone: "cream", width: 2.0 } as const;
/** Brass detail: striations, contour ticks, water lines. */
const DETAIL = { tone: "gold", width: 0.7, opacity: 0.9 } as const;
/** Distant ranges: faint brass hairline. */
const FAINT = { tone: "gold", width: 0.6, opacity: 0.5 } as const;

/* ------------------------------------------------------------------ */
/* Paradise Valley — Camelback head + hump, Mummy Mountain to the east */
/* ------------------------------------------------------------------ */

export function ParadiseValleyScape({ className }: AreaScapeProps) {
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
        <pattern id="pv-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Earth hatch below grade — arrives with the annotations */}
      <FigureGroup>
        <rect x="30" y="220" width="900" height="9" fill="url(#pv-earth)" />
      </FigureGroup>

      {/* Distant ranges, over the shoulders */}
      <Stroke d="M30 172 C62 162 96 158 128 164" {...FAINT} />
      <Stroke d="M556 186 C580 178 606 176 632 180" {...FAINT} />

      {/* Camelback: west base up to the head */}
      <Stroke d="M80 218 C120 200 150 160 170 128" {...RIDGE} />
      {/* The head knob — steep, rounded */}
      <Stroke d="M166 132 C172 108 184 96 200 94 C216 92 228 102 234 116" {...RIDGE} />
      {/* Saddle, then the rise to the summit hump */}
      <Stroke d="M230 112 C240 130 252 138 266 136 C292 132 316 96 342 78" {...RIDGE} />
      {/* Summit hump — EL. 2,704 */}
      <Stroke d="M336 82 C352 68 372 64 392 70 C412 76 430 92 448 110" {...RIDGE} />
      {/* The long back, sloping down east to grade */}
      <Stroke d="M442 116 C480 148 520 176 560 196 C580 206 596 212 612 218" {...RIDGE} />

      {/* Rock striations on the head and hump */}
      <Stroke d="M180 116 C188 106 198 100 210 98 M174 128 C184 118 196 112 210 110" {...DETAIL} />
      <Stroke d="M350 92 C362 84 376 80 392 82 M338 106 C352 96 370 90 388 90" {...DETAIL} />
      {/* Contour ticks down the back slope */}
      <Stroke d="M470 138 L488 150 M502 162 L520 174 M534 184 L550 193" {...DETAIL} />

      {/* Mummy Mountain: broad, low, rounded — EL. 2,264 */}
      <Stroke d="M618 218 C652 194 690 170 730 158" {...RIDGE_SOFT} />
      <Stroke d="M724 160 C756 148 792 148 824 162 C856 176 888 198 912 218" {...RIDGE_SOFT} />
      <Stroke
        d="M712 176 L700 188 M742 166 L730 178 M772 160 L760 172 M804 162 L792 174 M836 172 L824 184"
        {...DETAIL}
      />

      {/* Grade: heavy ink, two overlapping passes */}
      <Stroke d="M30 218 H524" tone="cream" width={2.6} />
      <Stroke d="M512 218 H930" tone="cream" width={2.6} />

      {/* Saguaro, far left */}
      <Stroke
        d="M48 218 V146 M48 166 C39 166 36 157 36 148 M36 148 V132 M48 178 C57 178 60 169 60 160 M60 160 V144"
        tone="gold"
        width={1.1}
        opacity={0.95}
      />
      {/* Young saguaro at the Mummy foothill */}
      <Stroke
        d="M642 218 V180 M642 192 C636 192 634 186 634 180 M634 180 V172"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      {/* Agave, right */}
      <Stroke
        d="M896 218 C892 202 886 194 878 188 M896 218 C896 198 894 190 892 182 M896 218 C900 200 906 192 914 186 M896 218 C902 204 910 198 918 196"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      {/* Desert scrub along grade */}
      <Stroke
        d="M150 218 C154 213 159 213 163 218 M406 218 C410 213 415 213 419 218 M718 218 C722 213 727 213 731 218"
        {...DETAIL}
      />

      {/* Annotations: brass, after the linework */}
      <FigurePath d="M378 58 V40 M785 146 V122" tone="gold" width={0.7} />
      <Figure x={378} y={32} anchor="middle" size={10}>
        CAMELBACK MTN · EL. 2,704&apos;
      </Figure>
      <Figure x={785} y={114} anchor="middle" size={10}>
        MUMMY MTN · EL. 2,264&apos;
      </Figure>
      <Figure x={36} y={250} size={10}>
        AREA PANORAMA · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* Arcadia — Camelback close from the south, citrus rows, palms        */
/* ------------------------------------------------------------------ */

/** Citrus grid: three rows in slight perspective, planted regular. */
const ORCHARD_ROWS = [
  { baseY: 190, trunk: 6, r: 4.5, xs: [566, 628, 690, 752, 814, 876] },
  { baseY: 204, trunk: 7, r: 5.5, xs: [596, 658, 720, 782, 844, 906] },
  { baseY: 218, trunk: 8, r: 6.5, xs: [566, 630, 694, 758, 822, 886] },
];

function orchardTrunks(row: (typeof ORCHARD_ROWS)[number]): string {
  return row.xs.map((x) => `M${x} ${row.baseY} V${row.baseY - row.trunk}`).join(" ");
}

export function ArcadiaScape({ className }: AreaScapeProps) {
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
        <pattern id="arcadia-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      <FigureGroup>
        <rect x="30" y="220" width="900" height="9" fill="url(#arcadia-earth)" />
      </FigureGroup>

      {/* Distant range beyond the flats, far right */}
      <Stroke d="M700 172 C740 162 784 158 826 162 C858 166 894 174 924 182" {...FAINT} />

      {/* Camelback from the south: base rising steep */}
      <Stroke d="M60 218 C96 192 120 154 140 112" {...RIDGE} />
      {/* The head rock — looms large, left of center */}
      <Stroke d="M136 120 C146 80 170 58 202 56 C236 54 262 72 276 98" {...RIDGE} />
      {/* Saddle and rise */}
      <Stroke d="M272 94 C282 114 296 124 314 122 C348 118 384 100 418 86" {...RIDGE} />
      {/* Summit hump */}
      <Stroke d="M412 88 C438 76 466 72 492 78 C500 80 506 84 512 88" {...RIDGE} />
      {/* East slope down to grade */}
      <Stroke d="M506 84 C544 96 582 122 618 152 C646 176 674 198 700 218" {...RIDGE} />

      {/* Head striations + slope contour ticks */}
      <Stroke d="M156 100 C168 84 184 74 202 70 M148 122 C160 106 178 94 198 88" {...DETAIL} />
      <Stroke d="M430 96 L448 89 M458 88 L476 82" {...DETAIL} />
      <Stroke d="M560 116 L577 128 M596 142 L613 154 M630 166 L646 178" {...DETAIL} />

      {/* Grade */}
      <Stroke d="M30 218 H500" tone="cream" width={2.6} />
      <Stroke d="M488 218 H930" tone="cream" width={2.6} />

      {/* Citrus orchard: row lines, trunks, round canopies on a grid */}
      <Stroke d="M556 190 H892" tone="gold" width={0.6} opacity={0.45} />
      <Stroke d="M584 204 H916" tone="gold" width={0.6} opacity={0.45} />
      {ORCHARD_ROWS.map((row) => (
        <Stroke
          key={`trunks-${row.baseY}`}
          d={orchardTrunks(row)}
          tone="gold"
          width={0.8}
          opacity={0.9}
        />
      ))}
      {ORCHARD_ROWS.map((row) =>
        row.xs.map((x) => (
          <StrokeCircle
            key={`canopy-${row.baseY}-${x}`}
            cx={x}
            cy={row.baseY - row.trunk - row.r}
            r={row.r}
            tone="gold"
            width={0.7}
            opacity={0.9}
          />
        )),
      )}

      {/* Fan palm rising out of the grove */}
      <Stroke d="M615 218 C612 190 611 158 614 126" tone="cream" width={1.9} />
      <Stroke
        d="M614 126 C600 114 585 109 570 111 M614 126 C605 110 595 102 580 99 M614 126 C613 108 617 95 626 86 M614 126 C626 110 640 103 655 102 M614 126 C627 116 642 114 655 118 M614 126 C599 128 588 134 581 143 M614 126 C629 128 640 134 647 143"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      {/* Second palm, right edge */}
      <Stroke d="M935 218 C933 196 932 172 934 150" tone="cream" width={1.8} />
      <Stroke
        d="M934 150 C922 140 910 136 898 138 M934 150 C926 136 917 130 905 128 M934 150 C934 135 938 124 945 117 M934 150 C944 138 952 134 958 134 M934 150 C921 152 912 157 906 165 M934 150 C946 152 954 158 959 165"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      {/* Scrub at the mountain base */}
      <Stroke
        d="M84 218 C88 213 93 213 97 218 M118 218 C122 213 127 213 131 218"
        {...DETAIL}
      />

      {/* Annotations */}
      <FigurePath d="M202 52 V34" tone="gold" width={0.7} />
      <Figure x={202} y={26} anchor="middle" size={10}>
        CAMELBACK MTN · EL. 2,704&apos;
      </Figure>
      <Figure x={36} y={250} size={10}>
        AREA PANORAMA · ARCADIA
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* McCormick Ranch — lakeside flats, shore trees, McDowells far off    */
/* ------------------------------------------------------------------ */

/** Shore trees: mature canopies along the far bank. */
const SHORE_TREES = [
  { cx: 112, cy: 158, r: 10 },
  { cx: 164, cy: 153, r: 12 },
  { cx: 224, cy: 158, r: 9 },
  { cx: 700, cy: 156, r: 11 },
  { cx: 768, cy: 159, r: 9 },
  { cx: 842, cy: 154, r: 12 },
];

export function McCormickRanchScape({ className }: AreaScapeProps) {
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
        <pattern id="mccormick-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      <FigureGroup>
        <rect x="30" y="220" width="900" height="9" fill="url(#mccormick-earth)" />
      </FigureGroup>

      {/* McDowell range: low, far, serrated brass hairline */}
      <Stroke
        d="M60 152 L108 146 L152 150 L198 140 L242 148 L294 143 L338 149 L392 137 L438 146 L484 142 L532 148 L578 139 L624 147 L676 141 L722 148 L768 138 L814 146 L858 143 L920 150"
        tone="gold"
        width={0.7}
        opacity={0.6}
      />
      {/* Horizon hairline */}
      <Stroke d="M40 160 H920" tone="gold" width={0.6} opacity={0.4} />

      {/* Far shore, two overlapping passes */}
      <Stroke d="M30 174 H520" tone="cream" width={1.4} />
      <Stroke d="M508 174 H930" tone="cream" width={1.4} />

      {/* Mature trees along the shore */}
      <Stroke
        d="M112 174 V168 M164 174 V165 M224 174 V167 M700 174 V167 M768 174 V168 M842 174 V166"
        tone="cream"
        width={1.5}
      />
      {SHORE_TREES.map((t) => (
        <StrokeCircle
          key={`tree-${t.cx}`}
          cx={t.cx}
          cy={t.cy}
          r={t.r}
          tone="cream"
          width={1.5}
        />
      ))}
      {/* Canopy texture */}
      <Stroke
        d="M156 158 C160 150 170 147 176 150 M834 160 C838 151 848 148 854 151"
        tone="gold"
        width={0.6}
        opacity={0.7}
      />

      {/* Lake: long calm water lines, broken */}
      <Stroke d="M60 184 H210 M250 184 H420 M470 184 H600" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M120 192 H300 M360 192 H520 M680 192 H820" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M80 200 H180 M240 200 H380 M560 200 H700 M760 200 H900" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M160 208 H320 M420 208 H540 M640 208 H760" tone="gold" width={0.8} opacity={0.85} />
      {/* Ripple ticks */}
      <Stroke d="M330 188 H346 M540 196 H556 M720 204 H736" tone="gold" width={0.6} opacity={0.7} />

      {/* Golf flatness: gentle mounds at the near bank, and a pin */}
      <Stroke d="M84 218 C132 210 184 210 232 218" tone="cream" width={1.8} />
      <Stroke d="M600 218 C656 209 726 209 788 218" tone="cream" width={1.8} />
      <Stroke d="M520 218 V194" tone="cream" width={1.4} />
      <Stroke d="M520 194 L535 199 L520 204" tone="gold" width={0.9} opacity={0.95} />

      {/* Near bank: heavy ink */}
      <Stroke d="M30 218 H524" tone="cream" width={2.6} />
      <Stroke d="M512 218 H930" tone="cream" width={2.6} />

      {/* Annotations */}
      <FigurePath d="M768 134 V110" tone="gold" width={0.7} />
      <Figure x={768} y={102} anchor="middle" size={10}>
        McDOWELL MOUNTAINS
      </Figure>
      <Figure x={36} y={250} size={10}>
        AREA PANORAMA · McCORMICK RANCH
      </Figure>
    </AnimatedLinework>
  );
}

/* ------------------------------------------------------------------ */
/* Gainey Ranch — lagoon and fan palms, Camelback far on the horizon   */
/* ------------------------------------------------------------------ */

export function GaineyRanchScape({ className }: AreaScapeProps) {
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
        <pattern id="gainey-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      <FigureGroup>
        <rect x="30" y="220" width="900" height="9" fill="url(#gainey-earth)" />
      </FigureGroup>

      {/* Horizon hairline */}
      <Stroke d="M40 160 H920" tone="gold" width={0.55} opacity={0.4} />

      {/* Camelback, small and far: head, then hump */}
      <Stroke
        d="M100 160 C122 150 138 132 148 120 C154 112 164 108 174 110 C184 112 191 120 195 128"
        tone="gold"
        width={0.8}
        opacity={0.7}
      />
      <Stroke
        d="M192 126 C198 134 206 139 215 137 C231 133 247 120 261 112 C273 105 285 105 297 111 C317 121 337 145 353 160"
        tone="gold"
        width={0.8}
        opacity={0.7}
      />

      {/* Lagoon: far water edge, then calm broken water lines */}
      <Stroke d="M60 176 C180 168 320 168 440 176 C520 181 585 189 625 196" tone="cream" width={1.4} />
      <Stroke d="M120 186 H300 M340 186 H480" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M90 196 H230 M280 196 H430 M470 196 H560" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M140 206 H320 M380 206 H520" tone="gold" width={0.8} opacity={0.85} />
      <Stroke d="M320 190 H336 M500 200 H516 M240 210 H256" tone="gold" width={0.6} opacity={0.7} />

      {/* Low golf mounds behind the palms */}
      <Stroke d="M560 218 C606 208 662 206 706 214" tone="cream" width={1.8} />
      <Stroke d="M690 216 C740 204 800 204 852 214" tone="cream" width={1.8} />
      <Stroke d="M836 216 C876 209 910 209 936 215" tone="cream" width={1.8} />

      {/* Fan palm cluster: heavy trunks, brass frond bursts */}
      <Stroke d="M660 218 C657 186 655 152 658 118" tone="cream" width={2} />
      <Stroke
        d="M658 118 C646 108 632 104 618 106 M658 118 C650 104 640 96 626 92 M658 118 C658 102 662 90 670 82 M658 118 C668 104 680 98 694 96 M658 118 C670 110 684 108 696 112 M658 118 C644 118 634 124 628 132 M658 118 C672 120 682 126 688 134"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      <Stroke d="M712 218 C716 182 718 144 714 104" tone="cream" width={2.2} />
      <Stroke
        d="M714 104 C700 92 684 86 668 88 M714 104 C704 88 694 80 678 76 M714 104 C712 86 716 72 726 62 M714 104 C726 88 740 80 756 78 M714 104 C728 94 744 92 758 96 M714 104 C698 106 686 112 678 122 M714 104 C730 106 742 112 750 122"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      <Stroke d="M762 218 C760 190 758 162 762 134" tone="cream" width={1.9} />
      <Stroke
        d="M762 134 C750 124 737 120 724 122 M762 134 C754 120 745 113 733 110 M762 134 C762 119 766 108 773 100 M762 134 C773 121 785 115 797 114 M762 134 C749 136 740 141 734 149 M762 134 C774 136 784 142 790 150"
        tone="gold"
        width={1}
        opacity={0.95}
      />
      {/* Trunk ring ticks */}
      <Stroke
        d="M654 198 H663 M655 180 H664 M656 162 H663 M708 196 H717 M709 172 H718 M710 148 H717 M712 124 H719 M758 198 H766 M757 178 H765 M758 158 H766"
        tone="gold"
        width={0.6}
        opacity={0.7}
      />

      {/* Small agave and scrub at the near bank */}
      <Stroke
        d="M80 218 C77 206 72 200 66 196 M80 218 C80 203 79 197 78 192 M80 218 C83 205 88 199 94 196"
        tone="gold"
        width={0.9}
        opacity={0.95}
      />
      <Stroke
        d="M430 218 C434 213 439 213 443 218 M896 218 C900 213 905 213 909 218"
        {...DETAIL}
      />

      {/* Near bank: heavy ink */}
      <Stroke d="M30 218 H520" tone="cream" width={2.6} />
      <Stroke d="M508 218 H930" tone="cream" width={2.6} />

      {/* Annotations */}
      <FigurePath d="M290 100 V80" tone="gold" width={0.7} />
      <Figure x={290} y={72} anchor="middle" size={10}>
        CAMELBACK MTN
      </Figure>
      <Figure x={36} y={250} size={10}>
        AREA PANORAMA · GAINEY RANCH
      </Figure>
    </AnimatedLinework>
  );
}
