# Services & About Page Content Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Paradise Valley project photos into Services and About pages, fix content inconsistencies.

**Architecture:** Rename uploaded PV images to match naming conventions, fix About page text/CSS/image issues, create a new ProjectPhotoGrid component for the Services page, and wire it into the services route.

**Tech Stack:** Next.js 16, React 19, Framer Motion, Tailwind CSS, next/image

---

### Task 1: Rename PV images and remove duplicates

**Files:**
- Rename: `public/images/1773235754659-288-IMG_3229.png` → `public/images/pv-kitchen-farmhouse-sink.jpg`
- Rename: `public/images/1773235754658-991-IMG_2951.png` → `public/images/pv-shower-dual-brass.jpg`
- Rename: `public/images/1773235754659-29-IMG_3232.png` → `public/images/pv-custom-closet.jpg`
- Rename: `public/images/1773235754661-381-IMG_3235.png` → `public/images/pv-kitchen-sage-cabinets.jpg`
- Delete: `public/images/1773235754646-25-download.png` (duplicate)
- Delete: `public/images/1773235754660-855-IMG_3235 (1).png` (duplicate)
- Delete: `public/images/1773235754660-432-IMG_3236.png` (duplicate)

- [ ] **Step 1: Rename the 4 images**

```bash
cd public/images
mv "1773235754659-288-IMG_3229.png" pv-kitchen-farmhouse-sink.jpg
mv "1773235754658-991-IMG_2951.png" pv-shower-dual-brass.jpg
mv "1773235754659-29-IMG_3232.png" pv-custom-closet.jpg
mv "1773235754661-381-IMG_3235.png" pv-kitchen-sage-cabinets.jpg
```

- [ ] **Step 2: Delete the 3 duplicates**

```bash
cd public/images
rm "1773235754646-25-download.png"
rm "1773235754660-855-IMG_3235 (1).png"
rm "1773235754660-432-IMG_3236.png"
```

- [ ] **Step 3: Verify files exist with new names**

```bash
ls public/images/pv-kitchen-farmhouse-sink.jpg public/images/pv-shower-dual-brass.jpg public/images/pv-custom-closet.jpg public/images/pv-kitchen-sage-cabinets.jpg
```

Expected: all 4 files listed, no errors.

- [ ] **Step 4: Commit**

```bash
git add public/images/
git commit -m "chore: rename PV project images and remove duplicates"
```

---

### Task 2: Fix About page — CSS bug, copy, and Service Area

**Files:**
- Modify: `src/app/about/page.tsx:91` (CSS bug)
- Modify: `src/app/about/page.tsx:102` (neighborhood copy)
- Modify: `src/app/about/page.tsx:208-209` (service area grid)

- [ ] **Step 1: Fix duplicate CSS classes on line 91**

In `src/app/about/page.tsx`, replace:

```tsx
<h2 className="font-heading text-3xl sm:text-4xl lg:text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-8 leading-tight">
```

With:

```tsx
<h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-8 leading-tight">
```

- [ ] **Step 2: Add Paradise Valley to story copy on line 102**

Replace:

```tsx
We specialize in the communities we know best: McCormick Ranch, Gainey Ranch, and Pinnacle Peak Country Club. This hyper-local focus means we understand the architectural styles, HOA requirements, and design preferences that make each neighborhood unique.
```

With:

```tsx
We specialize in the communities we know best: McCormick Ranch, Gainey Ranch, Paradise Valley, and Pinnacle Peak Country Club. This hyper-local focus means we understand the architectural styles, HOA requirements, and design preferences that make each neighborhood unique.
```

- [ ] **Step 3: Add Paradise Valley to Service Area grid on lines 208-209**

Replace:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mb-12">
  {["McCormick Ranch · 85258", "Gainey Ranch · 85258", "Pinnacle Peak CC · 85255"].map(
```

With:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mb-12">
  {["McCormick Ranch · 85258", "Gainey Ranch · 85258", "Paradise Valley · 85253", "Pinnacle Peak CC · 85255"].map(
```

- [ ] **Step 4: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "fix: add Paradise Valley to About page copy and service area, fix CSS bug"
```

---

### Task 3: Replace About page story section image

**Files:**
- Modify: `src/app/about/page.tsx:69-78` (image source and overlay text)

- [ ] **Step 1: Swap image source and alt text on lines 69-71**

Replace:

```tsx
<Image
  src="/images/mcr-bathroom-luxury.jpg"
  alt="Saddlewood craftsmanship"
  fill
  className="object-cover"
/>
```

With:

```tsx
<Image
  src="/images/pv-shower-dual-brass.jpg"
  alt="Luxury dual rain shower with brass fixtures in a Paradise Valley remodel"
  fill
  className="object-cover"
/>
```

- [ ] **Step 2: Update overlay text on lines 75-78**

Replace:

```tsx
<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-charcoal to-charcoal/0 p-8">
  <p className="text-gold text-sm font-light">Saddlewood Team</p>
  <p className="text-stone/60 text-xs font-light">Scottsdale, Arizona</p>
</div>
```

With:

```tsx
<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-charcoal to-charcoal/0 p-8">
  <p className="text-gold text-sm font-light">Paradise Valley</p>
  <p className="text-stone/60 text-xs font-light">Full Home Remodel</p>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: update About story image to PV dual rain shower"
```

---

### Task 4: Fix ServicesGrid feature image caption

**Files:**
- Modify: `src/components/ServicesGrid.tsx:68`

- [ ] **Step 1: Fix the caption text**

The image is `mcr-kitchen-island-04.jpg` (a kitchen), but the caption says "living room". Replace:

```tsx
<strong className="text-gold font-medium">McCormick Ranch</strong> &mdash; Modern living room featuring custom built-ins, premium finishes, and designer details. Every detail handled by our in-house team.
```

With:

```tsx
<strong className="text-gold font-medium">McCormick Ranch</strong> &mdash; Modern kitchen featuring custom island, premium cabinetry, and designer finishes. Every detail handled by our in-house team.
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ServicesGrid.tsx
git commit -m "fix: correct ServicesGrid caption to match kitchen image"
```

---

### Task 5: Create ProjectPhotoGrid component

**Files:**
- Create: `src/components/ProjectPhotoGrid.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ProjectPhotoGrid.tsx` with the following content. This follows the existing pattern from `WorkShowcase.tsx` — uses `motion.div` for fade-in, `next/image` with `fill`, and hover overlays with teal gradient + gold accent text:

```tsx
"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const photos = [
  {
    src: "/images/pv-kitchen-farmhouse-sink.jpg",
    alt: "Paradise Valley kitchen with farmhouse sink and brass fixtures",
    caption: "Farmhouse sink with brass fixtures",
    category: "Kitchen",
  },
  {
    src: "/images/pv-shower-dual-brass.jpg",
    alt: "Paradise Valley luxury dual rain shower with marble tile",
    caption: "Dual rain shower with marble tile",
    category: "Bathroom",
  },
  {
    src: "/images/pv-custom-closet.jpg",
    alt: "Paradise Valley custom walk-in closet with built-in shelving",
    caption: "Custom walk-in closet with built-ins",
    category: "Closet",
  },
  {
    src: "/images/pv-kitchen-sage-cabinets.jpg",
    alt: "Paradise Valley kitchen with sage cabinetry and integrated appliances",
    caption: "Sage cabinetry with integrated appliances",
    category: "Kitchen",
  },
];

export function ProjectPhotoGrid() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Project photos">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-12">
          <div className="section-label">Our Craftsmanship</div>
          <h2 className="font-heading text-3xl lg:text-[42px] font-medium text-teal max-w-[560px] leading-[1.15] tracking-[-0.02em] mb-5">
            Detail-driven results
          </h2>
          <p className="text-[15px] text-charcoal-light max-w-[480px] leading-relaxed font-light">
            From kitchens and bathrooms to custom storage — a recent Paradise Valley whole-home remodel showcasing what our in-house team delivers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.src}
              className="relative h-[300px] sm:h-[340px] overflow-hidden cursor-pointer group"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
              <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 delay-50">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold font-medium mb-1.5">
                  {photo.category} &middot; Paradise Valley
                </div>
                <p className="text-white/70 text-[13px] font-light leading-relaxed">
                  {photo.caption}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProjectPhotoGrid.tsx
git commit -m "feat: create ProjectPhotoGrid component with PV project photos"
```

---

### Task 6: Wire ProjectPhotoGrid into Services page

**Files:**
- Modify: `src/app/services/page.tsx`

- [ ] **Step 1: Add import and insert component between ServicesGrid and ProcessTimeline**

Replace the full content of `src/app/services/page.tsx`:

```tsx
import { ServicesGrid } from "@/components/ServicesGrid";
import { ProjectPhotoGrid } from "@/components/ProjectPhotoGrid";
import { ProcessTimeline } from "@/components/ProcessTimeline";
import { CTABanner } from "@/components/CTABanner";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Remodeling Services in Scottsdale | Kitchen, Bath, Electrical, HVAC, Plumbing",
  description:
    "Full-service remodeling in Scottsdale, AZ — kitchen remodels, bathroom renovations, whole-home renovations, electrical, HVAC, and plumbing. 4 ROC licenses under one roof. Call (480) 999-6100.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        label="What We Do"
        title="Our Services"
        description="From full kitchen renovations to licensed specialty trades, we handle every aspect of your remodel under one roof."
        image="/images/mcr-kitchen-island-06.jpg"
        imageAlt="Luxury kitchen remodel with custom island by Saddlewood Contracting in Scottsdale"
      />
      <ServicesGrid />
      <ProjectPhotoGrid />
      <ProcessTimeline />
      <CTABanner />
    </>
  );
}
```

- [ ] **Step 2: Verify the dev server renders without errors**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/services/page.tsx
git commit -m "feat: add ProjectPhotoGrid to Services page"
```
