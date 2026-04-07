# Services & About Page Content Refresh

## Goal

Strengthen the Services and About pages by integrating newly uploaded Paradise Valley project photos and fixing content inconsistencies (missing PV references, CSS bug, misleading image captions).

## New Assets

Seven unique PV project photos uploaded to `public/images/` with timestamp names. Two duplicate pairs to discard.

| Current filename | New filename | Content |
|---|---|---|
| `1773235754659-288-IMG_3229.png` | `pv-kitchen-farmhouse-sink.jpg` | Kitchen with farmhouse sink, gold faucet, brass range |
| `1773235754658-991-IMG_2951.png` | `pv-shower-dual-brass.jpg` | Luxury dual rain shower with brass fixtures, marble tile |
| `1773235754659-29-IMG_3232.png` | `pv-custom-closet.jpg` | Walk-in closet with custom built-in shelving and drawers |
| `1773235754661-381-IMG_3235.png` | `pv-kitchen-sage-cabinets.jpg` | Sage/grey cabinet kitchen with french door fridge |
| `1773235754646-25-download.png` | discard (duplicate of IMG_3236) | White galley kitchen |
| `1773235754660-855-IMG_3235 (1).png` | discard (duplicate of IMG_3235) | Sage kitchen duplicate |
| `1773235754660-432-IMG_3236.png` | discard (duplicate of download) | White galley kitchen duplicate |
| `1773235754659-952-IMG_3228.png` | skip (too soft/blurry for grid) | Kitchen detail, brass range close-up |

## About Page (`src/app/about/page.tsx`)

### 1. Fix CSS bug (line 91)
Remove duplicate responsive classes:
- Before: `text-3xl sm:text-4xl lg:text-3xl sm:text-4xl lg:text-5xl`
- After: `text-3xl sm:text-4xl lg:text-5xl`

### 2. Add Paradise Valley to story copy (line 102)
Update from: "McCormick Ranch, Gainey Ranch, and Pinnacle Peak Country Club"
To: "McCormick Ranch, Gainey Ranch, Paradise Valley, and Pinnacle Peak Country Club"

### 3. Update Service Area section (line 209)
Add "Paradise Valley · 85253" as a 4th card. Update the grid to `sm:grid-cols-2 lg:grid-cols-4` for a clean 4-column layout.

### 4. Replace story section image
- Swap `mcr-bathroom-luxury.jpg` with `pv-shower-dual-brass.jpg` (the renamed PV dual rain shower)
- Remove the misleading "Saddlewood Team" / "Scottsdale, Arizona" overlay text — replace with project attribution: "Paradise Valley" / "40th Street Remodel" or similar

## Services Page (`src/components/ServicesGrid.tsx`)

### 5. Fix feature image caption
The image `mcr-kitchen-island-04.jpg` is a McCormick Ranch kitchen. The caption currently says "Modern living room" (incorrect — we changed it earlier in this session). Revert to kitchen-appropriate caption: "Modern kitchen featuring custom island, premium cabinetry, and designer finishes."

### 6. Add photo grid section
Add a new section below ServicesGrid and above ProcessTimeline in `src/app/services/page.tsx`. Create a new component `ProjectPhotoGrid.tsx`:

- 2x2 responsive grid (1 col on mobile, 2 on sm+)
- 4 images with hover overlay showing caption and neighborhood attribution
- Images used:
  1. `pv-kitchen-farmhouse-sink.jpg` — "Farmhouse sink with brass fixtures"
  2. `pv-shower-dual-brass.jpg` — "Dual rain shower with marble tile"
  3. `pv-custom-closet.jpg` — "Custom walk-in closet with built-ins"
  4. `pv-kitchen-sage-cabinets.jpg` — "Sage cabinetry with integrated appliances"
- All attributed to "Paradise Valley"
- Style: match existing site design language (teal overlays, gold accent text, font-light, section-label pattern)

## Out of Scope

- BeforeAfter component cleanup (user plans to add before photos later)
- Neighborhood page content changes
- Portfolio page updates
- New component animations beyond simple fade-in
