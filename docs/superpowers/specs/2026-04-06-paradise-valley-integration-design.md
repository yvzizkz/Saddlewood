# Paradise Valley Neighborhood Integration

**Date:** 2026-04-06
**Status:** Approved

## Overview

Integrate 19 new Paradise Valley (40th Street) project photos into the Saddlewood Contracting site. This is a luxury whole-home remodel featuring 13 finished interior/exterior shots and 6 construction process photos. Paradise Valley becomes the 4th neighborhood on the site, showcased across all major sections: its own neighborhood page, the portfolio grid, the homepage work showcase, and the homepage neighborhood cards.

## Image Inventory

### Source

`C:\Users\lando\Downloads\40th-20260407T002011Z-3-001\40th\web-ready\optimized\`

All images are pre-optimized (100-770 KB JPG + WebP pairs). We use JPG only since Next.js handles image optimization.

### Finished Shots (13 images)

| Source Name | Target Name | Content |
|---|---|---|
| `portfolio-living-room-chandelier.jpg` | `pv-living-room-chandelier.jpg` | Great room — coffered ceiling, ring chandelier, mountain views, built-in shelving |
| `portfolio-dining-room-beams.jpg` | `pv-dining-room-beams.jpg` | Dining room — exposed beams, bubble chandelier, pool views |
| `portfolio-kitchen-island-wide.jpg` | `pv-kitchen-island-wide.jpg` | Kitchen — massive stone island, coffered ceiling, bar seating |
| `portfolio-kitchen-to-living-angle1.jpg` | `pv-kitchen-to-living-01.jpg` | Kitchen looking toward living room/fireplace |
| `portfolio-kitchen-to-living-angle2.jpg` | `pv-kitchen-to-living-02.jpg` | Kitchen looking toward living room (wider angle) |
| `hero-grand-entry-foyer.jpg` | `pv-entry-foyer.jpg` | Grand entry foyer — exposed beams, arched mirrors, art, oak floors |
| `hero-great-room-interior.jpg` | `pv-great-room-interior.jpg` | Living room — designer sectional, open to kitchen |
| `hero-aerial-sunset-exterior.jpg` | `pv-aerial-sunset.jpg` | Aerial drone shot of property at sunset |
| `feature-wine-wall-glass.jpg` | `pv-wine-wall.jpg` | Glass wine wall with stone backing |
| `feature-wine-cellar-kitchen.jpg` | `pv-wine-cellar-kitchen.jpg` | Wine wall + kitchen island view |
| `feature-kitchen-detail-ovens.jpg` | `pv-kitchen-detail-ovens.jpg` | Kitchen detail — double ovens, built-in display niche |
| `feature-custom-bar-office.jpg` | `pv-custom-bar-office.jpg` | Custom bar/office — dark cabinetry, marble backsplash, leather chairs |
| `feature-master-bedroom-skylight.jpg` | `pv-master-bedroom-skylight.jpg` | Master bedroom with massive skylight |

### Construction Process Shots (6 images)

| Source Name | Target Name | Content |
|---|---|---|
| `process-00-demo-site-prep.jpg` | `pv-process-00-demo.jpg` | Demo and site prep — pool rebar visible |
| `process-01-concrete-slab.jpg` | `pv-process-01-slab.jpg` | Fresh concrete slab pour |
| `process-02-framing-exterior.jpg` | `pv-process-02-framing-ext.jpg` | Exterior framing going up |
| `process-03-framing-interior.jpg` | `pv-process-03-framing-int.jpg` | Interior framing and trusses |
| `process-04-framing-trusses.jpg` | `pv-process-04-trusses.jpg` | Roof truss installation |
| `process-05-framing-crew.jpg` | `pv-process-05-crew.jpg` | Crew working the framing |

## Architecture Changes

### 1. Data Model Update — `src/lib/neighborhoods.ts`

Add optional `processSteps` to `NeighborhoodData`:

```typescript
interface ProcessStep {
  title: string;
  image: string;
  caption: string;
}

interface NeighborhoodData {
  // ...existing fields
  processSteps?: ProcessStep[];
}
```

Add full `paradise-valley` entry with:
- **slug:** `paradise-valley`
- **name:** Paradise Valley
- **fullName:** Paradise Valley
- **zip:** 85253
- **tagline:** "Luxury Reimagined on 40th Street"
- **heroImage:** `/images/pv-aerial-sunset.jpg`
- **description:** 3 paragraphs about Paradise Valley community and Saddlewood's work there
- **features:** 4 bullet points about PV-specific expertise
- **projects:** 13 entries for all finished shots
- **processSteps:** 6 entries for construction timeline
- **testimonials:** 1 placeholder (can be updated later with real testimonial)

### 2. New Page — `src/app/neighborhoods/paradise-valley/page.tsx`

Follows existing neighborhood page pattern (identical structure to `mccormick-ranch/page.tsx`). Pulls data from `neighborhoods["paradise-valley"]`.

### 3. NeighborhoodPage Component Update — `src/components/NeighborhoodPage.tsx`

Add a construction process timeline section that renders when `processSteps` is present. Positioned between the project gallery and testimonials. Design:

- Section heading: "Our Process" with subheading
- Horizontal scrollable timeline on desktop, vertical stack on mobile
- Each step shows: numbered badge, image, title, caption
- Connects steps visually with a line/connector

### 4. Portfolio Grid Update — `src/components/ProjectGrid.tsx`

Add 5 Paradise Valley projects (best shots):
- Living Room with Chandelier (id: 10, category: Living)
- Kitchen Island (id: 11, category: Kitchen)
- Grand Entry Foyer (id: 12, category: Living)
- Glass Wine Wall (id: 13, category: Living)
- Master Bedroom with Skylight (id: 14, category: Living)

Add "Paradise Valley" to `neighborhoodFilters` array.

### 5. Homepage WorkShowcase Update — `src/components/WorkShowcase.tsx`

Replace the 3rd featured project (Pinnacle Peak kitchen) with Paradise Valley entry foyer:
- **image:** `/images/pv-entry-foyer.jpg`
- **category:** Living
- **location:** Paradise Valley
- **title:** "Grand Entry Transformation"

### 6. Homepage NeighborhoodCards Update — `src/components/NeighborhoodCards.tsx`

Add Paradise Valley as 4th card:
- **name:** Paradise Valley
- **zip:** 85253
- **tagline:** "Luxury reimagined on 40th Street"
- **image:** `/images/pv-aerial-sunset.jpg`
- **href:** `/neighborhoods/paradise-valley`

Update grid from `md:grid-cols-3` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.

## Files Changed

| File | Change Type |
|---|---|
| `public/images/pv-*.jpg` (19 files) | New — copied and renamed from source |
| `src/lib/neighborhoods.ts` | Modified — add ProcessStep interface, add paradise-valley data |
| `src/app/neighborhoods/paradise-valley/page.tsx` | New — neighborhood page |
| `src/components/NeighborhoodPage.tsx` | Modified — add process timeline section |
| `src/components/ProjectGrid.tsx` | Modified — add 5 PV projects + filter |
| `src/components/WorkShowcase.tsx` | Modified — swap 1 featured project |
| `src/components/NeighborhoodCards.tsx` | Modified — add PV card, update grid |

## Out of Scope

- WebP images (Next.js Image component handles format optimization)
- Before/After section (no "before" interior shots available)
- The 9 previously uploaded timestamp-named PNG images in `public/images/` (separate project, not Paradise Valley)
