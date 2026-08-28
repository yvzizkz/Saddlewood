import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";
import { PlanFragment } from "@/components/linework";

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
        description="Ready to transform your home? Start with a free consultation. We'd love to hear about your vision."
        linework={
          <PlanFragment className="ml-auto block h-auto w-full max-w-[520px]" glow />
        }
      />

      {/* Subcontractor / vendor prompt → bid-list page */}
      <div className="border-y border-gold/[0.22]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4 text-center sm:px-8">
          <span className="text-sm text-off-white/70">
            Are you a subcontractor or vendor?
          </span>
          <Link
            href="/trade-partners"
            className="border-b border-gold/40 text-sm text-gold no-underline transition-colors hover:border-gold"
          >
            Get on our bid list →
          </Link>
        </div>
      </div>

      {/* The form paints its own cream section; night-on-cream restores the
          accessible-gold section label on the light ground. */}
      <div className="night-on-cream">
        <ContactForm />
      </div>
    </>
  );
}
