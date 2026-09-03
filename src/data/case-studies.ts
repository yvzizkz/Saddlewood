/**
 * Narrative case studies — the photo-free replacement for the 70-project
 * photo portfolio in src/data/projects.ts.
 *
 * Every case study absorbs a cluster of legacy /portfolio/[slug] entries;
 * `legacySlugs` drives the redirect map so no old URL 404s. Each legacy
 * slug from projects.ts getAllSlugs() appears in exactly one study
 * (enforced by src/data/__tests__/case-studies.test.ts).
 *
 * Copy constitution: every scope item, spec, and narrative sentence is
 * mined from projects.ts prose (descriptions, captions, scope arrays),
 * lightly rewritten for flow. No invented square footages, durations,
 * dollar figures, or quotes. Testimonials are omitted until real ones
 * exist. Reels reference only the real files in /public/videos/.
 */

export interface CaseStudy {
  slug: string;
  title: string;
  neighborhood: string;
  category: "New Construction" | "Whole-Home Remodel" | "Kitchen & Bath" | "Framing";
  scope: string[];
  specs: { label: string; value: string }[];
  timelinePhases: { phase: string; description: string; duration?: string }[];
  narrative: string[];
  testimonial?: { quote: string; author: string };
  reel?: { src: string; poster: string; label: string };
  /**
   * Client-approved renderings of the build. Content rule (2026-08-28):
   * renderings may only be shown inside the case study itself, never as
   * generic page imagery, and every one must be captioned as a rendering
   * ("Rendering · Estate in progress, Paradise Valley").
   */
  renders?: { src: string; alt: string }[];
  /** Linework registry key: "plan-fragment" | "massing" | "wall-section" | "steel-beam" | "plat" */
  linework: string;
  legacySlugs: string[];
}

export const caseStudies: CaseStudy[] = [
  // ============================================================
  // PARADISE VALLEY · WHOLE-HOME BUILD — flagship ground-up build
  // (Privacy rule: community + phase labels only. No street addresses
  // or owner names anywhere on the site.)
  // ============================================================
  {
    slug: "paradise-valley-whole-home-build",
    title: "Paradise Valley · Whole-Home Build",
    neighborhood: "Paradise Valley",
    category: "New Construction",
    scope: [
      "Site planning",
      "Whole-home transformation",
      "Exterior architecture and front entry composition",
      "Coffered ceilings and exposed beams",
      "Custom millwork and built-in shelving",
      "Wide-plank oak flooring",
      "Climate-controlled wine wall",
      "Oversized skylight",
      "Custom walk-in closet",
      "Pool design and pool deck",
      "Custom stone outdoor fireplace",
      "Outdoor kitchen and grill station",
      "Integrated landscape lighting",
    ],
    specs: [
      { label: "Location", value: "Paradise Valley" },
      { label: "Category", value: "New Construction" },
      { label: "Trades", value: "General, electrical, plumbing, and HVAC, all in-house" },
    ],
    timelinePhases: [],
    narrative: [
      "The estate sits against Paradise Valley's mountain backdrop, a full transformation from the ground up. Clean horizontal lines and deep eaves meet the desert sky, and from above the geometry of the architecture meets the geometry of the desert as a single composition. The entry sets the tone for the entire home: exposed beams, oversized art, and warm oak floors create an immediate sense of arrival.",
      "Inside, coffered ceilings and white oak built-ins frame the desert views, with a statement ring chandelier anchoring the great room. Sliding doors open the family room directly to the pool, so interior and exterior read as one room. A climate-controlled wine wall, with stone backing and blackened steel framing, doubles as a design statement at the heart of the home, and from the foyer the eye carries straight through to it, one continuous line from the front door to the far wall.",
      "An oversized skylight pulls daylight into the primary suite, where oak paneling and a framed window view do the rest. The walk-in closet was designed as its own room, with galley storage, an integrated vanity, and a lit mirror. Even the laundry room carries the same finish discipline as the kitchen, and a crystal chandelier turns the office bar into a signature room.",
      "Outdoors, landscape lighting and clean lines set up the pool and lounge for evening entertaining as the sky turns over Paradise Valley. A floor-to-ceiling stone fireplace makes the covered patio year-round living space, and the outdoor kitchen sits steps from the dining area, an entire entertaining program built outside. Desert evenings run long here.",
    ],
    // No reel: the finished-interior footage of this build is retired media
    // (content rule: only the new steel framing images/reels stay on site).
    renders: [
      {
        src: "/images/study-estate-facade-luxury.jpg",
        alt: "Architectural study of the modern desert estate front elevation at dusk in Paradise Valley",
      },
      {
        src: "/images/study-greatroom-luxury.jpg",
        alt: "Architectural study of the great room with wine cellar and disappearing glass doors in Paradise Valley",
      },
      {
        src: "/images/study-terrace-luxury.jpg",
        alt: "Architectural study of the cantilevered covered terrace and reflection pool in Paradise Valley",
      },
      {
        src: "/images/render-rear.jpg",
        alt: "Rendering of the rear terrace and pool of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-poolwide.jpg",
        alt: "Rendering of the widest rear view across the pool of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-poolfront.jpg",
        alt: "Rendering of the pool and glass walls at the rear of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-poollounge.jpg",
        alt: "Rendering of the patio lounge beside the pool of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-poolspa.jpg",
        alt: "Rendering of the raised spa and pool of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-firepit.jpg",
        alt: "Rendering of the fire pit beside the pool of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-entry.jpg",
        alt: "Rendering of the entry courtyard and walkway of the estate in progress in Paradise Valley",
      },
      {
        src: "/images/render-garage-wide.jpg",
        alt: "Rendering of the garage side of the estate in progress in Paradise Valley",
      },
    ],
    linework: "massing",
    legacySlugs: [
      "paradise-valley-pool-at-golden-hour",
      "paradise-valley-great-room-opening-to-pool",
      "paradise-valley-aerial-sunset-over-the-mountain",
      "paradise-valley-pool-and-patio-at-twilight",
      "paradise-valley-great-room-with-ring-chandelier",
      "paradise-valley-front-facade-at-sunset",
      "paradise-valley-primary-bedroom",
      "paradise-valley-pool-lounge-at-twilight",
      "paradise-valley-grand-entry-foyer",
      "paradise-valley-glass-wine-wall",
      "paradise-valley-primary-suite-with-skylight",
      "paradise-valley-outdoor-fireplace-at-twilight",
      "paradise-valley-covered-patio-with-desert-views",
      "paradise-valley-formal-dining-with-exposed-beams",
      "paradise-valley-designer-living-room",
      "paradise-valley-custom-bar-and-office",
      "paradise-valley-sunset-aerial-view",
      "paradise-valley-aerial-streetside-at-sunset",
      "paradise-valley-rear-elevation-at-twilight",
      "paradise-valley-bath-wing-at-dusk",
      "paradise-valley-front-entrance-at-dusk",
      "paradise-valley-pool-with-mountain-views",
      "paradise-valley-aerial-daytime-view",
      "paradise-valley-covered-patio-with-wicker-lounge",
      "paradise-valley-outdoor-kitchen-and-grill",
      "paradise-valley-outdoor-dining-at-dusk",
      "paradise-valley-foyer-with-wine-cellar-sightline",
      "paradise-valley-family-room-with-sectional",
      "paradise-valley-family-room-open-to-pool",
      "paradise-valley-family-room-entertainment-wall",
      "paradise-valley-guest-suite-with-wood-paneled-wall",
      "paradise-valley-custom-walk-in-closet",
      "paradise-valley-custom-laundry-room",
      "paradise-valley-office-bar-with-crystal-chandelier",
    ],
  },

  // ============================================================
  // PARADISE VALLEY · KITCHEN & BATHS — interior finish story, same build
  // ============================================================
  {
    slug: "paradise-valley-kitchen-and-baths",
    title: "Paradise Valley · Kitchen & Baths",
    neighborhood: "Paradise Valley",
    category: "Kitchen & Bath",
    scope: [
      "Natural stone island with waterfall edges",
      "Custom oak cabinetry with brass hardware",
      "Coffered ceiling and pendant lighting",
      "Integrated double ovens",
      "Apron-front farmhouse sink",
      "Custom sage-painted cabinetry",
      "Stone wine wall integration",
      "Hammered silver freestanding tub",
      "Bookmatched veined marble",
      "Fluted glass shower",
      "Herringbone marble floor",
      "Heated tile floors",
      "Dual vanity",
    ],
    specs: [
      { label: "Location", value: "Paradise Valley" },
      { label: "Category", value: "Kitchen & Bath" },
      { label: "Trades", value: "In-house across general, electrical, plumbing, and HVAC" },
    ],
    timelinePhases: [],
    narrative: [
      "The kitchen anchors the open floor plan of the estate. A massive natural stone island with waterfall edges seats five beneath pendant lighting and coffered ceilings, and the climate-controlled wine wall meets the island at the entertaining heart of the home. Stone, oak, brass, and pendant light sit in unhurried composition, designed for hosts who love to cook and entertain at the same time.",
      "Every working detail was considered: integrated double ovens, a curated display niche, flush oak cabinetry with brass hardware, and an apron-front farmhouse sink set into custom cabinetry, a working surface composed with the same care as a finished room. A second kitchen moment uses sage-painted cabinetry and brass hardware for a quieter, more verdant palette.",
      "In the master bath, a hammered silver tub sits beneath a sculptural bubble chandelier, with fluted glass, herringbone marble, and brass fixtures completing the room. A second master bath runs bookmatched veined marble floor to ceiling, so the freestanding tub and custom vanity become a single sculpted composition. The dual-vanity secondary bath and the oval-mirror powder bath were designed with the same finish-level discipline as the master.",
    ],
    renders: [
      {
        src: "/images/study-kitchen-luxury.jpg",
        alt: "Architectural study of the chef's kitchen with bookmatched waterfall marble island and fluted white oak",
      },
      {
        src: "/images/study-bath-luxury.jpg",
        alt: "Architectural study of the master spa bath with freestanding soaking tub and illuminated boulder garden",
      },
    ],
    linework: "plan-fragment",
    legacySlugs: [
      "paradise-valley-chefs-kitchen-from-the-wine-wall",
      "paradise-valley-silver-tub-master-bath",
      "paradise-valley-chefs-kitchen-with-stone-island",
      "paradise-valley-veined-marble-master-bath",
      "paradise-valley-kitchen-to-living-sightline",
      "paradise-valley-open-kitchen-and-great-room",
      "paradise-valley-wine-cellar-and-kitchen-view",
      "paradise-valley-kitchen-detail-and-built-in-ovens",
      "paradise-valley-kitchen-with-farmhouse-sink",
      "paradise-valley-kitchen-range-with-brass-detail",
      "paradise-valley-kitchen-with-sage-cabinetry",
      "paradise-valley-powder-bath-with-oval-mirror",
      "paradise-valley-secondary-bath-with-dual-vanity",
    ],
  },

  // ============================================================
  // PARADISE VALLEY · STRUCTURAL PHASE — the structural / framing
  // story of the completed wood-framed whole-home build
  // ============================================================
  {
    slug: "paradise-valley-structural-phase",
    title: "Paradise Valley · Structural Phase",
    neighborhood: "Paradise Valley",
    category: "Framing",
    scope: [
      "Full demolition and site prep",
      "New foundation and slab",
      "Exterior and interior framing",
      "Engineered roof trusses",
      "All four trades in-house: general, electrical, plumbing, HVAC",
    ],
    specs: [
      { label: "Location", value: "Paradise Valley" },
      { label: "Category", value: "Framing" },
      { label: "Structure", value: "New foundation and slab, exterior and interior framing, engineered roof trusses" },
      { label: "Trades", value: "All four trades in-house: general, electrical, plumbing, HVAC" },
    ],
    timelinePhases: [
      {
        phase: "Demolition & Site Prep",
        description: "Full demolition and site preparation ahead of the new build.",
      },
      {
        phase: "Foundation & Concrete",
        description: "New foundation and slab poured.",
      },
      {
        phase: "Exterior Framing",
        description: "Exterior framing of the new structure.",
      },
      {
        phase: "Interior Framing",
        description: "Interior framing throughout the home.",
      },
      {
        phase: "Roof Trusses",
        description: "Engineered roof trusses set.",
      },
      {
        phase: "In-House Crew at Work",
        description: "Saddlewood's own licensed tradespeople on site across all four trades: general, electrical, plumbing, and HVAC.",
      },
    ],
    narrative: [
      "The whole-home transformation of this Paradise Valley estate started with full demolition and site prep, followed by a new foundation and slab. Exterior and interior framing went up next, capped by engineered roof trusses.",
      "Every phase, from demolition to finished luxury, was executed entirely in-house across all four trades: general, electrical, plumbing, and HVAC. Saddlewood's own licensed tradespeople carried the build from the first cut to the last fixture.",
    ],
    // No reel: the surviving job-site reels document the separate, active
    // steel-frame build and live on /new-construction and /framing instead.
    linework: "steel-beam",
    legacySlugs: ["paradise-valley-40th-street-whole-home-build"],
  },

  // ============================================================
  // McCORMICK RANCH — kitchen, baths, and wet bar remodel
  // ============================================================
  {
    slug: "mccormick-ranch-kitchen-and-baths",
    title: "McCormick Ranch · Kitchen & Baths",
    neighborhood: "McCormick Ranch",
    category: "Kitchen & Bath",
    scope: [
      "Custom island with waterfall edge",
      "Quartz countertops",
      "Soft-close cabinetry",
      "Under-cabinet LED lighting",
      "Flat-panel cabinetry with built-in appliances",
      "Freestanding soaking tub",
      "Frameless glass walk-in shower",
      "Natural stone tile",
      "Heated floors",
      "Stone vessel sink on reclaimed timber vanity",
      "Wine storage wall and beverage center",
      "In-house electrical",
    ],
    specs: [
      { label: "Location", value: "McCormick Ranch" },
      { label: "Category", value: "Kitchen & Bath" },
      { label: "Trades", value: "Design, build, and electrical handled in-house" },
    ],
    timelinePhases: [],
    narrative: [
      "This McCormick Ranch remodel brings a mid-century home into the present without losing its character. The kitchen overhaul centers on a custom waterfall island with an integrated prep sink and pendant lighting, with quartz countertops, soft-close cabinetry, and under-cabinet LED lighting throughout. A second kitchen pass pairs flat-panel cabinetry with built-in appliances for clean lines and warm tones.",
      "The baths follow suit. A freestanding soaking tub beneath a statement chandelier turns the master bath into a private retreat, just minutes from McCormick Ranch's lakeside trails. Floor-to-ceiling stone tile and frameless glass shape the walk-in shower, and the primary bath balances luxury and function with heated floors, a deep soaking tub, and a zero-threshold shower entry. The powder room reads as a jewel box: a stone vessel sink on raw timber, dark walls, and quiet brass fixtures.",
      "Every detail of the wet bar was handled in-house, from the custom floating shelves and integrated wine wall to the electrical work powering the wine refrigeration.",
    ],
    linework: "wall-section",
    legacySlugs: [
      "mccormick-ranch-spa-inspired-master-bath",
      "mccormick-ranch-modern-kitchen-with-custom-island",
      "mccormick-ranch-contemporary-kitchen-redesign",
      "mccormick-ranch-luxury-walk-in-shower",
      "mccormick-ranch-custom-wet-bar-and-wine-wall",
      "mccormick-ranch-primary-bath-with-soaking-tub",
      "mccormick-ranch-luxury-powder-bath",
    ],
  },

  // ============================================================
  // PINNACLE PEAK — whole-home remodel at the country club
  // ============================================================
  {
    slug: "pinnacle-peak-remodel",
    title: "Pinnacle Peak · Remodel",
    neighborhood: "Pinnacle Peak",
    category: "Whole-Home Remodel",
    scope: [
      "Floor-to-ceiling windows",
      "Linear gas fireplace with integrated LED lighting",
      "Oversized island and professional range",
      "Custom pantry and pot filler",
      "Statement pendant lighting",
      "Retractable glass walls to covered patio",
      "Custom floating vanity with backlit mirror",
      "Zero-threshold shower with heated bench",
      "Rain head and body sprays",
      "Travertine walls",
      "Custom stone fireplace with built-in shelving",
    ],
    specs: [
      { label: "Location", value: "Pinnacle Peak Country Club" },
      { label: "Category", value: "Whole-Home Remodel" },
      { label: "Trades", value: "Plumbing and electrical by our licensed in-house team" },
    ],
    timelinePhases: [],
    narrative: [
      "At Pinnacle Peak Country Club, floor-to-ceiling glass opens the great room to the Sonoran desert, and the landscape becomes part of the living room. The great room flows into the dining area with the peak as the backdrop, while a floor-to-ceiling stone surround with concealed LED strip lighting turns the fireplace into the room's architectural anchor. A quieter sitting room pairs a custom stone fireplace with curated built-ins for a timeless feel.",
      "The kitchen was designed for serious entertaining: a professional-grade island with sightlines to Pinnacle Peak from every angle, a custom pantry system, and matching stone countertops carrying into the dining space under cohesive pendant lighting. The dining room opens fully to the covered patio, a design that makes the most of 300-plus days of Arizona sunshine.",
      "In the baths, a custom floating vanity with LED backlighting and a natural stone countertop pairs with a walk-in spa shower featuring a heated bench, rain showerhead, and multiple body sprays. All of it was plumbed and wired by our licensed in-house team.",
    ],
    renders: [
      {
        src: "/images/study-greatroom-luxury.jpg",
        alt: "Architectural study of the open great room with statement wine wall and linear stone fireplace",
      },
      {
        src: "/images/study-terrace-luxury.jpg",
        alt: "Architectural study of the outdoor living terrace, reflection pool, and mountain sunset views",
      },
    ],
    linework: "plat",
    legacySlugs: [
      "pinnacle-peak-great-room-with-desert-views",
      "pinnacle-peak-chefs-kitchen-with-mountain-views",
      "pinnacle-peak-open-kitchen-and-dining",
      "pinnacle-peak-statement-fireplace-surround",
      "pinnacle-peak-indoor-outdoor-dining",
      "pinnacle-peak-primary-bathroom-vanity",
      "pinnacle-peak-spa-walk-in-shower",
      "pinnacle-peak-great-room-and-dining-area",
      "pinnacle-peak-cozy-sitting-room-with-fireplace",
      "pinnacle-peak-contemporary-living-space",
    ],
  },

  // ============================================================
  // GAINEY RANCH — open-concept kitchen and living refresh
  // ============================================================
  {
    slug: "gainey-ranch-refresh",
    title: "Gainey Ranch · Refresh",
    neighborhood: "Gainey Ranch",
    category: "Whole-Home Remodel",
    scope: [
      "Flat-panel cabinetry",
      "Quartzite island",
      "Integrated appliances",
      "Open-concept layout",
      "Minimalist fireplace surround",
      "Built-in shelving",
      "Statement lighting",
      "Indoor-outdoor flow",
    ],
    specs: [
      { label: "Location", value: "Gainey Ranch" },
      { label: "Category", value: "Whole-Home Remodel" },
    ],
    timelinePhases: [],
    narrative: [
      "Gainey Ranch holds its design standards high, and this remodel meets them with a clean, uncluttered look. The kitchen pairs a massive quartzite island with integrated appliances and sleek flat-panel cabinetry, and the open-concept layout connects the kitchen directly to the living areas.",
      "The living spaces carry the same discipline. A curated seating area anchored by clean lines and neutral tones is designed to complement the desert views, not compete with them, while architectural built-ins and carefully placed accent lighting give the space a gallery-like quality.",
    ],
    linework: "plan-fragment",
    legacySlugs: [
      "gainey-ranch-contemporary-kitchen-redesign",
      "gainey-ranch-desert-modern-living-room",
      "gainey-ranch-contemporary-seating-area",
    ],
  },
];

/**
 * Look up a case study by its (new) slug. Returns undefined if not found.
 */
export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((cs) => cs.slug === slug);
}

/**
 * All new case-study slugs — for generateStaticParams in dynamic routes.
 */
export function getAllCaseStudySlugs(): string[] {
  return caseStudies.map((cs) => cs.slug);
}

/**
 * Redirect map for legacy /portfolio/[slug] URLs — one entry per legacy
 * slug, pointing at the case study that absorbed it. Feed this to
 * next.config redirects (or middleware) so no old portfolio URL 404s.
 */
export function getLegacyRedirectMap(): { source: string; destination: string }[] {
  return caseStudies.flatMap((cs) =>
    cs.legacySlugs.map((legacy) => ({
      source: `/portfolio/${legacy}`,
      destination: `/portfolio/${cs.slug}`,
    })),
  );
}
