import Link from "next/link";
import { EngagementPlanner } from "@/components/EngagementPlanner";
import { BrandPlateHero } from "@/components/BrandPlateHero";
import { Phone, Mail, MapPin, ShieldCheck, Check } from "lucide-react";

export const metadata = {
  title: { absolute: "Free Remodeling Consultation in Scottsdale | Contact Saddlewood" },
  description:
    "Schedule your free, no-obligation design consultation with Scottsdale's trusted remodeling contractor. Serving McCormick Ranch, Gainey Ranch, and Pinnacle Peak. Call (480) 999-6100.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <BrandPlateHero
        eyebrow="Get In Touch"
        title="Let's Talk"
        description="Ready to transform your home? Start with a consultation or explore your project path below. We'd love to hear about your vision."
        minHeightClass="min-h-[58svh]"
      />

      {/* Main unified contact surface: Interactive planner on the left,
          direct contact details & expectations on the right. */}
      <section
        className="relative border-b border-gold/[0.22] py-[clamp(64px,8vh,104px)]"
        aria-label="Contact and project engagement"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.85fr)] lg:gap-16">
            {/* Left: Interactive Engagement Planner & Direct Note */}
            <div>
              <EngagementPlanner embedded />
            </div>

            {/* Right: Direct Channels & Consultation Expectations */}
            <aside className="space-y-6 lg:sticky lg:top-[110px]">
              {/* Primary Direct Channels Card */}
              <div className="rounded-[2px] border border-gold/[0.22] bg-[rgba(18,29,29,0.7)] p-6 backdrop-blur-xl sm:p-8">
                <div className="flex items-center justify-between border-b border-off-white/[0.08] pb-4">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-gold">
                    Direct Inquiries
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/60">
                    Scottsdale, AZ
                  </span>
                </div>

                <div className="mt-6 space-y-6">
                  <a
                    href="tel:4809996100"
                    className="group flex items-start gap-4 text-off-white no-underline transition-colors hover:text-gold"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-gold/30 bg-gold/[0.06] text-gold transition-colors group-hover:border-gold">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-off-white/60">
                        Telephone
                      </p>
                      <p className="mt-0.5 font-heading text-[18px] font-medium text-off-white group-hover:text-gold">
                        (480) 999-6100
                      </p>
                      <p className="text-[12px] text-off-white/60">Mon–Fri 7am – 5pm · Sat by appt</p>
                    </div>
                  </a>

                  <a
                    href="mailto:info@saddlewoodcontracting.com"
                    className="group flex items-start gap-4 text-off-white no-underline transition-colors hover:text-gold"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-gold/30 bg-gold/[0.06] text-gold transition-colors group-hover:border-gold">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-off-white/50">
                        Direct Email
                      </p>
                      <p className="mt-0.5 break-all text-[14.5px] font-medium text-off-white group-hover:text-gold">
                        info@saddlewoodcontracting.com
                      </p>
                      <p className="text-[12px] text-off-white/60">Reviewed daily by our team</p>
                    </div>
                  </a>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-gold/30 bg-gold/[0.06] text-gold">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-off-white/50">
                        Service Territory
                      </p>
                      <p className="mt-0.5 text-[14px] font-medium text-off-white">
                        Scottsdale &amp; Paradise Valley
                      </p>
                      <p className="text-[12px] text-off-white/60">
                        Arcadia · DC Ranch · Silverleaf · Gainey Ranch
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t border-off-white/[0.08] pt-5">
                  <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-off-white/60">
                    <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                    <span>ROC #305762 · Licensed &amp; Insured</span>
                  </div>
                </div>
              </div>

              {/* Consultation Expectations Card */}
              <div className="rounded-[2px] border border-off-white/[0.12] bg-[rgba(18,29,29,0.4)] p-6 backdrop-blur-xl sm:p-7">
                <h3 className="font-heading text-[17px] font-medium tracking-[-0.01em] text-off-white">
                  What to Expect
                </h3>
                <div className="mt-4 space-y-3.5">
                  {[
                    "Guaranteed response within 24 hours",
                    "On-site property walk & scope consultation",
                    "Itemized, developed pricing with no hidden allowances",
                    "Clear preconstruction milestones before build commitment",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />
                      <span className="text-[13px] leading-[1.6] text-off-white/75">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Trade / vendor prompt → bid-list page */}
      <div className="border-b border-gold/[0.22] bg-teal-dark/30">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4 text-center sm:px-8">
          <span className="text-sm text-off-white/70">
            Are you a trade partner or vendor?
          </span>
          <Link
            href="/trade-partners"
            className="border-b border-gold/40 text-sm text-gold no-underline transition-colors hover:border-gold"
          >
            Get on our bid list →
          </Link>
        </div>
      </div>
    </>
  );
}
