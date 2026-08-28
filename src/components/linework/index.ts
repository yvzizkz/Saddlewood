/**
 * Night Blueprint linework — self-drawing gold architectural drawings.
 *
 * All components are client components ("use client") built on the shared
 * AnimatedLinework wrapper: strokes draw on (pathLength 0 -> 1) when scrolled
 * into view, dimension figures fade up after the lines land, and everything
 * renders fully drawn and static under prefers-reduced-motion.
 */

import type { ComponentType } from "react";

import { MassingDiagram } from "./MassingDiagram";
import { NeighborhoodPlat } from "./NeighborhoodPlat";
import { PlanFragment } from "./PlanFragment";
import { SteelBeam } from "./SteelBeam";
import { WallSection } from "./WallSection";

export {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
  StrokeCircle,
  StrokeRect,
  LINEWORK_EASE,
} from "./AnimatedLinework";
export type {
  AnimatedLineworkProps,
  FigureGroupProps,
  FigurePathProps,
  FigureProps,
  PreparedLineworkVariants,
  StrokeCircleProps,
  StrokeProps,
  StrokeRectProps,
  StrokeTone,
} from "./AnimatedLinework";

export { EstateElevation } from "./EstateElevation";
export type { EstateElevationProps } from "./EstateElevation";
export { MassingDiagram } from "./MassingDiagram";
export type { MassingDiagramProps } from "./MassingDiagram";
export { WallSection } from "./WallSection";
export type { WallSectionProps } from "./WallSection";
export { SteelBeam } from "./SteelBeam";
export type { SteelBeamProps } from "./SteelBeam";
export { PlanFragment } from "./PlanFragment";
export type { PlanFragmentProps } from "./PlanFragment";
export { NeighborhoodPlat } from "./NeighborhoodPlat";
export type { NeighborhoodPlatProps } from "./NeighborhoodPlat";
export { SurveyHorizon } from "./SurveyHorizon";
export type { SurveyHorizonProps } from "./SurveyHorizon";
export { GarageElevation } from "./GarageElevation";
export type { GarageElevationProps } from "./GarageElevation";
export { KitchenSheet } from "./KitchenSheet";
export type { KitchenSheetProps } from "./KitchenSheet";
export { ShearWallSheet } from "./ShearWallSheet";
export type { ShearWallSheetProps } from "./ShearWallSheet";
export { PlanSketch } from "./PlanSketch";
export type { PlanSketchProps } from "./PlanSketch";
export { DimensionTicks } from "./DimensionTicks";
export type { DimensionTicksProps } from "./DimensionTicks";
export { BlueprintDivider } from "./BlueprintDivider";
export type { BlueprintDividerProps } from "./BlueprintDivider";

/**
 * String-keyed registry for content-driven placement (e.g. service diagrams
 * chosen by a CMS/config field).
 */
export const lineworkRegistry: Record<string, ComponentType<{ className?: string }>> = {
  "plan-fragment": PlanFragment,
  massing: MassingDiagram,
  "wall-section": WallSection,
  "steel-beam": SteelBeam,
  plat: NeighborhoodPlat,
};
