export interface NeighborhoodData {
  slug: string;
  name: string;
  fullName: string;
  zip: string;
  tagline: string;
  heroImage: string;
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
    tagline: "Timeless Elegance in the Heart of Scottsdale",
    heroImage: "/images/mcr-kitchen-island-05.jpg",
    description: [
      "McCormick Ranch is one of Scottsdale’s most established and beloved communities. With its tree-lined streets, lakeside homes, and mid-century to contemporary architecture, it offers a unique blend of character and comfort that’s hard to find anywhere else in the Valley.",
      "At Saddlewood, we’ve completed dozens of remodels throughout McCormick Ranch. We understand the architectural diversity — from original ranch-style homes to modern updates — and know how to honor the existing character while bringing spaces into the present.",
      "Whether you’re updating a 1970s kitchen with modern amenities or transforming a builder-grade bathroom into a spa retreat, our team brings the expertise and attention to detail that McCormick Ranch homeowners expect.",
    ],
    features: [
      "Deep knowledge of McCormick Ranch HOA requirements",
      "Experience with lakefront and golf course properties",
      "Expertise in updating mid-century and contemporary homes",
      "Established relationships with local material suppliers",
    ],
    testimonials: [
      {
        quote: "Saddlewood completely transformed our McCormick Ranch kitchen. The attention to detail was incredible — from the custom island to the under-cabinet lighting, every element was thoughtfully designed.",
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
    heroImage: "/images/gr-living-room-02.jpg",
    description: [
      "Gainey Ranch represents the pinnacle of Scottsdale luxury living. This guard-gated community features world-class golf, stunning desert views, and some of the most architecturally significant homes in the Valley.",
      "Saddlewood Contracting has built a strong reputation within Gainey Ranch for delivering remodels that honor the community’s sophisticated aesthetic. We understand the elevated expectations of Gainey Ranch homeowners and consistently rise to meet them.",
      "Our team is experienced with the community’s architectural review process and works closely with homeowners to ensure every project enhances both the individual home and the neighborhood’s prestigious character.",
    ],
    features: [
      "Experience with Gainey Ranch architectural review process",
      "Expertise in high-end finishes and luxury materials",
      "Understanding of desert contemporary and Southwestern styles",
      "Track record with guard-gated community protocols",
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
    heroImage: "/images/pp-living-room-01.jpg",
    description: [
      "Nestled at the base of iconic Pinnacle Peak, this exclusive country club community offers some of the most breathtaking views and impressive homes in all of Scottsdale. The architecture here tends toward desert contemporary and modern luxury.",
      "Saddlewood Contracting has completed numerous projects in Pinnacle Peak Country Club, from chef’s kitchens with mountain views to spa-style master suites that rival luxury resorts. We understand the larger scale and elevated expectations of these homes.",
      "Our four ROC licenses are particularly valuable in Pinnacle Peak, where comprehensive remodels often require coordinated electrical, HVAC, and plumbing work alongside general contracting — all of which we handle in-house.",
    ],
    features: [
      "Experience with large-scale luxury home remodels",
      "Expertise in desert contemporary architecture",
      "Knowledge of Pinnacle Peak CC community standards",
      "Capability for multi-room, multi-system renovations",
    ],
    testimonials: [
      {
        quote: "From the first consultation to the final walkthrough, the Saddlewood team was exceptional. They respected our home, stayed on schedule, and delivered beyond our expectations.",
        name: "Jennifer & David L.",
        project: "Whole-Home Remodel",
      },
    ],
  },
  "paradise-valley": {
    slug: "paradise-valley",
    name: "Paradise Valley",
    fullName: "Paradise Valley",
    zip: "85253",
    tagline: "Luxury Reimagined in the Heart of the Desert",
    heroImage: "/images/pv-aerial-sunset.jpg",
    description: [
      "Paradise Valley is Arizona’s most exclusive enclave — a town of fewer than 15,000 residents tucked between Camelback Mountain and Mummy Mountain. Known for its estate-sized lots, world-class resorts, and strict architectural standards, it’s where discerning homeowners expect nothing less than exceptional craftsmanship.",
      "Saddlewood Contracting earned its reputation in Paradise Valley through whole-home transformations that honor the community’s architectural character while introducing modern luxury. Our 40th Street project showcases the full scope of our capabilities — from demolition and structural work through fine interior finishes.",
      "With four ROC licenses covering general contracting, electrical, plumbing, and HVAC, we handle every phase in-house. In Paradise Valley, where project scale and complexity demand seamless coordination, this integrated approach eliminates delays and ensures quality from foundation to finish.",
    ],
    features: [
      "Whole-home renovation expertise for estate-scale properties",
      "Experience navigating Paradise Valley’s architectural review process",
      "Full in-house capabilities: structural, electrical, plumbing, HVAC",
      "Proven track record with high-end finishes and custom millwork",
    ],
    testimonials: [
      {
        quote: "Saddlewood took our 40th Street property from a dated ranch home to a modern desert estate. The scope was massive — full demo to finished luxury — and they handled every phase with professionalism and precision. We couldn’t be happier with the result.",
        name: "The Morrison Family",
        project: "Whole-Home Transformation",
      },
    ],
  },
};
