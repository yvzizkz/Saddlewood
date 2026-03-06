import { ProjectGrid } from "@/components/ProjectGrid";

export const metadata = {
  title: "Remodeling Portfolio | Scottsdale Kitchen & Bath Projects",
  description:
    "Browse luxury kitchen, bathroom, and whole-home remodeling projects in McCormick Ranch, Gainey Ranch, and Pinnacle Peak. See real Saddlewood Contracting transformations in Scottsdale, AZ.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[500px] flex items-end bg-teal-dark">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-2xl">
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
              Portfolio
            </span>
            <h1 className="font-heading text-6xl lg:text-7xl font-light text-stone mt-6 mb-6 leading-tight">
              Our Work
            </h1>
            <p className="text-stone/70 max-w-2xl text-lg font-light leading-relaxed">
              Luxury remodels across Scottsdale&apos;s most prestigious neighborhoods. Click any project for full details.
            </p>
          </div>
        </div>
      </section>

      {/* Project Grid */}
      <section className="py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProjectGrid />
        </div>
      </section>
    </>
  );
}
