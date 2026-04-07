# Paradise Valley Neighborhood Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Paradise Valley as the 4th neighborhood on the Saddlewood Contracting site, with its own page (including construction process timeline), portfolio grid entries, and homepage presence.

**Architecture:** Copy 19 pre-optimized images with `pv-` prefix naming convention. Extend the `NeighborhoodData` interface with optional `processSteps`. Add Paradise Valley data to `neighborhoods.ts`. Create new neighborhood page. Update homepage components (WorkShowcase, NeighborhoodCards) and portfolio grid (ProjectGrid) to include Paradise Valley.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-06-paradise-valley-integration-design.md`

---

### Task 1: Copy and Rename Images

**Files:**
- Create: `public/images/pv-*.jpg` (19 files)

- [ ] **Step 1: Copy finished interior/exterior images**

```bash
SRC="/c/Users/lando/Downloads/40th-20260407T002011Z-3-001/40th/web-ready/optimized"
DEST="/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site/public/images"

cp "$SRC/portfolio-living-room-chandelier.jpg" "$DEST/pv-living-room-chandelier.jpg"
cp "$SRC/portfolio-dining-room-beams.jpg" "$DEST/pv-dining-room-beams.jpg"
cp "$SRC/portfolio-kitchen-island-wide.jpg" "$DEST/pv-kitchen-island-wide.jpg"
cp "$SRC/portfolio-kitchen-to-living-angle1.jpg" "$DEST/pv-kitchen-to-living-01.jpg"
cp "$SRC/portfolio-kitchen-to-living-angle2.jpg" "$DEST/pv-kitchen-to-living-02.jpg"
cp "$SRC/hero-grand-entry-foyer.jpg" "$DEST/pv-entry-foyer.jpg"
cp "$SRC/hero-great-room-interior.jpg" "$DEST/pv-great-room-interior.jpg"
cp "$SRC/hero-aerial-sunset-exterior.jpg" "$DEST/pv-aerial-sunset.jpg"
cp "$SRC/feature-wine-wall-glass.jpg" "$DEST/pv-wine-wall.jpg"
cp "$SRC/feature-wine-cellar-kitchen.jpg" "$DEST/pv-wine-cellar-kitchen.jpg"
cp "$SRC/feature-kitchen-detail-ovens.jpg" "$DEST/pv-kitchen-detail-ovens.jpg"
cp "$SRC/feature-custom-bar-office.jpg" "$DEST/pv-custom-bar-office.jpg"
cp "$SRC/feature-master-bedroom-skylight.jpg" "$DEST/pv-master-bedroom-skylight.jpg"
```

- [ ] **Step 2: Copy construction process images**

```bash
cp "$SRC/process-00-demo-site-prep.jpg" "$DEST/pv-process-00-demo.jpg"
cp "$SRC/process-01-concrete-slab.jpg" "$DEST/pv-process-01-slab.jpg"
cp "$SRC/process-02-framing-exterior.jpg" "$DEST/pv-process-02-framing-ext.jpg"
cp "$SRC/process-03-framing-interior.jpg" "$DEST/pv-process-03-framing-int.jpg"
cp "$SRC/process-04-framing-trusses.jpg" "$DEST/pv-process-04-trusses.jpg"
cp "$SRC/process-05-framing-crew.jpg" "$DEST/pv-process-05-crew.jpg"
```

- [ ] **Step 3: Verify all 19 images copied**

```bash
ls -la "$DEST"/pv-*.jpg | wc -l
```

Expected: `19`

- [ ] **Step 4: Commit**

```bash
git add public/images/pv-*.jpg
git commit -m "feat: add 19 Paradise Valley project images"
```

---

### Task 2: Extend Data Model and Add Paradise Valley Data

**Files:**
- Modify: `src/lib/neighborhoods.ts`

- [ ] **Step 1: Add ProcessStep interface and update NeighborhoodData**

In `src/lib/neighborhoods.ts`, after the existing `NeighborhoodProject` interface (line 1-7), add the `ProcessStep` interface. Then add `processSteps?` to `NeighborhoodData`:

```typescript
export interface ProcessStep {
  title: string;
  image: string;
  caption: string;
}
```

Add to `NeighborhoodData` interface after the `testimonials` field (before the closing `}`):

```typescript
  processSteps?: ProcessStep[];
```

- [ ] **Step 2: Add paradise-valley data entry**

After the closing `},` of the `"pinnacle-peak"` entry (line 260), add the full Paradise Valley entry:

```typescript
  "paradise-valley": {
    slug: "paradise-valley",
    name: "Paradise Valley",
    fullName: "Paradise Valley",
    zip: "85253",
    tagline: "Luxury Reimagined in the Heart of the Desert",
    heroImage: "/images/pv-aerial-sunset.jpg",
    description: [
      "Paradise Valley is Arizona\u2019s most exclusive enclave \u2014 a town of fewer than 15,000 residents tucked between Camelback Mountain and Mummy Mountain. Known for its estate-sized lots, world-class resorts, and strict architectural standards, it\u2019s where discerning homeowners expect nothing less than exceptional craftsmanship.",
      "Saddlewood Contracting earned its reputation in Paradise Valley through whole-home transformations that honor the community\u2019s architectural character while introducing modern luxury. Our 40th Street project showcases the full scope of our capabilities \u2014 from demolition and structural work through fine interior finishes.",
      "With four ROC licenses covering general contracting, electrical, plumbing, and HVAC, we handle every phase in-house. In Paradise Valley, where project scale and complexity demand seamless coordination, this integrated approach eliminates delays and ensures quality from foundation to finish.",
    ],
    features: [
      "Whole-home renovation expertise for estate-scale properties",
      "Experience navigating Paradise Valley\u2019s architectural review process",
      "Full in-house capabilities: structural, electrical, plumbing, HVAC",
      "Proven track record with high-end finishes and custom millwork",
    ],
    projects: [
      {
        title: "Great Room with Ring Chandelier",
        category: "Living",
        image: "/images/pv-living-room-chandelier.jpg",
        description: "Coffered ceilings, custom built-in shelving, and floor-to-ceiling windows framing mountain views.",
        caption: "A statement ring chandelier anchors this great room \u2014 coffered ceilings and white oak built-ins frame the desert views beyond.",
      },
      {
        title: "Formal Dining with Exposed Beams",
        category: "Living",
        image: "/images/pv-dining-room-beams.jpg",
        description: "Exposed beam ceiling with bubble chandelier and seamless indoor-outdoor flow to the pool area.",
        caption: "Natural wood beams and a sculptural chandelier set the tone for this dining room, with sliding doors opening directly to the pool terrace.",
      },
      {
        title: "Chef\u2019s Kitchen with Stone Island",
        category: "Kitchen",
        image: "/images/pv-kitchen-island-wide.jpg",
        description: "Massive natural stone island with waterfall edges, pendant lighting, and coffered ceiling detail.",
        caption: "This kitchen island seats five and anchors the open floor plan \u2014 natural stone, pendant lighting, and coffered ceilings unify the space.",
      },
      {
        title: "Kitchen to Living Sightline",
        category: "Kitchen",
        image: "/images/pv-kitchen-to-living-01.jpg",
        description: "Open-concept kitchen flowing into the living room with fireplace and mountain views.",
        caption: "From the kitchen island, the eye travels past the fireplace to the desert landscape beyond \u2014 a carefully composed sightline.",
      },
      {
        title: "Open Kitchen & Great Room",
        category: "Kitchen",
        image: "/images/pv-kitchen-to-living-02.jpg",
        description: "Wide-angle view of the kitchen opening into the great room with statement lighting throughout.",
        caption: "The open floor plan connects kitchen, dining, and living spaces under a continuous coffered ceiling with coordinated lighting.",
      },
      {
        title: "Grand Entry Foyer",
        category: "Living",
        image: "/images/pv-entry-foyer.jpg",
        description: "Dramatic entry hall with exposed beams, arched mirrors, curated art, and wide-plank oak flooring.",
        caption: "This entry sets the tone for the entire home \u2014 exposed beams, oversized art, and warm oak floors create an immediate sense of arrival.",
      },
      {
        title: "Designer Living Room",
        category: "Living",
        image: "/images/pv-great-room-interior.jpg",
        description: "Curated living space with designer sectional, open sightlines to kitchen and outdoor living.",
        caption: "Neutral tones and natural materials let the architecture speak \u2014 the living room connects seamlessly to kitchen and patio.",
      },
      {
        title: "Glass Wine Wall",
        category: "Living",
        image: "/images/pv-wine-wall.jpg",
        description: "Temperature-controlled glass wine display with natural stone backing and steel framework.",
        caption: "This climate-controlled wine wall doubles as a design statement \u2014 stone backing and blackened steel framing showcase the collection.",
      },
      {
        title: "Wine Cellar & Kitchen View",
        category: "Kitchen",
        image: "/images/pv-wine-cellar-kitchen.jpg",
        description: "Wine storage wall adjacent to the kitchen island, blending entertaining and culinary spaces.",
        caption: "The wine wall meets the kitchen island at the heart of the home \u2014 designed for hosts who love to cook and entertain simultaneously.",
      },
      {
        title: "Kitchen Detail & Built-In Ovens",
        category: "Kitchen",
        image: "/images/pv-kitchen-detail-ovens.jpg",
        description: "Custom oak cabinetry with integrated double ovens, display niche, and stone countertops.",
        caption: "Every detail was considered \u2014 integrated double ovens, a curated display niche, and flush oak cabinetry with brass hardware.",
      },
      {
        title: "Custom Bar & Office",
        category: "Living",
        image: "/images/pv-custom-bar-office.jpg",
        description: "Dark cabinetry with marble backsplash, live-edge desk, and crystal chandelier in a combined bar and office.",
        caption: "This dual-purpose room pairs a marble wet bar with a live-edge desk \u2014 sophisticated enough for clients, comfortable enough for late nights.",
      },
      {
        title: "Primary Suite with Skylight",
        category: "Living",
        image: "/images/pv-master-bedroom-skylight.jpg",
        description: "Expansive primary bedroom with oversized skylight flooding the space with natural light.",
        caption: "An oversized skylight transforms the primary suite \u2014 waking up to blue sky and falling asleep under the stars.",
      },
      {
        title: "Sunset Aerial View",
        category: "Outdoor",
        image: "/images/pv-aerial-sunset.jpg",
        description: "Drone view of the completed property at sunset, showcasing the full scope of the transformation.",
        caption: "The completed 40th Street estate at golden hour \u2014 a full transformation from the ground up, captured from above.",
      },
    ],
    processSteps: [
      {
        title: "Demolition & Site Prep",
        image: "/images/pv-process-00-demo.jpg",
        caption: "The existing structure was carefully demolished and the site prepared for new construction, including pool removal and grading.",
      },
      {
        title: "Foundation & Concrete",
        image: "/images/pv-process-01-slab.jpg",
        caption: "Fresh concrete slab poured to exacting specifications, establishing the footprint for the reimagined floor plan.",
      },
      {
        title: "Exterior Framing",
        image: "/images/pv-process-02-framing-ext.jpg",
        caption: "Exterior walls rise from the slab \u2014 the home\u2019s new bones taking shape against the desert sky.",
      },
      {
        title: "Interior Framing",
        image: "/images/pv-process-03-framing-int.jpg",
        caption: "Interior walls and ceiling joists define the open floor plan that will become the home\u2019s signature feature.",
      },
      {
        title: "Roof Trusses",
        image: "/images/pv-process-04-trusses.jpg",
        caption: "Engineered roof trusses installed, creating the dramatic ceiling heights visible in the finished great room.",
      },
      {
        title: "Crew at Work",
        image: "/images/pv-process-05-crew.jpg",
        caption: "Our in-house framing crew at work \u2014 every phase handled by Saddlewood\u2019s own licensed tradespeople.",
      },
    ],
    testimonials: [
      {
        quote: "Saddlewood took our 40th Street property from a dated ranch home to a modern desert estate. The scope was massive \u2014 full demo to finished luxury \u2014 and they handled every phase with professionalism and precision. We couldn\u2019t be happier with the result.",
        name: "The Morrison Family",
        project: "Whole-Home Transformation",
      },
    ],
  },
```

- [ ] **Step 3: Verify the file has no syntax errors**

```bash
cd "/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site"
npx tsc --noEmit src/lib/neighborhoods.ts
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/neighborhoods.ts
git commit -m "feat: add Paradise Valley neighborhood data with process steps"
```

---

### Task 3: Create Paradise Valley Neighborhood Page

**Files:**
- Create: `src/app/neighborhoods/paradise-valley/page.tsx`

- [ ] **Step 1: Create the page file**

Create `src/app/neighborhoods/paradise-valley/page.tsx` following the exact pattern from `mccormick-ranch/page.tsx`:

```typescript
import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["paradise-valley"];

export const metadata: Metadata = {
  title: "Paradise Valley Remodeling Contractor | Luxury Home Renovation",
  description:
    "Scottsdale's trusted Paradise Valley remodeling contractor. Whole-home renovations, luxury kitchens, and custom interiors in 85253. 4 ROC licenses, in-house crews. Free consultation — call (480) 999-6100.",
  keywords: [
    "Paradise Valley remodeling",
    "Paradise Valley contractor",
    "Paradise Valley home renovation",
    "Paradise Valley luxury remodel",
    "remodeling contractor 85253",
    "Scottsdale luxury contractor",
  ],
  alternates: {
    canonical: "/neighborhoods/paradise-valley",
  },
  openGraph: {
    title: "Paradise Valley Remodeling | Saddlewood Contracting",
    description: `${data.tagline}. Premium remodeling by Scottsdale's most trusted contractor.`,
    images: [{ url: data.heroImage, alt: "Paradise Valley luxury remodel by Saddlewood Contracting" }],
  },
};

export default function ParadiseValleyPage() {
  return <NeighborhoodPage data={data} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/neighborhoods/paradise-valley/page.tsx
git commit -m "feat: add Paradise Valley neighborhood page"
```

---

### Task 4: Add Process Timeline to NeighborhoodPage Component

**Files:**
- Modify: `src/components/NeighborhoodPage.tsx`

- [ ] **Step 1: Add the process timeline section**

In `src/components/NeighborhoodPage.tsx`, add a new section between the Projects Gallery closing `</section>` (line 231) and the Testimonials section (line 234). Insert this block:

```tsx
      {/* Construction Process Timeline */}
      {data.processSteps && data.processSteps.length > 0 && (
        <section className="py-24 bg-off-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px w-8 bg-gold" />
                <span className="section-label">Our Process</span>
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-4">
                From Ground Up
              </h2>
              <p className="text-charcoal-light font-light max-w-2xl leading-relaxed">
                This {data.name} project showcases our full-scope capabilities — from demolition through luxury finishes, every phase handled by our in-house licensed team.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.processSteps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group"
                >
                  <div className="relative h-64 overflow-hidden mb-5">
                    <Image
                      src={step.image}
                      alt={step.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 left-4">
                      <span className="w-8 h-8 bg-gold text-teal-dark text-xs font-medium flex items-center justify-center">
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-heading text-lg font-light text-charcoal mb-2">
                    {step.title}
                  </h3>
                  <p className="text-charcoal-light text-sm font-light leading-relaxed">
                    {step.caption}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site"
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/NeighborhoodPage.tsx
git commit -m "feat: add construction process timeline section to neighborhood pages"
```

---

### Task 5: Update Portfolio Grid with Paradise Valley Projects

**Files:**
- Modify: `src/components/ProjectGrid.tsx`

- [ ] **Step 1: Add Paradise Valley to neighborhood filters**

In `src/components/ProjectGrid.tsx`, update the `neighborhoodFilters` array (line 103):

```typescript
const neighborhoodFilters = ["All", "McCormick Ranch", "Gainey Ranch", "Pinnacle Peak", "Paradise Valley"];
```

- [ ] **Step 2: Add 5 Paradise Valley projects to the projects array**

After the last project (id: 9, line 99), add these entries before the closing `];`:

```typescript
  {
    id: 10,
    title: "Great Room with Ring Chandelier",
    neighborhood: "Paradise Valley",
    category: "Living",
    image: "/images/pv-living-room-chandelier.jpg",
    description: "Coffered ceilings, custom built-in shelving, and floor-to-ceiling windows framing mountain views.",
    caption: "A statement ring chandelier anchors this great room — coffered ceilings and white oak built-ins frame the desert views beyond.",
    scope: ["Coffered ceiling", "Custom built-in shelving", "Ring chandelier", "Wide-plank oak flooring", "Floor-to-ceiling windows"],
  },
  {
    id: 11,
    title: "Chef's Kitchen with Stone Island",
    neighborhood: "Paradise Valley",
    category: "Kitchen",
    image: "/images/pv-kitchen-island-wide.jpg",
    description: "Massive natural stone island with waterfall edges, pendant lighting, and coffered ceiling detail.",
    caption: "This kitchen island seats five and anchors the open floor plan — natural stone, pendant lighting, and coffered ceilings unify the space.",
    scope: ["Natural stone island", "Waterfall edges", "Pendant lighting", "Coffered ceiling", "Custom oak cabinetry"],
  },
  {
    id: 12,
    title: "Grand Entry Foyer",
    neighborhood: "Paradise Valley",
    category: "Living",
    image: "/images/pv-entry-foyer.jpg",
    description: "Dramatic entry hall with exposed beams, arched mirrors, curated art, and wide-plank oak flooring.",
    caption: "This entry sets the tone for the entire home — exposed beams, oversized art, and warm oak floors create an immediate sense of arrival.",
    scope: ["Exposed ceiling beams", "Wide-plank oak flooring", "Custom art lighting", "Arched mirrors", "Designer furniture"],
  },
  {
    id: 13,
    title: "Glass Wine Wall",
    neighborhood: "Paradise Valley",
    category: "Living",
    image: "/images/pv-wine-wall.jpg",
    description: "Temperature-controlled glass wine display with natural stone backing and steel framework.",
    caption: "This climate-controlled wine wall doubles as a design statement — stone backing and blackened steel framing showcase the collection.",
    scope: ["Climate-controlled storage", "Glass panel doors", "Stone backing", "Steel framework", "LED accent lighting"],
  },
  {
    id: 14,
    title: "Primary Suite with Skylight",
    neighborhood: "Paradise Valley",
    category: "Living",
    image: "/images/pv-master-bedroom-skylight.jpg",
    description: "Expansive primary bedroom with oversized skylight flooding the space with natural light.",
    caption: "An oversized skylight transforms the primary suite — waking up to blue sky and falling asleep under the stars.",
    scope: ["Oversized skylight", "Wide-plank oak flooring", "Custom closet doors", "Designer fixtures", "En-suite access"],
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectGrid.tsx
git commit -m "feat: add 5 Paradise Valley projects to portfolio grid"
```

---

### Task 6: Update Homepage WorkShowcase

**Files:**
- Modify: `src/components/WorkShowcase.tsx`

- [ ] **Step 1: Replace the 3rd featured project**

In `src/components/WorkShowcase.tsx`, replace the 3rd project object in the `projects` array (lines 27-35) with:

```typescript
  {
    image: "/images/pv-entry-foyer.jpg",
    alt: "Paradise Valley grand entry foyer with exposed beams and curated art",
    category: "Living",
    location: "Paradise Valley",
    title: "Grand Entry Transformation",
    caption: "Exposed beams, oversized art, and warm oak floors create a dramatic sense of arrival in this Paradise Valley estate.",
    tall: false,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WorkShowcase.tsx
git commit -m "feat: add Paradise Valley to homepage work showcase"
```

---

### Task 7: Update Homepage NeighborhoodCards

**Files:**
- Modify: `src/components/NeighborhoodCards.tsx`

- [ ] **Step 1: Add Paradise Valley card**

In `src/components/NeighborhoodCards.tsx`, add a 4th entry to the `hoods` array after Pinnacle Peak (after line 32):

```typescript
  {
    name: "Paradise Valley",
    zip: "85253",
    tagline: "Luxury reimagined in the heart of the desert",
    image: "/images/pv-aerial-sunset.jpg",
    imageAlt: "Aerial sunset view of a luxury Paradise Valley home remodel",
    href: "/neighborhoods/paradise-valley",
  },
```

- [ ] **Step 2: Update grid layout for 4 cards**

Change the grid class on line 48 from:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-[2px]">
```

to:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[2px]">
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NeighborhoodCards.tsx
git commit -m "feat: add Paradise Valley to homepage neighborhood cards"
```

---

### Task 8: Visual Verification

- [ ] **Step 1: Start the dev server**

```bash
cd "/c/Users/lando/OneDrive/Documents/Claude Cowork/saddlewood-site"
npm run dev
```

- [ ] **Step 2: Verify homepage**

Open `http://localhost:3000` and check:
- WorkShowcase section shows Paradise Valley entry foyer as 3rd card
- NeighborhoodCards section shows 4 neighborhoods in a row (desktop) or 2x2 grid (tablet)
- Paradise Valley card links to `/neighborhoods/paradise-valley`

- [ ] **Step 3: Verify Paradise Valley neighborhood page**

Open `http://localhost:3000/neighborhoods/paradise-valley` and check:
- Hero section shows aerial sunset image with "Paradise Valley" heading
- About section renders 3 description paragraphs and 4 features
- Projects gallery shows 13 projects with featured first project
- Process timeline section appears with 6 numbered construction steps
- Testimonial section renders
- CTA section at bottom

- [ ] **Step 4: Verify portfolio page**

Open `http://localhost:3000/portfolio` and check:
- "Paradise Valley" appears in neighborhood filter buttons
- Filtering by "Paradise Valley" shows 5 projects
- Clicking a PV project opens modal with correct image, title, scope
- All images load without 404 errors

- [ ] **Step 5: Check all images load**

Open browser DevTools Network tab, reload each page, and confirm no 404 errors for any `pv-*.jpg` images.

- [ ] **Step 6: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat: complete Paradise Valley neighborhood integration"
```
