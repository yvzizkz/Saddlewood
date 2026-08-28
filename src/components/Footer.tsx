/**
 * Night Blueprint footer — the survey-horizon linework bookends the page
 * (the hero opens with the estate elevation, the footer closes with the
 * survey baseline), then a four-column ledger of real data: wordmark +
 * tagline, contact, the four ROC licenses, and the eight neighborhoods.
 */

import Link from "next/link";
import { SurveyHorizon } from "@/components/linework";
import { ProcoreBadge } from "./ProcoreBadge";

const licenses = [
  { trade: "General", roc: "ROC #305762" },
  { trade: "Electrical", roc: "ROC #350715" },
  { trade: "HVAC", roc: "ROC #350714" },
  { trade: "Plumbing", roc: "ROC #350716" },
];

const hoods = [
  { name: "Paradise Valley", slug: "paradise-valley" },
  { name: "Silverleaf", slug: "silverleaf" },
  { name: "DC Ranch", slug: "dc-ranch" },
  { name: "McCormick Ranch", slug: "mccormick-ranch" },
  { name: "Gainey Ranch", slug: "gainey-ranch" },
  { name: "Grayhawk", slug: "grayhawk" },
  { name: "Pinnacle Peak", slug: "pinnacle-peak" },
  { name: "Arcadia", slug: "arcadia" },
];

const colHeading =
  "text-[10.5px] font-medium uppercase tracking-[0.25em] text-gold mb-4";
const colLink =
  "text-[13px] text-off-white/[0.62] no-underline transition-colors hover:text-gold";

export function Footer() {
  return (
    <footer
      className="relative pt-[clamp(20px,3vh,36px)] pb-28 lg:pb-10"
      role="contentinfo"
    >
      {/* Survey horizon — bookend to the hero elevation */}
      <div className="mb-[clamp(40px,6vh,72px)]" aria-hidden="true">
        <SurveyHorizon className="block w-full" />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <div className="grid grid-cols-1 gap-10 min-[480px]:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] lg:gap-14">
          {/* Wordmark */}
          <div className="min-[480px]:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-block no-underline leading-none" aria-label="Saddlewood Contracting, home">
              <span className="block font-heading text-[26px] font-medium text-off-white">
                Saddlewood
              </span>
              <span className="mt-1.5 block text-[9px] font-medium uppercase tracking-[0.34em] text-gold">
                Contracting · Scottsdale
              </span>
            </Link>
            <p className="mt-5 max-w-[16em] font-heading text-[16px] font-normal italic leading-[1.5] text-off-white/65">
              Where Craftsmanship Meets Character
            </p>
            {/* Verified on the Procore Network — dofollow backlink */}
            <div className="mt-7">
              <ProcoreBadge width={124} />
            </div>
          </div>

          {/* Contact */}
          <div>
            <div className={colHeading}>Contact</div>
            <ul className="m-0 list-none space-y-2.5 p-0">
              <li>
                <a href="tel:4809996100" className={colLink}>
                  (480) 999-6100
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@saddlewoodcontracting.com"
                  className={`${colLink} break-all sm:break-normal`}
                >
                  info@saddlewoodcontracting.com
                </a>
              </li>
              <li className="text-[13px] text-off-white/[0.62]">
                Scottsdale, AZ 85258
              </li>
              <li className="text-[13px] text-off-white/[0.62]">
                Mon&ndash;Fri: 7am&ndash;5pm · Sat: By appointment
              </li>
            </ul>
          </div>

          {/* Licenses */}
          <div>
            <div className={colHeading}>Licenses</div>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {licenses.map((l) => (
                <li key={l.roc} className="text-[13px] text-off-white/[0.62]">
                  {l.trade} · <span className="tabular-nums">{l.roc}</span>
                </li>
              ))}
              <li className="pt-1 text-[11px] uppercase tracking-[0.14em] text-off-white/50">
                Licensed · Bonded · Insured
              </li>
            </ul>
          </div>

          {/* Neighborhoods */}
          <div>
            <div className={colHeading}>Neighborhoods</div>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {hoods.map((n) => (
                <li key={n.slug}>
                  <Link href={`/neighborhoods/${n.slug}`} className={colLink}>
                    {n.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-[clamp(48px,7vh,72px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-t border-off-white/[0.12] pt-6 text-[10.5px] uppercase tracking-[0.14em] text-off-white/55">
          <span>&copy; 2026 Saddlewood Contracting LLC</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/privacy" className="text-inherit no-underline transition-colors hover:text-gold">
              Privacy
            </Link>
            <span aria-hidden="true">&middot;</span>
            <Link href="/terms" className="text-inherit no-underline transition-colors hover:text-gold">
              Terms
            </Link>
            <span aria-hidden="true">&middot;</span>
            <Link href="/llm-info" className="text-inherit no-underline transition-colors hover:text-gold">
              Company Facts
            </Link>
          </span>
          <span>AZ ROC #305762 · Est. 2007</span>
        </div>
      </div>
    </footer>
  );
}
