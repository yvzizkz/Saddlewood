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
  "silverleaf": {
    slug: "silverleaf",
    name: "Silverleaf",
    fullName: "Silverleaf",
    zip: "85255",
    tagline: "Elevating Silverleaf Homes with Refined Craftsmanship",
    heroImage: "/images/silverleaf-hero.jpg",
    description: [
      "Nestled against the McDowell Mountains, Silverleaf embodies a distinct Scottsdale elegance, characterized by its stunning Desert Contemporary, Spanish Colonial, and Mediterranean architecture. Homeowners in this esteemed 85255 community value privacy, exceptional design, and a seamless integration of luxury with natural beauty. Remodeling in Silverleaf demands a contractor who understands this unique aesthetic, ensuring every enhancement respects and elevates the property's inherent sophistication and value.",
      "Saddlewood Contracting brings a deeply rooted understanding of Scottsdale's luxury living to every project. We approach each Silverleaf remodel with a warm, confident professionalism, much like a trusted neighbor. Our focus is on collaborative design-build, ensuring your vision for a transformed kitchen, spa-grade bathroom, or whole-home renovation is realized with meticulous attention to detail, clear communication, and a commitment to completing your project on time and on budget.",
      "For Silverleaf homeowners, the advantage of Saddlewood Contracting lies in our comprehensive, in-house capabilities. With four Arizona ROC licenses – General Contractor, Electrical, HVAC, and Plumbing – all trades are managed by our skilled team. This integrated approach ensures a cohesive process, superior quality control, and a singular point of accountability, providing peace of mind as your exquisite Silverleaf residence is transformed. Expect nothing less than precision and unparalleled service.",
    ],
    features: [
      "Expertise in Silverleaf's Distinct Architectural Styles",
      "Seamless Integration of Luxury Finishes and Materials",
      "Comprehensive Design-Build for High-End Renovations",
      "Dedicated Project Management for Elegant Transformations",
    ],
    testimonials: [],
  },
  "dc-ranch": {
    slug: "dc-ranch",
    name: "DC Ranch",
    fullName: "DC Ranch",
    zip: "85255",
    tagline: "Refining DC Ranch Homes with Thoughtful Design-Build Remodels",
    heroImage: "/images/dc-ranch-hero.jpg",
    description: [
      "DC Ranch, with its distinctive Sonoran Desert architecture and vibrant community spirit, embodies a refined Scottsdale lifestyle. Homeowners here appreciate design that harmonizes with the stunning natural landscape while offering modern comfort and luxury. Remodeling in this esteemed community means enhancing a home's inherent character, often focusing on seamless indoor-outdoor living and sophisticated, enduring aesthetics.",
      "Saddlewood Contracting understands this unique balance. We bring a warm, confident approach to every remodel, treating your home with the care and respect it deserves. Our design-build process is crafted to be a reassuring experience, emphasizing clear communication, meticulous planning, and a commitment to maintaining a clean, organized worksite. Homeowners in DC Ranch can expect a partner dedicated to transforming their vision into a beautifully crafted reality, on time and on budget.",
      "Our comprehensive in-house capabilities distinguish us, ensuring a streamlined and superior remodeling journey. As an Arizona licensed General Contractor, Electrical, HVAC, and Plumbing provider, Saddlewood Contracting offers an integrated approach where every detail is managed by our own skilled tradespeople. This means greater efficiency, unwavering quality control, and a singular point of accountability for your luxury kitchen, spa-grade bathroom, whole-home renovation, or outdoor living space in DC Ranch.",
    ],
    features: [
      "Integrating desert-modern aesthetics specific to DC Ranch.",
      "Crafting elegant indoor-outdoor living spaces.",
      "Expert selection of sophisticated, durable materials.",
      "Seamless project coordination with in-house trades.",
    ],
    testimonials: [],
  },
  "grayhawk": {
    slug: "grayhawk",
    name: "Grayhawk",
    fullName: "Grayhawk",
    zip: "85255",
    tagline: "Elevating Grayhawk Homes with Thoughtful, Skilled Remodeling",
    heroImage: "/images/grayhawk-hero.jpg",
    description: [
      "Nestled within Scottsdale’s vibrant 85255 zip code, Grayhawk offers a distinct blend of desert elegance and active community living. Its homes, often reflecting sophisticated Southwest and contemporary architectural styles, are designed for both comfort and connection to the stunning Arizona landscape. Remodeling in Grayhawk presents an opportunity to refine these residences, enhancing their inherent beauty and functionality to perfectly suit your lifestyle and the community's refined aesthetic.",
      "Saddlewood Contracting brings a deep understanding of Scottsdale's luxury home market and a commitment to exceptional craftsmanship to every project. We recognize that entrusting your home to a remodeler requires confidence, which is why our approach emphasizes clear communication, meticulous planning, and a respect for your daily life. Homeowners in Grayhawk can expect a remodeling experience that is as seamless as it is transformative, guided by a team dedicated to delivering your vision with precision and care.",
      "Our unique advantage for Grayhawk homeowners lies in our comprehensive in-house capabilities. Holding four Arizona ROC licenses—General Contractor, Electrical, HVAC, and Plumbing—Saddlewood ensures every aspect of your luxury kitchen, spa-grade bathroom, or whole-home renovation is expertly managed by our skilled team. This integrated approach means superior quality control, streamlined scheduling, and a single point of accountability, providing unparalleled peace of mind throughout your remodel in Grayhawk.",
    ],
    features: [
      "Seamless integration of luxury kitchen and bath designs.",
      "Expert whole-home renovations tailored to Grayhawk's aesthetic.",
      "Dedicated craftsmanship for enhancing indoor-outdoor living.",
      "Transparent communication and meticulous project management.",
    ],
    testimonials: [],
  },
  "arcadia": {
    slug: "arcadia",
    name: "Arcadia",
    fullName: "Arcadia",
    zip: "85251",
    tagline: "Elevating Arcadia Homes with Thoughtful, Trusted Remodeling",
    heroImage: "/images/arcadia-hero.jpg",
    description: [
      "Arcadia, with its verdant landscapes and distinctive architecture, embodies a timeless Scottsdale elegance. Homeowners here appreciate a blend of cherished heritage and contemporary comfort, seeking thoughtful remodels that enhance their lifestyle while honoring the neighborhood's unique character. Transforming your home in Arcadia means respecting its legacy while introducing modern luxury and seamless indoor-outdoor living.",
      "Saddlewood Contracting understands the discerning tastes of Arcadia homeowners. We bring a refined approach to luxury kitchen remodels, spa-grade bathrooms, and whole-home renovations, ensuring every detail reflects your vision. Our design-build process emphasizes clear communication, meticulous planning, and a commitment to completing your project on time and on budget, minimizing disruption to your daily life.",
      "For homeowners in Arcadia, the complexity of a remodel is simplified with Saddlewood Contracting. Our unique advantage lies in holding four Arizona ROC licenses – General Contractor, Electrical, HVAC, and Plumbing. This means all critical trades are in-house, ensuring superior craftsmanship, seamless project coordination, and unparalleled quality control from concept to completion for your Arcadia residence.",
    ],
    features: [
      "Expert integration of classic Arcadia architecture with modern luxury.",
      "Crafting seamless indoor-outdoor living spaces for the Arizona lifestyle.",
      "Thoughtful design and material selection for enduring elegance.",
      "Streamlined whole-home renovations respecting your property's character.",
    ],
    testimonials: [],
  },
};
