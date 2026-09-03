/**
 * Area panorama registry — maps each neighborhood slug to its drawn hero
 * panorama (the two-ink drafting horizon of that area's real geography).
 * Southern set lives in AreaScapesSouth, northern set in AreaScapesNorth.
 */

import type { ComponentType } from "react";

import {
  DCRanchScape,
  GrayhawkScape,
  PinnaclePeakScape,
  SilverleafScape,
} from "./AreaScapesNorth";
import {
  ArcadiaScape,
  GaineyRanchScape,
  McCormickRanchScape,
  ParadiseValleyScape,
} from "./AreaScapesSouth";

export const areaScapeRegistry: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  "paradise-valley": ParadiseValleyScape,
  arcadia: ArcadiaScape,
  "mccormick-ranch": McCormickRanchScape,
  "gainey-ranch": GaineyRanchScape,
  silverleaf: SilverleafScape,
  "dc-ranch": DCRanchScape,
  grayhawk: GrayhawkScape,
  "pinnacle-peak": PinnaclePeakScape,
};
