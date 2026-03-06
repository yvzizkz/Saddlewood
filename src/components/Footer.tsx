import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="bg-teal-dark border-t border-white/[0.06] pt-16 pb-8 px-6 lg:px-12">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Image src="/images/logo.svg" alt="Saddlewood Contracting" width={36} height={36} />
            <div>
              <div className="font-heading text-lg text-stone font-semibold">Saddlewood</div>
              <span className="text-[9px] tracking-[0.35em] uppercase text-gold font-medium block">Contracting</span>
            </div>
          </div>
          <p className="text-[13px] text-stone/35 italic font-light mt-3">
            &ldquo;Where Craftsmanship Meets Character&rdquo;
          </p>
        </div>

        {/* Services */}
        <div>
          <h4 className="font-sans text-[10px] font-medium tracking-[0.2em] uppercase text-stone/30 mb-5 not-italic">Services</h4>
          <ul className="space-y-2.5 list-none p-0 m-0">
            {["Kitchen Remodeling", "Bathroom Renovation", "Whole-Home Remodels", "Outdoor Living", "Electrical", "HVAC", "Plumbing"].map((svc) => (
              <li key={svc}>
                <Link href="/services" className="text-[13px] text-stone/55 font-light hover:text-gold transition-colors no-underline">{svc}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Neighborhoods + Company */}
        <div>
          <h4 className="font-sans text-[10px] font-medium tracking-[0.2em] uppercase text-stone/30 mb-5 not-italic">Neighborhoods</h4>
          <ul className="space-y-2.5 list-none p-0 m-0">
            {[
              { label: "McCormick Ranch", href: "/neighborhoods/mccormick-ranch" },
              { label: "Gainey Ranch", href: "/neighborhoods/gainey-ranch" },
              { label: "Pinnacle Peak CC", href: "/neighborhoods/pinnacle-peak" },
            ].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-[13px] text-stone/55 font-light hover:text-gold transition-colors no-underline">{n.label}</Link>
              </li>
            ))}
          </ul>
          <h4 className="font-sans text-[10px] font-medium tracking-[0.2em] uppercase text-stone/30 mt-8 mb-5 not-italic">Company</h4>
          <ul className="space-y-2.5 list-none p-0 m-0">
            {[
              { label: "Our Work", href: "/portfolio" },
              { label: "About", href: "/about" },
              { label: "Contact", href: "/contact" },
            ].map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="text-[13px] text-stone/55 font-light hover:text-gold transition-colors no-underline">{c.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact + Hours */}
        <div>
          <h4 className="font-sans text-[10px] font-medium tracking-[0.2em] uppercase text-stone/30 mb-5 not-italic">Contact</h4>
          <ul className="space-y-2.5 list-none p-0 m-0">
            <li><a href="tel:4809996100" className="text-[13px] text-stone/55 font-light hover:text-gold transition-colors no-underline">(480) 999-6100</a></li>
            <li><a href="mailto:info@saddlewoodcontracting.com" className="text-[13px] text-stone/55 font-light hover:text-gold transition-colors no-underline">info@saddlewoodcontracting.com</a></li>
            <li><span className="text-[13px] text-stone/55 font-light">Scottsdale, AZ 85258</span></li>
          </ul>
          <h4 className="font-sans text-[10px] font-medium tracking-[0.2em] uppercase text-stone/30 mt-8 mb-5 not-italic">Hours</h4>
          <ul className="space-y-2 list-none p-0 m-0">
            <li className="text-[13px] text-stone/40">Mon&ndash;Fri: 7am &ndash; 5pm</li>
            <li className="text-[13px] text-stone/40">Sat: By appointment</li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="max-w-[1200px] mx-auto mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="text-[11px] text-stone/20">&copy; 2026 Saddlewood Contracting LLC. All rights reserved.</p>
        <p className="text-[11px] text-stone/20">Licensed &middot; Bonded &middot; Insured &middot; Arizona ROC</p>
      </div>
    </footer>
  );
}
