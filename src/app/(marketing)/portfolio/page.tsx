import { ProjectGrid } from "@/components/ProjectGrid";
import { PageHero } from "@/components/PageHero";
import { VideoReel } from "@/components/VideoReel";

export const metadata = {
  title: "Remodeling Portfolio | Scottsdale Kitchen & Bath Projects | Saddlewood",
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
        description="Luxury remodels across Scottsdale's most prestigious neighborhoods."
        image="/images/pv-exterior-fireplace-twilight.jpg"
        imageAlt="Paradise Valley outdoor fireplace and covered patio at twilight"
      />

      {/* Project Grid */}
      <section className="py-10 sm:py-12 lg:py-16 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProjectGrid />
        </div>
      </section>

      {/* Our Work in Motion Section */}
      <section className="py-20 sm:py-24 lg:py-28 bg-off-white border-t border-stone-mid/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <div className="section-label">Media Gallery</div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-[40px] font-light text-charcoal leading-tight">
              Our Work in Motion
            </h2>
            <p className="mt-4 text-charcoal-light font-light leading-relaxed text-[15px] sm:text-base max-w-[720px]">
              Watch our building process and finished craftsmanship unfold. Click any reel below to play.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            <div className="flex flex-col gap-3">
              <VideoReel
                src="/videos/stitched-reel-9x16.mp4"
                poster="/videos/stitched-reel-9x16-poster.jpg"
                label="Stitched highlights reel showing completed luxury residential construction projects"
                aspect="9x16"
                mode="clickToPlay"
              />
              <div>
                <h3 className="font-heading text-lg font-light text-charcoal">Finished Projects Showcase</h3>
                <p className="text-charcoal-light text-xs sm:text-sm font-light leading-relaxed mt-1">
                  A stitched highlights reel of our completed luxury residential work.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <VideoReel
                src="/videos/process-timeline-9x16.mp4"
                poster="/videos/process-timeline-9x16-poster.jpg"
                label="Retrospective timeline of the completed 40th Street wood-framed build"
                aspect="9x16"
                mode="clickToPlay"
              />
              <div>
                <h3 className="font-heading text-lg font-light text-charcoal">40th Street Wood Build</h3>
                <p className="text-charcoal-light text-xs sm:text-sm font-light leading-relaxed mt-1">
                  Retrospective process timeline of our completed wood-frame whole-home build.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <VideoReel
                src="/videos/kitchen-kenburns-16x9.mp4"
                poster="/videos/kitchen-kenburns-16x9-poster.jpg"
                label="Ken-Burns motion clip over finished kitchen remodel photography"
                aspect="16x9"
                mode="clickToPlay"
              />
              <div>
                <h3 className="font-heading text-lg font-light text-charcoal">Luxury Kitchen Finish</h3>
                <p className="text-charcoal-light text-xs sm:text-sm font-light leading-relaxed mt-1">
                  Slow-motion cinematic view showing the details of a completed chef&apos;s kitchen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

