import Link from "next/link";

const services = [
  "Kitchen",
  "Bathroom",
  "Whole-Home",
  "Outdoor Living",
];

const trades = [
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

export function ServicesGrid() {
  return (
    <section
      className="bg-cream py-20 sm:py-28 lg:py-36 px-4 sm:px-6 lg:px-12"
      aria-label="Services"
    >
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 lg:gap-20 items-start">
        {/* Left — single editorial line */}
        <p className="font-heading font-medium text-teal text-[20px] sm:text-[22px] leading-[1.5] tracking-[-0.01em] max-w-[480px]">
          Four licenses. One crew. Every trade handled in-house from demo to final detail.
        </p>

        {/* Right — service stack + in-house trades + ROC credentials */}
        <div>
          <ul className="list-none p-0 m-0 mb-10 sm:mb-12">
            {services.map((service) => (
              <li key={service}>
                <Link
                  href="/services"
                  className="block font-heading text-[36px] sm:text-[40px] font-light leading-[1.2] text-teal hover:text-gold-accessible transition-colors no-underline"
                >
                  {service}
                </Link>
              </li>
            ))}
          </ul>

          <div className="text-[11px] tracking-[0.25em] uppercase text-charcoal-light mb-3">
            {trades.map((t, i) => (
              <span key={t.name}>
                {i > 0 && <span className="mx-2" aria-hidden="true">·</span>}
                {t.name}
              </span>
            ))}
          </div>

          <div className="text-[10px] tracking-[0.1em] uppercase text-charcoal-light opacity-50">
            {trades.map((t, i) => (
              <span key={t.roc}>
                {i > 0 && <span className="mx-2" aria-hidden="true">·</span>}
                {t.roc}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
