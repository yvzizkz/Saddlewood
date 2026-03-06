export interface NeighborhoodProject {
  title: string;
  category: string;
  image: string;
  description: string;
  caption: string;
}

export interface NeighborhoodData {
  slug: string;
  name: string;
  fullName: string;
  zip: string;
  tagline: string;
  heroImage: string;
  description: string[];
  features: string[];
  projects: NeighborhoodProject[];
  testimonials: {
    quote: string;
    name: string;
    project: string;
  }[];
}

export const neighborhoods: Record<string, NeighborhoodData> = {
  "mccormick-ranch": {
    slug: "mccormick-ranch",
    name: "McCormick Ranch",
    fullName: "McCormick Ranch",
    zip: "85258",
    tagline: "Timeless Elegance in the Heart of Scottsdale",
    heroImage: "/images/mcr-kitchen-island-01.jpg",
    description: [
      "McCormick Ranch is one of Scottsdale\u2019s most established and beloved communities. With its tree-lined streets, lakeside homes, and mid-century to contemporary architecture, it offers a unique blend of character and comfort that\u2019s hard to find anywhere else in the Valley.",
      "At Saddlewood, we\u2019ve completed dozens of remodels throughout McCormick Ranch. We understand the architectural diversity \u2014 from original ranch-style homes to modern updates \u2014 and know how to honor the existing character while bringing spaces into the present.",
      "Whether you\u2019re updating a 1970s kitchen with modern amenities or transforming a builder-grade bathroom into a spa retreat, our team brings the expertise and attention to detail that McCormick Ranch homeowners expect.",
    ],
    features: [
      "Deep knowledge of McCormick Ranch HOA requirements",
      "Experience with lakefront and golf course properties",
      "Expertise in updating mid-century and contemporary homes",
      "Established relationships with local material suppliers",
    ],
    projects: [
      {
        title: "Modern Kitchen with Custom Island",
        category: "Kitchen",
        image: "/images/mcr-kitchen-island-01.jpg",
        description: "Complete kitchen overhaul featuring a custom waterfall island, quartz countertops, and soft-close cabinetry.",
        caption: "Custom waterfall island with integrated prep sink and pendant lighting \u2014 the centerpiece of this McCormick Ranch kitchen transformation.",
      },
      {
        title: "Contemporary Kitchen Redesign",
        category: "Kitchen",
        image: "/images/mcr-kitchen-modern.jpg",
        description: "Sleek modern kitchen with flat-panel cabinetry, built-in appliances, and undercabinet LED lighting.",
        caption: "Clean lines and warm tones bring this mid-century McCormick Ranch home into the present without losing its character.",
      },
      {
        title: "Spa-Inspired Master Bath",
        category: "Bathroom",
        image: "/images/mcr-bathroom-tub.jpg",
        description: "Freestanding soaking tub beneath a statement chandelier, with heated tile floors and custom vanity.",
        caption: "A freestanding soaking tub and chandelier transform this master bath into a private retreat \u2014 just minutes from McCormick Ranch\u2019s lakeside trails.",
      },
      {
        title: "Luxury Walk-In Shower",
        category: "Bathroom",
        image: "/images/mcr-bathroom-shower.jpg",
        description: "Frameless glass walk-in shower with bench seating, rain head, and natural stone tile.",
        caption: "Floor-to-ceiling stone tile and frameless glass create a seamless, spa-like shower experience.",
      },
      {
        title: "Custom Wet Bar & Wine Wall",
        category: "Living",
        image: "/images/mcr-wetbar.jpg",
        description: "Floating shelves, integrated wine wall, and beverage center \u2014 designed, built, and wired by our in-house team.",
        caption: "Every detail of this wet bar was handled in-house \u2014 from the custom floating shelves to the electrical work powering the wine refrigeration.",
      },
      {
        title: "Primary Bath with Soaking Tub",
        category: "Bathroom",
        image: "/images/mcr-bathroom-spa.jpg",
        description: "Spa-style primary bath with soaking tub, walk-in shower, and dual vanity.",
        caption: "This primary bath balances luxury and function \u2014 heated floors, a deep soaking tub, and a zero-threshold shower entry.",
      },
    ],
    testimonials: [
      {
        quote: "Saddlewood completely transformed our McCormick Ranch kitchen. The attention to detail was incredible \u2014 from the custom island to the under-cabinet lighting, every element was thoughtfully designed.",
        name: "Sarah & Tom K.",
        project: "Kitchen Remodel",
      },
      {
        quote: "The outdoor living space they designed has become our favorite room in the house. Perfect for Arizona evenings.",
        name: "Robert P.",
        project: "Outdoor Living",
      },
    ],
  },
  "gainey-ranch": {
    slug: "gainey-ranch",
    name: "Gainey Ranch",
    fullName: "Gainey Ranch",
    zip: "85258",
    tagline: "Refined Living with Desert Sophistication",
    heroImage: "/images/gr-kitchen-island.jpg",
    description: [
      "Gainey Ranch represents the pinnacle of Scottsdale luxury living. This guard-gated community features world-class golf, stunning desert views, and some of the most architecturally significant homes in the Valley.",
      "Saddlewood Contracting has built a strong reputation within Gainey Ranch for delivering remodels that honor the community\u2019s sophisticated aesthetic. We understand the elevated expectations of Gainey Ranch homeowners and consistently rise to meet them.",
      "Our team is experienced with the community\u2019s architectural review process and works closely with homeowners to ensure every project enhances both the individual home and the neighborhood\u2019s prestigious character.",
    ],
    features: [
      "Experience with Gainey Ranch architectural review process",
      "Expertise in high-end finishes and luxury materials",
      "Understanding of desert contemporary and Southwestern styles",
      "Track record with guard-gated community protocols",
    ],
    projects: [
      {
        title: "Contemporary Kitchen Redesign",
        category: "Kitchen",
        image: "/images/gr-kitchen-island.jpg",
        description: "Sleek flat-panel cabinetry, integrated appliances, and open-concept flow connecting kitchen to living areas.",
        caption: "This Gainey Ranch kitchen pairs a massive quartzite island with integrated appliances for a clean, uncluttered look befitting the community\u2019s design standards.",
      },
      {
        title: "Desert Modern Living Room",
        category: "Living",
        image: "/images/gr-living-room-01.jpg",
        description: "Minimalist fireplace surround, built-in shelving, and seamless indoor-outdoor flow.",
        caption: "A curated seating area anchored by clean lines and neutral tones \u2014 designed to complement Gainey Ranch\u2019s desert views, not compete with them.",
      },
      {
        title: "Contemporary Seating Area",
        category: "Living",
        image: "/images/gr-living-room-02.jpg",
        description: "Modern furniture layout with statement lighting and architectural accents.",
        caption: "Architectural built-ins and carefully placed accent lighting give this Gainey Ranch living space a gallery-like quality.",
      },
    ],
    testimonials: [
      {
        quote: "We interviewed five contractors before choosing Saddlewood. Their professionalism and the fact that they hold four ROC licenses gave us complete confidence. The finished master bath is stunning.",
        name: "Michael R.",
        project: "Master Bathroom",
      },
      {
        quote: "Having electrical, plumbing, HVAC, and general contracting all under one license holder made the entire process seamless. No finger-pointing between different subcontractors.",
        name: "Lisa M.",
        project: "Kitchen & Bath Remodel",
      },
    ],
  },
  "pinnacle-peak": {
    slug: "pinnacle-peak",
    name: "Pinnacle Peak",
    fullName: "Pinnacle Peak Country Club",
    zip: "85255",
    tagline: "Modern Luxury at the Base of the Mountain",
    heroImage: "/images/pp-great-room-view.jpg",
    description: [
      "Nestled at the base of iconic Pinnacle Peak, this exclusive country club community offers some of the most breathtaking views and impressive homes in all of Scottsdale. The architecture here tends toward desert contemporary and modern luxury.",
      "Saddlewood Contracting has completed numerous projects in Pinnacle Peak Country Club, from chef\u2019s kitchens with mountain views to spa-style master suites that rival luxury resorts. We understand the larger scale and elevated expectations of these homes.",
      "Our four ROC licenses are particularly valuable in Pinnacle Peak, where comprehensive remodels often require coordinated electrical, HVAC, and plumbing work alongside general contracting \u2014 all of which we handle in-house.",
    ],
    features: [
      "Experience with large-scale luxury home remodels",
      "Expertise in desert contemporary architecture",
      "Knowledge of Pinnacle Peak CC community standards",
      "Capability for multi-room, multi-system renovations",
    ],
    projects: [
      {
        title: "Chef\u2019s Kitchen with Mountain Views",
        category: "Kitchen",
        image: "/images/pp-kitchen-island.jpg",
        description: "Massive prep island, professional-grade range, and custom pantry system with views of Pinnacle Peak.",
        caption: "A professional-grade island kitchen designed for serious entertaining \u2014 with sightlines to Pinnacle Peak from every angle.",
      },
      {
        title: "Open Kitchen & Dining",
        category: "Kitchen",
        image: "/images/pp-kitchen-dining.jpg",
        description: "Seamless kitchen-to-dining flow with statement pendant lighting and designer finishes.",
        caption: "The open floor plan connects the kitchen island to the dining space through matching stone countertops and cohesive lighting design.",
      },
      {
        title: "Great Room with Desert Views",
        category: "Living",
        image: "/images/pp-great-room-view.jpg",
        description: "Expansive great room with floor-to-ceiling windows framing backyard and mountain views.",
        caption: "Floor-to-ceiling glass dissolves the boundary between indoors and out \u2014 the Sonoran desert becomes part of the living room.",
      },
      {
        title: "Statement Fireplace Surround",
        category: "Living",
        image: "/images/pp-fireplace.jpg",
        description: "Custom stone fireplace with linear gas insert and integrated accent lighting.",
        caption: "A floor-to-ceiling stone surround with concealed LED strip lighting transforms this fireplace into the room\u2019s architectural anchor.",
      },
      {
        title: "Indoor-Outdoor Dining",
        category: "Outdoor",
        image: "/images/pp-dining-patio.jpg",
        description: "Seamless dining experience with retractable walls opening to a covered desert patio.",
        caption: "The dining room opens fully to the covered patio \u2014 a design that makes the most of 300+ days of Arizona sunshine.",
      },
      {
        title: "Primary Bathroom Vanity",
        category: "Bathroom",
        image: "/images/pp-bathroom-vanity.jpg",
        description: "Custom floating vanity with backlit mirror and designer vessel sinks.",
        caption: "Custom floating vanity with LED backlighting and natural stone countertop \u2014 all plumbing work done by our in-house licensed plumber.",
      },
      {
        title: "Spa Walk-In Shower",
        category: "Bathroom",
        image: "/images/pp-spa-shower.jpg",
        description: "Zero-threshold shower with bench seating, rain head, and body sprays.",
        caption: "This walk-in spa shower features a heated bench, rain showerhead, and multiple body sprays \u2014 all plumbed and wired by our licensed team.",
      },
    ],
    testimonials: [
      {
        quote: "From the first consultation to the final walkthrough, the Saddlewood team was exceptional. They respected our home, stayed on schedule, and delivered beyond our expectations.",
        name: "Jennifer & David L.",
        project: "Whole-Home Remodel",
      },
    ],
  },
};
