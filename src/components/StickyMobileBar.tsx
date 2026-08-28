"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { track } from "@/lib/analytics";

// Mobile-only sticky action bar: one-tap call + book CTA. Hidden at lg+ where the
// navbar's own "Book Your Consultation" CTA is visible. Night Blueprint chrome:
// teal-dark glass with a gold hairline so it reads as part of the shell.
export function StickyMobileBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-gold/[0.22] bg-[rgba(26,47,47,0.92)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
      <a
        href="tel:4809996100"
        onClick={() => track("phone_tap", { location: "sticky_mobile_bar" })}
        className="flex items-center gap-2 rounded-[2px] border border-gold/60 px-4 py-3 text-gold"
        aria-label="Call Saddlewood Contracting at (480) 999-6100"
      >
        <Phone className="size-4" aria-hidden="true" />
        <span className="text-sm font-medium">Call</span>
      </a>
      <Link
        href="/contact"
        onClick={() =>
          track("cta_click", { cta: "book_consultation", location: "sticky_mobile_bar" })
        }
        className="flex-1 rounded-[2px] bg-gold py-3 text-center text-sm font-semibold uppercase tracking-[0.08em] text-teal-dark transition-colors hover:bg-[#d4a94c]"
      >
        Book Consultation
      </Link>
    </div>
  );
}
