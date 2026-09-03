> SUPERSEDED (2026-08-27): the image pipeline and photo hero were removed in the Night Blueprint photo-free redesign. Kept for history.

# Dynamic Hero Slideshow + Warm Modern Theme Refresh

**Date:** 2026-04-06
**Status:** Approved

## Overview

Two related changes: (1) Replace the static homepage hero image with a crossfading slideshow of 4 Paradise Valley photos, and (2) refresh the site's color palette, typography, and component styling to a "warm modern" aesthetic that matches the luxury feel of the new project photography.

## 1. Homepage Hero Slideshow

### Images (in rotation order)

1. `/images/pv-entry-foyer.jpg` — Grand entry foyer with exposed beams
2. `/images/pv-living-room-chandelier.jpg` — Great room with ring chandelier and mountain views
3. `/images/pv-kitchen-island-wide.jpg` — Stone kitchen island with coffered ceiling
4. `/images/pv-aerial-sunset.jpg` — Aerial drone shot at sunset

### Behavior

- Images crossfade with a ~1 second CSS opacity transition
- Auto-cycles every 6 seconds
- All 4 images rendered in the DOM and preloaded (total ~1.2MB, acceptable for hero)
- No navigation dots or arrows — clean, uncluttered luxury feel
- Timer pauses when the browser tab is not visible (`document.visibilitychange`)
- First image gets `priority` prop for LCP optimization

### Implementation

Update `src/components/HeroSection.tsx`:
- Define an array of `{ src, alt }` image objects
- `useState<number>` for the active index
- `useEffect` with `setInterval(6000)` to advance the index, with `visibilitychange` listener to pause/resume
- Stack all 4 `<Image>` components with `absolute inset-0`, toggling between `opacity-0` and `opacity-100` with `transition-opacity duration-1000`
- Only the first image gets `priority={true}`, others get `loading="eager"`

## 2. Warm Modern Theme Refresh

### Color Palette

Update CSS custom properties in `src/app/globals.css`:

| CSS Variable | Current Value | New Value | Notes |
|---|---|---|---|
| `--teal-dark` | `#0F2530` | `#1a2f2f` | Warmer dark green, less blue |
| `--teal` | `#1B3A4B` | `#2d4a4a` | Warm teal, pairs with gold |
| `--teal-90` | `rgba(27,58,75,0.9)` | `rgba(45,74,74,0.9)` | Matches new --teal |
| `--gold` | `#C49A3C` | `#c8a55a` | Richer, less brassy |
| `--off-white` | `#FAFAF7` | `#f5f0e8` | Warmer cream |
| `--background` | `#FAFAF7` | `#f5f0e8` | Matches off-white |
| `--cream` | `#F9F6F0` | `#ede6d8` | Sand tone, desert-inspired |
| `--stone` | `#F5F0E8` | `#e2dbd0` | Warm stone, matches PV interiors |
| `--stone-mid` | `#EDE6DA` | `#d9d0c3` | Proportionally warmer |
| `--charcoal` | `#2A2A2A` | `#2c2926` | Warm charcoal, brown undertone |
| `--foreground` | `#2A2A2A` | `#2c2926` | Matches charcoal |

Colors not being changed: `--gold-accessible` (`#8B6914`), `--gold-muted` (`#B8924A`), `--charcoal-light` (`#5A5A5A`). These will be verified after the primary palette update and adjusted only if contrast or harmony requires it.

### Typography

- Hero heading: increase from `text-[56px]` to `text-[64px]` on `lg:` breakpoint
- Section labels (`.section-label` or equivalent): increase letter-spacing from `0.2em` to `0.25em`
- Body text sections: increase line-height where `leading-relaxed` is used — no change needed since Tailwind's `leading-relaxed` is already `1.625`

### Component Styling

**Buttons:**
- Add `rounded-sm` to primary CTA buttons (gold buttons) for subtle rounding
- Increase padding slightly: `px-8 py-3.5` → `px-10 py-4` on hero CTAs only

**Gradient Overlays:**
- All `rgba(15,37,48,...)` gradient values update automatically since they reference `teal-dark` — but the hardcoded `rgba` values in HeroSection, WorkShowcase, NeighborhoodCards, and ProjectGrid need to be updated to use the new `#1a2f2f` equivalent: `rgba(26,47,47,...)`

**Section Spacing:**
- Key content sections: increase from `py-24` to `py-28` for more luxury whitespace
- Applies to: WorkShowcase, ServicesGrid, and the about/projects sections in NeighborhoodPage

**Gold Accent Consistency:**
- Section divider lines: ensure all use `bg-gold` (some may use `bg-charcoal-light`)
- Section labels: ensure all use `text-gold` or `text-gold-accessible` where on dark backgrounds

## 3. Files Changed

| File | Change |
|---|---|
| `src/components/HeroSection.tsx` | Replace static image with 4-image crossfade slideshow, update heading size, button styling |
| `src/app/globals.css` | Update 7 CSS color custom properties |
| `src/components/WorkShowcase.tsx` | Update hardcoded rgba gradient values, section spacing |
| `src/components/NeighborhoodCards.tsx` | Update hardcoded rgba gradient values |
| `src/components/ProjectGrid.tsx` | Update hardcoded rgba gradient values in card overlays and modal |
| `src/components/NeighborhoodPage.tsx` | Update section spacing, hardcoded rgba gradient values |

## 4. Out of Scope

- Logo, navigation structure, footer layout — unchanged
- Layout grids and responsive breakpoints — unchanged
- Animation timing (Framer Motion) — unchanged
- Image data, neighborhood data, page routes — unchanged
- Font family changes — keeping existing `font-heading` and system fonts
- Dark mode — not applicable
