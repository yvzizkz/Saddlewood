import Link from "next/link";
import Image from "next/image";
import { Instagram, Facebook, Linkedin } from "lucide-react";
import { ProcoreBadge } from "./ProcoreBadge";

export function Footer() {
  return (
    <footer className="bg-charcoal border-t border-white/[0.06] pt-12 sm:pt-16 pb-24 lg:pb-8 px-4 sm:px-6 lg:px-12" role="contentinfo">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center mb-3 no-underline" aria-label="Saddlewood Contracting — home">
            <div className="relative w-[56px] h-[56px] shrink-0">
              <Image
                src="/images/logo.png"
                alt="Saddlewood Contracting LLC"
                fill
                sizes="80px"
                className="object-contain"
              />
            </div>
          </Link>
          <p className="text-sm text-stone/40 italic font-light mt-3">
            &ldquo;Where Craftsmanship Meets Character&rdquo;
          </p>
          <p className="text-[13px] text-white/60 font-light leading-relaxed mt-5 max-w-[240px]">
            Serving Scottsdale&apos;s premier neighborhoods since 2007.
          </p>
          {/* TODO: Replace href="#" with real social URLs once available */}
          <div className="flex items-center gap-4 mt-6">
            <a
              href="#"
              aria-label="Instagram"
              className="inline-flex p-2 -m-2 text-white/60 hover:text-gold transition-colors"
            >
              <Instagram className="w-5 h-5" strokeWidth={1.5} />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="inline-flex p-2 -m-2 text-white/60 hover:text-gold transition-colors"
            >
              <Facebook className="w-5 h-5" strokeWidth={1.5} />
            </a>
            <a
              href="#"
              aria-label="LinkedIn"
              className="inline-flex p-2 -m-2 text-white/60 hover:text-gold transition-colors"
            >
              <Linkedin className="w-5 h-5" strokeWidth={1.5} />
            </a>
          </div>
          {/* Verified on the Procore Network — dofollow backlink */}
          <div className="mt-7">
            <ProcoreBadge width={132} />
          </div>
        </div>

        {/* Services */}
        <div>
          <h4 className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase text-gold/80 mb-4 sm:mb-5 not-italic">Services</h4>
          <ul className="space-y-2 sm:space-y-2.5 list-none p-0 m-0">
            {[
              { label: "New Construction", href: "/new-construction" },
              { label: "Framing Crew", href: "/framing" },
              { label: "Kitchen Remodeling", href: "/services" },
              { label: "Bathroom Renovation", href: "/services" },
              { label: "Whole-Home Remodels", href: "/services" },
              { label: "Outdoor Living", href: "/services" },
              { label: "Electrical", href: "/services" },
              { label: "HVAC", href: "/services" },
              { label: "Plumbing", href: "/services" },
            ].map((svc) => (
              <li key={svc.label}>
                <Link href={svc.href} className="text-sm text-white/75 font-light hover:text-gold transition-colors no-underline">{svc.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Neighborhoods + Company */}
        <div>
          <h4 className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase text-gold/80 mb-4 sm:mb-5 not-italic">Areas We Serve</h4>
          <ul className="space-y-2 sm:space-y-2.5 list-none p-0 m-0">
            {[
              { label: "All Areas", href: "/neighborhoods" },
              { label: "McCormick Ranch", href: "/neighborhoods/mccormick-ranch" },
              { label: "Gainey Ranch", href: "/neighborhoods/gainey-ranch" },
              { label: "Arcadia", href: "/neighborhoods/arcadia" },
              { label: "Paradise Valley", href: "/neighborhoods/paradise-valley" },
              { label: "Silverleaf", href: "/neighborhoods/silverleaf" },
              { label: "DC Ranch", href: "/neighborhoods/dc-ranch" },
              { label: "Grayhawk", href: "/neighborhoods/grayhawk" },
              { label: "Pinnacle Peak", href: "/neighborhoods/pinnacle-peak" },
            ].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-sm text-white/75 font-light hover:text-gold transition-colors no-underline">{n.label}</Link>
              </li>
            ))}
          </ul>
          <h4 className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase text-gold/80 mt-6 sm:mt-8 mb-4 sm:mb-5 not-italic">Company</h4>
          <ul className="space-y-2 sm:space-y-2.5 list-none p-0 m-0">
            {[
              { label: "Our Work", href: "/portfolio" },
              { label: "About", href: "/about" },
              { label: "Trade Partners", href: "/trade-partners" },
              { label: "Careers", href: "/careers" },
              { label: "Contact", href: "/contact" },
            ].map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="text-sm text-white/75 font-light hover:text-gold transition-colors no-underline">{c.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact + Hours */}
        <div className="col-span-2 sm:col-span-1">
          <h4 className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase text-gold/80 mb-4 sm:mb-5 not-italic">Contact</h4>
          <ul className="space-y-2 sm:space-y-2.5 list-none p-0 m-0">
            <li><a href="tel:4809996100" className="text-sm text-white/75 font-light hover:text-gold transition-colors no-underline">(480) 999-6100</a></li>
            <li><a href="mailto:info@saddlewoodcontracting.com" className="text-sm text-white/75 font-light hover:text-gold transition-colors no-underline break-all sm:break-normal">info@saddlewoodcontracting.com</a></li>
            <li><span className="text-sm text-white/75 font-light">Scottsdale, AZ 85258</span></li>
          </ul>
          <h4 className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase text-gold/80 mt-6 sm:mt-8 mb-4 sm:mb-5 not-italic">Hours</h4>
          <ul className="space-y-2 list-none p-0 m-0">
            <li className="text-sm text-white/75 font-light">Mon&ndash;Fri: 7am &ndash; 5pm</li>
            <li className="text-sm text-white/75 font-light">Sat: By appointment</li>
          </ul>
        </div>
      </div>

      {/* Gold rule between footer body and copyright bar */}
      <div className="max-w-[1200px] mx-auto mt-8 sm:mt-10 border-t border-[#b5954a]/20" />

      {/* Bottom bar */}
      <div className="max-w-[1200px] mx-auto pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="text-[11px] text-white/40">&copy; 2026 Saddlewood Contracting LLC. All rights reserved.</p>
        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <Link href="/privacy" className="hover:text-gold transition-colors no-underline">Privacy</Link>
          <span>&middot;</span>
          <Link href="/terms" className="hover:text-gold transition-colors no-underline">Terms</Link>
          <span aria-hidden="true">·</span>
          <Link href="/llm-info" className="hover:text-gold transition-colors no-underline">Company Facts</Link>
          <span>&middot;</span>
          <span>Licensed &middot; Bonded &middot; Insured &middot; Arizona ROC</span>
        </div>
      </div>
    </footer>
  );
}
