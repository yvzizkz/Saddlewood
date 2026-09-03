> SUPERSEDED (2026-08-27): the image pipeline and photo hero were removed in the Night Blueprint photo-free redesign. Kept for history.

# Hero Slideshow + Warm Modern Theme Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static homepage hero with a 4-image crossfade slideshow and refresh the entire site's color palette and styling to a warm modern luxury aesthetic.

**Architecture:** Theme refresh is done entirely through CSS variable updates in globals.css plus targeted rgba replacement in components. The hero slideshow uses React state + useEffect interval with CSS opacity transitions. Tasks are ordered so the color foundation is laid first, then components are updated, then the hero is rebuilt last.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-06-hero-slideshow-theme-refresh-design.md`

---

### Task 1: Update Color Palette in globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the CSS custom properties in the `:root` block**

In `src/app/globals.css`, replace the `:root` block (lines 7-23) with:

```css
:root {
  --background: #f5f0e8;
  --foreground: #2c2926;
  --teal: #2d4a4a;
  --teal-90: rgba(45,74,74,0.9);
  --teal-dark: #1a2f2f;
  --gold: #c8a55a;
  --gold-muted: #B8924A;
  --stone: #e2dbd0;
  --stone-mid: #d9d0c3;
  --charcoal: #2c2926;
  --charcoal-light: #5A5A5A;
  --off-white: #f5f0e8;
  --cream: #ede6d8;
  --white: #FFFFFF;
  --gold-accessible: #8B6914;
}
```

- [ ] **Step 2: Verify the site still compiles**

```bash
cd "/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site"
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: update color palette to warm modern aesthetic"
```

---

### Task 2: Update Hardcoded rgba Values in Components

All components that use hardcoded `rgba(15,37,48,...)` (the old teal-dark) need to be updated to `rgba(26,47,47,...)` (the new teal-dark `#1a2f2f`).

**Files:**
- Modify: `src/components/WorkShowcase.tsx`
- Modify: `src/components/NeighborhoodCards.tsx`
- Modify: `src/components/ProjectGrid.tsx`
- Modify: `src/components/NeighborhoodPage.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/components/PageHero.tsx`

- [ ] **Step 1: Update WorkShowcase.tsx**

In `src/components/WorkShowcase.tsx`, find line 78:

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
```

Replace with:

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
```

- [ ] **Step 2: Update WorkShowcase.tsx section spacing**

On line 40, change:

```tsx
<section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Recent projects">
```

to:

```tsx
<section className="py-20 sm:py-28 lg:py-36 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Recent projects">
```

- [ ] **Step 3: Update NeighborhoodCards.tsx**

In `src/components/NeighborhoodCards.tsx`, find line 75 (the gradient overlay div). Replace every `rgba(15,37,48` with `rgba(26,47,47`:

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.2)_60%] to-[rgba(26,47,47,0.35)] group-hover:from-[rgba(26,47,47,0.9)] group-hover:via-[rgba(26,47,47,0.3)_60%] group-hover:to-[rgba(26,47,47,0.15)] transition-all duration-400" />
```

- [ ] **Step 4: Update ProjectGrid.tsx**

In `src/components/ProjectGrid.tsx`, find the gradient overlay (around line 294):

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.3)] to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-400" />
```

Replace with:

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.3)] to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-400" />
```

- [ ] **Step 5: Update NeighborhoodPage.tsx**

In `src/components/NeighborhoodPage.tsx`, find the gradient overlay in the project gallery hover (around line 202):

```tsx
<div className="absolute inset-0 bg-gradient-to-t from-teal-dark/85 via-teal-dark/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
```

This line uses Tailwind classes referencing the CSS variable, so it will update automatically. **No change needed here.**

Update the NeighborhoodPage about section spacing (line 45):

```tsx
<section className="py-24 bg-off-white">
```

to:

```tsx
<section className="py-28 bg-off-white">
```

Update the projects gallery spacing (line 122):

```tsx
<section className="py-24 bg-cream">
```

to:

```tsx
<section className="py-28 bg-cream">
```

- [ ] **Step 6: Update Navbar.tsx**

In `src/components/Navbar.tsx`, replace all `rgba(15,37,48` with `rgba(26,47,47`. There are 4 occurrences:

Line 195:
```tsx
? "h-[80px] bg-[rgba(26,47,47,0.97)] backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.06)]"
```

Line 196:
```tsx
: "h-[88px] bg-gradient-to-b from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.5)] to-transparent"
```

Line 253:
```tsx
className="absolute top-full left-0 mt-2 min-w-[220px] bg-[rgba(26,47,47,0.95)] backdrop-blur-xl border border-white/[0.06] py-2 rounded-sm"
```

Line 322:
```tsx
className="fixed inset-0 z-40 bg-[rgba(26,47,47,0.98)] pt-24 px-6 overflow-y-auto"
```

- [ ] **Step 7: Update PageHero.tsx**

In `src/components/PageHero.tsx`, replace the gradient values (lines 45-46):

```tsx
? "linear-gradient(to top, rgba(26,47,47,0.92) 0%, rgba(26,47,47,0.65) 40%, rgba(26,47,47,0.3) 70%, rgba(26,47,47,0.4) 100%)"
: "linear-gradient(to top, rgba(26,47,47,0.95) 0%, rgba(26,47,47,0.85) 100%)",
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/components/WorkShowcase.tsx src/components/NeighborhoodCards.tsx src/components/ProjectGrid.tsx src/components/NeighborhoodPage.tsx src/components/Navbar.tsx src/components/PageHero.tsx
git commit -m "feat: update gradient overlays and spacing for warm modern theme"
```

---

### Task 3: Update Typography and Button Styling

**Files:**
- Modify: `src/components/HeroSection.tsx` (will be further modified in Task 4)

- [ ] **Step 1: Update hero heading size**

In `src/components/HeroSection.tsx`, find line 44:

```tsx
<h1 className="font-heading text-4xl md:text-5xl lg:text-[56px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
```

Replace with:

```tsx
<h1 className="font-heading text-4xl md:text-5xl lg:text-[64px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
```

- [ ] **Step 2: Update hero CTA button styling**

Find the "View Our Work" link (line 54-58):

```tsx
<Link
  href="/portfolio"
  className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
>
  View Our Work
</Link>
```

Replace with:

```tsx
<Link
  href="/portfolio"
  className="inline-block px-10 py-4 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase rounded-sm no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
>
  View Our Work
</Link>
```

- [ ] **Step 3: Update hero gradient to use new teal-dark rgba**

Find the gradient overlay (line 25-28):

```tsx
<div
  className="absolute inset-0"
  style={{
    background: "linear-gradient(to top, rgba(15,37,48,0.92) 0%, rgba(15,37,48,0.5) 35%, rgba(15,37,48,0.15) 60%, rgba(15,37,48,0.25) 100%)",
  }}
/>
```

Replace with:

```tsx
<div
  className="absolute inset-0"
  style={{
    background: "linear-gradient(to top, rgba(26,47,47,0.92) 0%, rgba(26,47,47,0.5) 35%, rgba(26,47,47,0.15) 60%, rgba(26,47,47,0.25) 100%)",
  }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/HeroSection.tsx
git commit -m "feat: update hero typography, button styling, and gradient"
```

---

### Task 4: Build Hero Image Slideshow

**Files:**
- Modify: `src/components/HeroSection.tsx`

- [ ] **Step 1: Replace the entire HeroSection component**

Replace the full contents of `src/components/HeroSection.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";

const heroImages = [
  {
    src: "/images/pv-entry-foyer.jpg",
    alt: "Paradise Valley grand entry foyer with exposed beams and curated art",
  },
  {
    src: "/images/pv-living-room-chandelier.jpg",
    alt: "Paradise Valley great room with ring chandelier and mountain views",
  },
  {
    src: "/images/pv-kitchen-island-wide.jpg",
    alt: "Paradise Valley chef's kitchen with natural stone island",
  },
  {
    src: "/images/pv-aerial-sunset.jpg",
    alt: "Aerial sunset view of luxury Paradise Valley home remodel",
  },
];

const INTERVAL_MS = 6000;

export function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % heroImages.length);
  }, []);

  useEffect(() => {
    let timer = setInterval(advance, INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        timer = setInterval(advance, INTERVAL_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [advance]);

  return (
    <section className="relative h-screen min-h-[600px] sm:min-h-[700px] flex items-end overflow-hidden" aria-label="Hero">
      {/* Background Images — stacked, crossfade via opacity */}
      {heroImages.map((img, i) => (
        <div
          key={img.src}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === activeIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={img.src}
            alt={img.alt}
            fill
            className="object-cover"
            priority={i === 0}
            loading={i === 0 ? undefined : "eager"}
            sizes="100vw"
          />
        </div>
      ))}

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(26,47,47,0.92) 0%, rgba(26,47,47,0.5) 35%, rgba(26,47,47,0.15) 60%, rgba(26,47,47,0.25) 100%)",
        }}
      />

      {/* Content — Bottom Left Aligned */}
      <motion.div
        className="relative z-10 px-6 lg:px-12 pb-16 lg:pb-20 max-w-[720px]"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="w-8 h-px bg-gold" aria-hidden="true" />
          <span className="text-[14px] font-bold tracking-[0.25em] uppercase text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_1px_8px_rgba(0,0,0,0.7),0_0_20px_rgba(0,0,0,0.5)]">
            Scottsdale&apos;s Premier Contractor
          </span>
        </div>

        <h1 className="font-heading text-4xl md:text-5xl lg:text-[64px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
          Where Craftsmanship<br />
          Meets <em className="italic text-gold font-normal">Character</em>
        </h1>

        <p className="text-base text-white/60 font-light max-w-[480px] leading-relaxed mb-9">
          Luxury kitchen, bathroom, and whole-home remodeling in Scottsdale&apos;s most prestigious neighborhoods.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link
            href="/portfolio"
            className="inline-block px-10 py-4 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase rounded-sm no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
          >
            View Our Work
          </Link>
          <a
            href="tel:4809996100"
            className="inline-flex items-center gap-2 py-3.5 text-[13px] text-white/70 font-normal tracking-wide no-underline hover:text-gold transition-colors"
          >
            <Phone className="w-4 h-4" />
            (480) 999-6100
          </a>
        </div>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/HeroSection.tsx
git commit -m "feat: add 4-image crossfade hero slideshow"
```

---

### Task 5: Visual Verification

- [ ] **Step 1: Start the dev server**

```bash
cd "/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site"
npm run dev
```

- [ ] **Step 2: Verify homepage hero slideshow**

Open `http://localhost:3000` and check:
- First image (entry foyer) loads immediately
- After ~6 seconds, crossfades to living room chandelier
- Continues cycling through kitchen island and aerial sunset
- Transitions are smooth (~1 second fade)
- Text overlay remains readable on all images
- Heading is larger (64px on desktop)
- CTA button has subtle rounded corners and more padding

- [ ] **Step 3: Verify warm color palette across pages**

Check these pages for the warmer color feel:
- Homepage — warmer backgrounds, warmer dark sections
- `/portfolio` — gradient overlays use warm teal
- `/neighborhoods/paradise-valley` — section backgrounds warmer
- `/neighborhoods/mccormick-ranch` — same warm updates

- [ ] **Step 4: Verify navbar**

- Scroll down on any page — navbar background should use warm teal
- Open mobile menu — overlay should use warm teal
- Neighborhoods dropdown should use warm teal background

- [ ] **Step 5: Check for any visual regressions**

Verify no jarring color mismatches between updated and non-updated elements. All gradients, overlays, and dark backgrounds should feel cohesive.

- [ ] **Step 6: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: visual adjustments for warm modern theme"
```
