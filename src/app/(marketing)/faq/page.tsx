import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | Saddlewood Contracting",
  description:
    "Answers about Saddlewood Contracting — areas served, Arizona ROC licenses, whole-home remodels, new construction, and how to start a project.",
  alternates: { canonical: "https://www.saddlewoodcontracting.com/faq" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What areas does Saddlewood Contracting serve for luxury home remodeling?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Saddlewood Contracting provides high-end design-build and remodeling services throughout Paradise Valley, Scottsdale, McCormick Ranch, Arcadia, Silverleaf, DC Ranch, and Grayhawk. As a local residential remodeler, our team is dedicated to transforming homes in these premier Arizona communities with exceptional craftsmanship and clear, reliable communication."
      }
    },
    {
      "@type": "Question",
      "name": "Is Saddlewood Contracting licensed, and do you handle specialty trades like plumbing and electrical in-house?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Saddlewood Contracting is fully licensed to manage all aspects of your luxury renovation, holding Arizona ROC General Contractor License #305762, HVAC License #350714, Electrical License #350715, and Plumbing License #350716. By managing these key trades in-house, we ensure absolute quality control, consistent scheduling, and a clean, organized job site for our clients."
      }
    },
    {
      "@type": "Question",
      "name": "Does Saddlewood Contracting handle ground-up new construction and structural steel-framed homes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Saddlewood Contracting manages both whole-home renovations and ground-up custom home construction, including complex structural steel framing. Our in-house crews self-perform the structural steel skeleton, concrete slabs, and framing for custom builds in Paradise Valley, ensuring a precise foundation-to-frame process for architecturally demanding designs."
      }
    },
    {
      "@type": "Question",
      "name": "What sets Saddlewood Contracting apart from other home remodelers in Paradise Valley and Scottsdale?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Saddlewood Contracting stands apart through our commitment to refined craftsmanship, transparent communication, and a highly organized, clean construction process. We focus on building deep trust with our clients, delivering sophisticated design-build projects on time and on budget while treating your home with the utmost respect."
      }
    },
    {
      "@type": "Question",
      "name": "What types of kitchen and bathroom remodeling services does Saddlewood Contracting offer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Saddlewood Contracting specializes in luxury kitchen remodels and spa-grade bathroom renovations designed for modern desert living. Our projects incorporate premium materials such as custom white oak cabinetry, honed marble waterfall islands, brass hardware, and custom spa showers with freestanding soaking tubs to create highly functional, beautiful spaces."
      }
    },
    {
      "@type": "Question",
      "name": "Why should Paradise Valley and Scottsdale homeowners choose Saddlewood Contracting for their renovations?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Saddlewood Contracting is deeply rooted in the Scottsdale and Paradise Valley communities, understanding the unique architectural styles and high standards of desert-modern living. Our local expertise allows us to seamlessly navigate municipal guidelines while delivering tailored, sophisticated renovations that enhance both the value and daily enjoyment of your home."
      }
    },
    {
      "@type": "Question",
      "name": "Can you share examples of representative projects completed by Saddlewood Contracting?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Saddlewood Contracting has successfully completed diverse high-end projects, including a Paradise Valley whole-home remodel featuring a custom iron-and-glass wine wall, a McCormick Ranch open-concept kitchen with custom cabinetry and a wet bar, and a ground-up steel-framed custom home. Whether executing a detailed primary suite renovation or a complete indoor-outdoor living transformation, our team delivers consistent quality across all scopes."
      }
    },
    {
      "@type": "Question",
      "name": "How do I begin the design-build remodeling process with Saddlewood Contracting?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "To begin your home transformation, you can contact Saddlewood Contracting directly at (480) 999-6100 to discuss your project vision and timeline. Our team will guide you through the initial planning phases, from conceptual design and material selection to permitting and construction. Book a free consultation."
      }
    }
  ]
};

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Frequently Asked Questions</h1>
      <div className="mt-10 space-y-6">
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">What areas does Saddlewood Contracting serve for luxury home remodeling?</h2>
          <p className="mt-2 text-neutral-600">Saddlewood Contracting provides high-end design-build and remodeling services throughout Paradise Valley, Scottsdale, McCormick Ranch, Arcadia, Silverleaf, DC Ranch, and Grayhawk. As a local residential remodeler, our team is dedicated to transforming homes in these premier Arizona communities with exceptional craftsmanship and clear, reliable communication.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">Is Saddlewood Contracting licensed, and do you handle specialty trades like plumbing and electrical in-house?</h2>
          <p className="mt-2 text-neutral-600">Yes, Saddlewood Contracting is fully licensed to manage all aspects of your luxury renovation, holding Arizona ROC General Contractor License #305762, HVAC License #350714, Electrical License #350715, and Plumbing License #350716. By managing these key trades in-house, we ensure absolute quality control, consistent scheduling, and a clean, organized job site for our clients.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">Does Saddlewood Contracting handle ground-up new construction and structural steel-framed homes?</h2>
          <p className="mt-2 text-neutral-600">Yes, Saddlewood Contracting manages both whole-home renovations and ground-up custom home construction, including complex structural steel framing. Our in-house crews self-perform the structural steel skeleton, concrete slabs, and framing for custom builds in Paradise Valley, ensuring a precise foundation-to-frame process for architecturally demanding designs.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">What sets Saddlewood Contracting apart from other home remodelers in Paradise Valley and Scottsdale?</h2>
          <p className="mt-2 text-neutral-600">Saddlewood Contracting stands apart through our commitment to refined craftsmanship, transparent communication, and a highly organized, clean construction process. We focus on building deep trust with our clients, delivering sophisticated design-build projects on time and on budget while treating your home with the utmost respect.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">What types of kitchen and bathroom remodeling services does Saddlewood Contracting offer?</h2>
          <p className="mt-2 text-neutral-600">Saddlewood Contracting specializes in luxury kitchen remodels and spa-grade bathroom renovations designed for modern desert living. Our projects incorporate premium materials such as custom white oak cabinetry, honed marble waterfall islands, brass hardware, and custom spa showers with freestanding soaking tubs to create highly functional, beautiful spaces.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">Why should Paradise Valley and Scottsdale homeowners choose Saddlewood Contracting for their renovations?</h2>
          <p className="mt-2 text-neutral-600">Saddlewood Contracting is deeply rooted in the Scottsdale and Paradise Valley communities, understanding the unique architectural styles and high standards of desert-modern living. Our local expertise allows us to seamlessly navigate municipal guidelines while delivering tailored, sophisticated renovations that enhance both the value and daily enjoyment of your home.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">Can you share examples of representative projects completed by Saddlewood Contracting?</h2>
          <p className="mt-2 text-neutral-600">Saddlewood Contracting has successfully completed diverse high-end projects, including a Paradise Valley whole-home remodel featuring a custom iron-and-glass wine wall, a McCormick Ranch open-concept kitchen with custom cabinetry and a wet bar, and a ground-up steel-framed custom home. Whether executing a detailed primary suite renovation or a complete indoor-outdoor living transformation, our team delivers consistent quality across all scopes.</p>
        </div>
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="text-lg font-semibold text-neutral-900">How do I begin the design-build remodeling process with Saddlewood Contracting?</h2>
          <p className="mt-2 text-neutral-600">To begin your home transformation, you can contact Saddlewood Contracting directly at (480) 999-6100 to discuss your project vision and timeline. Our team will guide you through the initial planning phases, from conceptual design and material selection to permitting and construction. Book a free consultation.</p>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </main>
  );
}
