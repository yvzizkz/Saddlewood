import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: { absolute: "Free Remodeling Consultation in Scottsdale | Contact Saddlewood" },
  description:
    "Schedule your free, no-obligation design consultation with Scottsdale's trusted remodeling contractor. Serving McCormick Ranch, Gainey Ranch, and Pinnacle Peak. Call (480) 999-6100.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        label="Get In Touch"
        title="Let's Talk"
        description="Ready to transform your home? Start with a free consultation — we'd love to hear about your vision."
        image="/images/living1.jpg"
        imageAlt="Luxury living room remodel in Scottsdale by Saddlewood Contracting"
      />
      {/* Subcontractor / vendor prompt → bid-list page */}
      <div className="bg-teal-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <span className="text-stone/80 text-sm font-light">
            Are you a subcontractor or vendor?
          </span>
          <Link
            href="/trade-partners"
            className="text-gold text-sm font-light border-b border-gold/40 hover:border-gold transition-colors no-underline"
          >
            Get on our bid list →
          </Link>
        </div>
      </div>
      <ContactForm />
    </>
  );
}
