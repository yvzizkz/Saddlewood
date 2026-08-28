"use client";

/**
 * Hero estate elevation — the Night Blueprint signature drawing.
 * Mountain ridge, moon, three building massings (garage wing, entry tower,
 * living wing), chimney, agaves, and two dimension strings whose figures
 * fade up after the lines land. Geometry ported verbatim from the winning
 * static preview.
 */

import { AnimatedLinework, Figure, Stroke, StrokeCircle } from "./AnimatedLinework";

export interface EstateElevationProps {
  className?: string;
  glow?: boolean;
  /** Seconds before the first stroke starts drawing. */
  delay?: number;
}

export function EstateElevation({
  className,
  glow = true,
  delay = 0,
}: EstateElevationProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 1440 560"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.026}
      duration={1.8}
      figureDelay={1.9}
    >
      {/* datum / ground */}
      <Stroke d="M30 500 H1410" tone="cream" opacity={0.5} duration={2.4} />
      <Stroke d="M180 514 H760" tone="cream" opacity={0.28} duration={2.2} />
      <Stroke d="M900 518 H1360" tone="cream" opacity={0.28} duration={2.2} />
      {/* mountain ridge */}
      <Stroke
        d="M0 352 L150 306 L262 258 L338 282 L432 234 L520 272 L594 260 L700 306 L866 248 L986 286 L1122 230 L1268 284 L1440 326"
        tone="cream"
        opacity={0.28}
        duration={2.4}
      />
      {/* moon */}
      <StrokeCircle cx={1188} cy={112} r={36} width={1} opacity={0.5} />
      {/* left garage wing */}
      <Stroke d="M150 386 H445" duration={2.2} />
      <Stroke d="M150 393 H445" duration={2.2} />
      <Stroke d="M162 393 V500" />
      <Stroke d="M433 393 V500" />
      <Stroke d="M192 424 H403" width={1} opacity={0.5} />
      <Stroke d="M205 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M231 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M257 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M283 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M309 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M335 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M361 424 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M387 424 V500" width={1} opacity={0.5} duration={1.2} />
      {/* center entry tower */}
      <Stroke d="M515 296 H716" />
      <Stroke d="M515 303 H716" />
      <Stroke d="M526 303 V500" />
      <Stroke d="M705 303 V500" />
      <Stroke d="M548 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M568 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M588 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M608 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M628 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M648 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M668 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M688 322 V398" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M598 500 V416 H662 V500" />
      <Stroke d="M650 450 v20" width={1} duration={1.2} />
      <Stroke d="M540 500 V472 H586" width={1} />
      {/* right living wing */}
      <Stroke d="M735 348 H1310" duration={2.4} />
      <Stroke d="M735 356 H1310" duration={2.4} />
      <Stroke d="M762 356 V500" />
      <Stroke d="M1278 356 V500" />
      <Stroke d="M782 378 H1258" width={1} duration={2.2} />
      <Stroke d="M782 440 H1258" width={1} opacity={0.5} duration={2.2} />
      <Stroke d="M782 378 V500" width={1} duration={1.2} />
      <Stroke d="M850 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M918 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M986 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M1054 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M1122 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M1190 378 V500" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M1258 378 V500" width={1} duration={1.2} />
      {/* chimney mass */}
      <Stroke d="M1292 500 V318 H1330 V500" />
      {/* agaves */}
      <Stroke d="M95 500 L73 462" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M95 500 L87 452" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M95 500 L102 449" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M95 500 L117 463" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M95 500 L68 481" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M95 500 L124 482" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M1382 500 L1366 470" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M1382 500 L1377 462" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M1382 500 L1390 461" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M1382 500 L1399 472" tone="cream" opacity={0.5} duration={1.2} />
      {/* dimension strings */}
      <Stroke d="M526 288 V244" tone="dim" duration={1.2} />
      <Stroke d="M705 288 V244" tone="dim" duration={1.2} />
      <Stroke d="M506 252 H725" tone="dim" />
      <Stroke d="M520 258 L532 246" tone="dim" duration={1.2} />
      <Stroke d="M699 258 L711 246" tone="dim" duration={1.2} />
      <Stroke d="M735 340 V296" tone="dim" duration={1.2} />
      <Stroke d="M1310 340 V296" tone="dim" duration={1.2} />
      <Stroke d="M717 304 H1328" tone="dim" duration={2.2} />
      <Stroke d="M729 310 L741 298" tone="dim" duration={1.2} />
      <Stroke d="M1304 310 L1316 298" tone="dim" duration={1.2} />
      {/* figures fade up after lines land */}
      <Figure x={615} y={240} anchor="middle">
        {"18'-0\""}
      </Figure>
      <Figure x={1022} y={292} anchor="middle" delay={0.13}>
        {"57'-6\""}
      </Figure>
      <Figure x={46} y={490} tone="cream" delay={0.26}>
        {"F.F.E. ±0'-0\""}
      </Figure>
    </AnimatedLinework>
  );
}
