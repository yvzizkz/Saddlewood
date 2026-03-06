import { ProjectGrid } from "@/components/ProjectGrid";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Remodeling Portfolio | Scottsdale Kitchen & Bath Projects",
  description:
    "Browse luxury kitchen, bathroom, and whole-home remodeling projects in McCormick Ranch, Gainey Ranch, and Pinnacle Peak. See real Saddlewood Contracting transformations in Scottsdale, AZ.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioPage() {
  return (
    <>
      <PageHero
        label="Portfolio"
        title="Our Work"
        description="Luxury remodels across Scottsdale's most prestigious neighborhoods. Click any project for full details."
        image="/images/mcr-kitchen-island-01.jpg"
        imageAlt="Luxury kitchen island remodel in McCormick Ranch by Saddlewood Contracting"
      />

      {/* Project Grid */}
      <section className="py-16 sm:py-20 lg:py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProjectGrid />
        </div>
      </section>
    </>
  );
}
