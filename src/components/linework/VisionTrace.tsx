"use client";

/**
 * Perspective trace of the entry-courtyard rendering (vision-entry.jpg),
 * drawn stroke-for-stroke over the image's own geometry so the drawing
 * and the building align 1:1 in the scroll transformation. Traced against
 * the photo in an overlay harness; coordinates are in the image's
 * 1600x902 space. Two-ink standard: heavy ink structure, brass detail.
 */

import { AnimatedLinework, Stroke, StrokeCircle } from "./AnimatedLinework";

export interface VisionTraceProps {
  className?: string;
}

const HEAVY = { tone: "cream", width: 4 } as const;
const MID = { tone: "cream", width: 2.6 } as const;
const DETAIL = { tone: "gold", width: 1.5, opacity: 0.95 } as const;
const FINE = { tone: "gold", width: 1.3, opacity: 0.9 } as const;

export function VisionTrace({ className }: VisionTraceProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 1600 902"
      className={className}
      duration={2.2}
      stagger={0.04}
      figureDelay={2.0}
      // slice, not meet: the photo layer object-covers the frame, so the
      // trace must crop identically or the alignment drifts when the
      // frame's max-height clamps the aspect box.
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Main canopy roof blade */}
      <Stroke d="M415 260 L1052 252" {...HEAVY} />
      <Stroke d="M415 260 L420 300 M1052 252 L1045 310" {...HEAVY} />
      <Stroke d="M420 300 L1045 310" {...HEAVY} />
      {/* Canopy soffit + clerestory band */}
      <Stroke d="M505 318 L1000 330" {...DETAIL} />
      <Stroke d="M560 345 L950 349" {...DETAIL} />

      {/* Entry glass box */}
      <Stroke d="M600 345 V600 M950 349 V600" {...MID} />
      <Stroke
        d="M630 346 V598 M760 347 V592 M880 348 V595"
        {...FINE}
      />
      <Stroke d="M700 347 V592 M820 348 V592" {...DETAIL} />
      <Stroke d="M602 462 H948" {...FINE} />
      {/* Figure at the door */}
      <StrokeCircle cx={806} cy={482} r={7} {...DETAIL} />
      <Stroke d="M806 489 V535 M806 500 L794 516 M806 500 L818 515 M806 535 L797 583 M806 535 L815 583" {...DETAIL} />

      {/* Left wing: fascia, mullions, wall base */}
      <Stroke d="M95 436 L555 392" {...HEAVY} />
      <Stroke d="M95 460 L555 415 M95 436 V460 M555 392 V415" {...HEAVY} />
      <Stroke
        d="M110 462 V608 M255 450 V600 M345 442 V595 M450 432 V592 M520 426 V594"
        {...FINE}
      />
      <Stroke d="M110 572 L553 538" {...FINE} />
      <Stroke d="M95 625 L560 585" {...DETAIL} />

      {/* Right wing volume */}
      <Stroke d="M960 352 L1390 390" {...HEAVY} />
      <Stroke d="M960 374 L1385 412 M960 352 V374 M1390 390 L1385 412" {...HEAVY} />
      <Stroke d="M985 415 V600 M1330 452 V640" {...FINE} />
      <Stroke d="M985 560 L1330 610" {...FINE} />

      {/* Giant cereus cactus */}
      <Stroke d="M1210 700 C1200 560 1198 430 1206 330" {...MID} />
      <Stroke d="M1245 700 C1252 570 1256 460 1250 356" {...MID} />
      <Stroke d="M1160 680 C1150 580 1152 490 1164 424" {...MID} />
      <Stroke d="M1285 690 C1296 590 1298 500 1290 424" {...MID} />
      <Stroke d="M1110 640 C1100 570 1104 520 1118 474 M1330 650 C1340 580 1338 520 1326 474" {...DETAIL} />
      <Stroke d="M1060 600 C1054 550 1060 510 1074 482" {...DETAIL} />

      {/* Paver path */}
      <Stroke d="M462 900 L608 618 M1005 900 L890 618" {...MID} />
      <Stroke d="M608 618 L890 618" {...MID} />
      <Stroke
        d="M478 858 L992 860 M508 800 L962 802 M535 752 L938 754 M556 712 L918 713 M572 678 L903 679 M588 648 L896 649"
        {...FINE}
      />
      {/* Water edges flanking the walkway */}
      <Stroke d="M600 625 L505 900 M893 625 L975 900" {...FINE} />

      {/* Left planters: stepped stone boxes */}
      <Stroke d="M160 650 L455 595 L458 640 L165 700 Z" {...DETAIL} />
      <Stroke d="M60 762 L432 700 L436 756 L60 828 Z" {...DETAIL} />
      {/* Barrels + agaves */}
      <StrokeCircle cx={215} cy={655} r={17} {...FINE} />
      <StrokeCircle cx={298} cy={640} r={15} {...FINE} />
      <StrokeCircle cx={374} cy={624} r={13} {...FINE} />
      <StrokeCircle cx={88} cy={782} r={29} {...FINE} />
      <StrokeCircle cx={192} cy={760} r={25} {...FINE} />
      <StrokeCircle cx={300} cy={736} r={21} {...FINE} />
      <Stroke d="M52 700 l-14 -28 M52 700 l2 -34 M52 700 l16 -26" {...FINE} />

      {/* Right planter row + barrels */}
      <Stroke d="M962 642 L1340 706 M962 642 V700 M962 700 L1300 770" {...DETAIL} />
      <StrokeCircle cx={998} cy={716} r={21} {...FINE} />
      <StrokeCircle cx={1068} cy={732} r={23} {...FINE} />
      <StrokeCircle cx={1148} cy={752} r={25} {...FINE} />

      {/* Right fence rails */}
      <Stroke d="M1382 552 L1592 528 M1382 576 L1594 552 M1382 600 L1596 578" {...FINE} />
      <Stroke d="M1430 540 V608 M1520 532 V596" {...FINE} />
    </AnimatedLinework>
  );
}
