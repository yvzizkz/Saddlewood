export interface NeighborhoodProject {
  title: string;
  category: string;
  image: string;
  description: string;
  caption: string;
}

export interface ProcessStep {
  title: string;
  image: string;
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
  processSteps?: ProcessStep[];
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
      {
        title: "Luxury Master Bathroom",
        category: "Bathroom",
        image: "/images/mcr-bathroom-luxury.jpg",
        description: "Elegant master bathroom featuring premium finishes, custom tilework, and designer fixtures.",
        caption: "Every surface in this master bath was carefully selected \u2014 from the floor tile to the countertop \u2014 to create a cohesive luxury experience.",
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
    heroImage: "/images/gr-living-room-02.jpg",
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
    heroImage: "/images/pp-living-room-01.jpg",
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
      {
        title: "Great Room & Dining Area",
        category: "Living",
        image: "/images/pp-great-room-dining.jpg",
        description: "Open-concept great room flowing into a formal dining area with mountain views.",
        caption: "The great room transitions seamlessly into the dining area \u2014 perfect for hosting with Pinnacle Peak as the backdrop.",
      },
      {
        title: "Cozy Sitting Room with Fireplace",
        category: "Living",
        image: "/images/pp-sitting-room-fireplace.jpg",
        description: "Intimate sitting room featuring a custom stone fireplace and built-in shelving.",
        caption: "A quiet retreat within the home \u2014 this sitting room pairs a custom fireplace with curated built-ins for a timeless feel.",
      },
      {
        title: "Contemporary Living Space",
        category: "Living",
        image: "/images/pp-living-room-02.jpg",
        description: "Modern living room with clean lines, designer furniture, and desert views.",
        caption: "Clean lines and neutral tones let the desert landscape take center stage in this Pinnacle Peak living room.",
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
};
