export interface NeighborhoodData {
  slug: string;
  name: string;
  fullName: string;
  zip: string;
  tagline: string;
  description: string[];
  features: string[];
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
    tagline: "Revitalizing Classic Ranch and Lakeside Homes in Scottsdale's Premier Master-Planned Community",
    description: [
      "McCormick Ranch is celebrated for its greenbelts, mature trees, and scenic lakes. The neighborhood features a mix of classic ranch-style homes and waterfront properties. Homeowners here enjoy a relaxed, active lifestyle centered around outdoor recreation and community paths.",
      "Saddlewood Contracting helps residents modernize these established homes. We specialize in transforming original footprints by removing structural walls to create spacious, open-concept layouts. Our team is skilled at preserving the exterior charm of the neighborhood while completely renewing the interior living spaces.",
      "We coordinate all necessary trades internally, using our separate Arizona licenses in general contracting, plumbing, electrical, and HVAC. This keeps projects moving smoothly through local architectural guidelines and HOA approvals.",
    ],
    features: [
      "Open-concept layout conversions for classic ranch floor plans",
      "Familiarity with McCormick Ranch HOA and architectural review processes",
      "Structural wall removals and space optimization",
      "Renovations tailored to lakeside and golf-side properties",
    ],
    testimonials: [],
  },
  "gainey-ranch": {
    slug: "gainey-ranch",
    name: "Gainey Ranch",
    fullName: "Gainey Ranch",
    zip: "85258",
    tagline: "Sophisticated Interior Renovations in a Guard-Gated Golf Community",
    description: [
      "Gainey Ranch stands as a premier guard-gated enclave in Scottsdale. The community blends resort-style living with manicured fairways and sleek, upscale homes. Properties range from modern townhomes to custom estates, all requiring a high level of design sophistication.",
      "Our team brings meticulous craftsmanship to Gainey Ranch. We work closely with homeowners to update kitchens, master baths, and living spaces with premium materials and clean lines. Our experience working in gated neighborhoods ensures we respect all community access hours and job site regulations.",
      "With our complete licensing spanning general building, electrical, mechanical, and plumbing trades, we handle complex interior updates. We ensure full compliance with the community's strict architectural review board from start to finish.",
    ],
    features: [
      "Meticulous dust containment and guard-gate protocol adherence",
      "Premium kitchen and bathroom modernization with high-end fixtures",
      "Familiarity with Gainey Ranch architectural guidelines",
      "Custom built-ins and sophisticated contemporary cabinetry",
    ],
    testimonials: [],
  },
  "pinnacle-peak": {
    slug: "pinnacle-peak",
    name: "Pinnacle Peak",
    fullName: "Pinnacle Peak Country Club",
    zip: "85255",
    tagline: "Desert Contemporary Modernization Under the Saguaro-Framed Peaks",
    description: [
      "Pinnacle Peak Country Club and its surrounding estates feature stunning mountain vistas and desert landscapes. The homes here showcase classic Southwest details, desert contemporary architecture, and expansive lots. Capturing the natural light and mountain views is a primary focus for homeowners.",
      "Saddlewood Contracting specializes in updating these North Scottsdale homes to modern standards. We focus on expanding window openings, updating desert contemporary finishes, and creating functional floor plans. We aim to highlight the scenic views while improving comfort.",
      "Our in-house capabilities are ideal for the larger properties found here. By managing general contracting, electrical, plumbing, and HVAC under our own set of licenses, we ensure that every system is integrated and designed to withstand the desert climate.",
    ],
    features: [
      "Custom window modifications to frame mountain views",
      "Desert contemporary material selections and finish work",
      "Integration of modern, high-efficiency HVAC systems for desert heat",
      "Expertise in large-format tile and natural stone installations",
    ],
    testimonials: [],
  },
  "paradise-valley": {
    slug: "paradise-valley",
    name: "Paradise Valley",
    fullName: "Paradise Valley",
    zip: "85253",
    tagline: "Precision Custom Construction and Whole-Home Renovations in Arizona's Premier Enclave",
    description: [
      "Paradise Valley is a quiet enclave nestled between Camelback Mountain and Mummy Mountain. Characterized by spacious acre-plus lots and custom estates, it demands the highest standard of architectural execution. The town maintains strict permitting processes and strict building codes.",
      "Saddlewood Contracting is well-established in Paradise Valley. We have experience with complex projects here, including a comprehensive whole-home demo and rebuild, as well as an in-progress steel-framed new home construction. We excel at translating architectural designs into physical structures.",
      "We hold four active Arizona licenses across general contracting, electrical, plumbing, and HVAC. This structure allows us to self-perform key phases of construction. We maintain total quality control on these large-scale projects.",
    ],
    features: [
      "Whole-home renovation expertise for estate-scale properties",
      "Experience navigating Paradise Valley's architectural review process",
      "Full in-house capabilities: structural, electrical, plumbing, HVAC",
      "Proven track record with high-end finishes and custom millwork",
    ],
    testimonials: [],
  },
  "silverleaf": {
    slug: "silverleaf",
    name: "Silverleaf",
    fullName: "Silverleaf",
    zip: "85255",
    tagline: "Elevated Luxury Remodeling and Custom Details in the McDowell Canyons",
    description: [
      "Silverleaf is set against the McDowell Mountains, offering spectacular canyon views and guard-gated privacy. The architecture is a blend of Mediterranean, Spanish Colonial, and modern estates. Every home here is designed to make a statement of enduring quality.",
      "We partner with Silverleaf homeowners to execute high-end design-build renovations. Our focus is on custom details, from hand-carved stone fireplaces to intricate ceiling treatments and custom cabinetry. We understand the level of detail required for these estate homes.",
      "Our team manages the entire scope using our in-house general contracting, plumbing, electrical, and HVAC licenses. This single point of coordination ensures the build process is handled with professional care.",
    ],
    features: [
      "Specialization in Spanish Colonial, Mediterranean, and modern aesthetics",
      "High-end custom tile, stone, and plaster finishes",
      "Coordination with Silverleaf's strict ARC and security requirements",
      "Estate-scale custom cabinetry and millwork packages",
    ],
    testimonials: [],
  },
  "dc-ranch": {
    slug: "dc-ranch",
    name: "DC Ranch",
    fullName: "DC Ranch",
    zip: "85255",
    tagline: "Seamless Indoor-Outdoor Living and Custom Desert-Modern Remodels",
    description: [
      "DC Ranch is a master-planned community in the Sonoran Desert foothills. Known for its connected pathways, parks, and rustic desert-modern architecture, it emphasizes family living. The homes are designed to connect with the desert surroundings.",
      "Saddlewood Contracting specializes in updating DC Ranch homes to improve flow and utility. We install large multi-slide doors that connect indoor spaces to outdoor patios. We use natural stone, wood accents, and desert-inspired palettes that match the landscape.",
      "We handle all aspects of the remodel, including structural modifications, electrical work, plumbing, and climate control. Our in-house licensed trades coordinate every step to ensure your home renovation is completed efficiently.",
    ],
    features: [
      "Installation of multi-slide pocket doors for patio integration",
      "Use of natural desert materials like flagstone, iron, and wood",
      "Deep understanding of DC Ranch design standards",
      "Kitchen and bath redesigns optimized for modern family living",
    ],
    testimonials: [],
  },
  "grayhawk": {
    slug: "grayhawk",
    name: "Grayhawk",
    fullName: "Grayhawk",
    zip: "85255",
    tagline: "Modern Kitchen and Bath Transformations for Grayhawk Families",
    description: [
      "Grayhawk is a vibrant golf community in North Scottsdale. It offers a family-friendly atmosphere with desert landscaping and local parks. The residential properties feature clean, contemporary architectural lines and desert-inspired exteriors.",
      "We help Grayhawk residents get more value from their homes through functional remodels. We specialize in transforming standard layouts into custom spaces, focusing on modern kitchens and luxurious master baths. We help maximize the usable space in every room.",
      "Our team uses our licenses in general contracting, plumbing, electrical, and HVAC to perform complete interior transformations. We handle all elements of the remodel without relying on outside trade contractors.",
    ],
    features: [
      "Kitchen renovations designed for entertaining and family use",
      "Spa-style master bathroom transformations",
      "Custom closet systems and laundry room updates",
      "Upgrades to energy-efficient HVAC and modern lighting layouts",
    ],
    testimonials: [],
  },
  "arcadia": {
    slug: "arcadia",
    name: "Arcadia",
    fullName: "Arcadia",
    zip: "85251",
    tagline: "Preserving Historic Charm While Adding Modern Comfort in Leafy Arcadia",
    description: [
      "Arcadia is known for its lush green lawns, citrus trees, and views of Camelback Mountain. The neighborhood features a mix of mid-century ranch homes and custom modern farmhouses. It has a distinct character that stands out from the desert landscape.",
      "Saddlewood Contracting helps homeowners modernize these properties while respecting their original charm. We update plumbing and electrical systems, install high-efficiency HVAC, and create open floor plans. We focus on maintaining the classic neighborhood aesthetic.",
      "By holding general contracting, electrical, plumbing, and HVAC licenses, we handle complex renovations. This includes old framing corrections and utility upgrades, ensuring the home functions reliably for the future.",
    ],
    features: [
      "Modern farmhouse and classic cottage design integration",
      "Upgrading historic plumbing and electrical infrastructure",
      "Creating indoor-outdoor spaces that open onto green lawns",
      "Expert framing corrections and structural reinforcement",
    ],
    testimonials: [],
  },
};
