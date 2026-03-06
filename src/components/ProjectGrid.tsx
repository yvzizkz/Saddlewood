"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

const projects = [
  {
    id: 1,
    title: "Modern Kitchen with Custom Island",
    neighborhood: "McCormick Ranch",
    category: "Kitchen",
    image: "/images/mcr-kitchen-island-01.jpg",
    description: "Complete kitchen overhaul featuring a custom waterfall island, quartz countertops, and soft-close cabinetry.",
    caption: "Custom waterfall island with integrated prep sink and pendant lighting — the centerpiece of this McCormick Ranch kitchen transformation.",
    scope: ["Custom island with waterfall edge", "Quartz countertops", "Under-cabinet LED lighting", "Soft-close cabinetry", "Tile backsplash"],
  },
  {
    id: 2,
    title: "Spa-Inspired Master Bath",
    neighborhood: "McCormick Ranch",
    category: "Bathroom",
    image: "/images/mcr-bathroom-tub.jpg",
    description: "Freestanding soaking tub beneath a statement chandelier, with heated tile floors and custom vanity.",
    caption: "A freestanding soaking tub and chandelier transform this master bath into a private retreat — just minutes from McCormick Ranch's lakeside trails.",
    scope: ["Freestanding soaking tub", "Statement chandelier", "Heated tile floors", "Custom vanity", "Frameless glass shower"],
  },
  {
    id: 3,
    title: "Chef's Kitchen with Mountain Views",
    neighborhood: "Pinnacle Peak",
    category: "Kitchen",
    image: "/images/pp-kitchen-island.jpg",
    description: "Massive prep island, professional-grade range, and custom pantry system with views of Pinnacle Peak.",
    caption: "A professional-grade island kitchen designed for serious entertaining — with sightlines to Pinnacle Peak from every angle.",
    scope: ["Oversized island", "Professional range", "Custom pantry", "Pot filler", "Mountain view windows"],
  },
  {
    id: 4,
    title: "Great Room with Desert Views",
    neighborhood: "Pinnacle Peak",
    category: "Living",
    image: "/images/pp-great-room-view.jpg",
    description: "Expansive great room with floor-to-ceiling windows framing backyard and mountain views.",
    caption: "Floor-to-ceiling glass dissolves the boundary between indoors and out — the Sonoran desert becomes part of the living room.",
    scope: ["Floor-to-ceiling windows", "Linear gas fireplace", "Built-in entertainment", "Statement lighting"],
  },
  {
    id: 5,
    title: "Custom Wet Bar & Wine Wall",
    neighborhood: "McCormick Ranch",
    category: "Living",
    image: "/images/mcr-wetbar.jpg",
    description: "Floating shelves, integrated wine wall, and beverage center — designed, built, and wired by our in-house team.",
    caption: "Every detail of this wet bar was handled in-house — from the custom floating shelves to the electrical work powering the wine refrigeration.",
    scope: ["Wine storage wall", "Floating shelves", "Beverage center", "LED accent lighting", "In-house electrical"],
  },
  {
    id: 6,
    title: "Statement Fireplace Surround",
    neighborhood: "Pinnacle Peak",
    category: "Living",
    image: "/images/pp-fireplace.jpg",
    description: "Floor-to-ceiling stone fireplace with linear gas insert and integrated accent lighting.",
    caption: "A floor-to-ceiling stone surround with concealed LED strip lighting transforms this fireplace into the room's architectural anchor.",
    scope: ["Floor-to-ceiling stone", "Linear gas insert", "Integrated LED lighting", "Custom mantel"],
  },
  {
    id: 7,
    title: "Indoor-Outdoor Dining",
    neighborhood: "Pinnacle Peak",
    category: "Outdoor",
    image: "/images/pp-dining-patio.jpg",
    description: "Seamless dining experience with retractable walls opening to a covered desert patio.",
    caption: "The dining room opens fully to the covered patio — a design that makes the most of 300+ days of Arizona sunshine.",
    scope: ["Retractable glass walls", "Covered patio", "Outdoor lighting", "Desert landscaping"],
  },
  {
    id: 8,
    title: "Contemporary Kitchen Redesign",
    neighborhood: "Gainey Ranch",
    category: "Kitchen",
    image: "/images/gr-kitchen-island.jpg",
    description: "Sleek flat-panel cabinetry, integrated appliances, and open-concept flow connecting kitchen to living areas.",
    caption: "This Gainey Ranch kitchen pairs a massive quartzite island with integrated appliances for a clean, uncluttered look befitting the community's design standards.",
    scope: ["Flat-panel cabinetry", "Quartzite island", "Integrated appliances", "Open-concept layout"],
  },
  {
    id: 9,
    title: "Luxury Walk-In Shower",
    neighborhood: "McCormick Ranch",
    category: "Bathroom",
    image: "/images/mcr-bathroom-shower.jpg",
    description: "Frameless glass walk-in shower with bench seating, rain head, and natural stone tile.",
    caption: "Floor-to-ceiling stone tile and frameless glass create a seamless, spa-like shower experience.",
    scope: ["Frameless glass enclosure", "Rain showerhead", "Bench seating", "Natural stone tile"],
  },
];

const categories = ["All", "Kitchen", "Bathroom", "Living", "Outdoor"];
const neighborhoodFilters = ["All", "McCormick Ranch", "Gainey Ranch", "Pinnacle Peak"];

export function ProjectGrid() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeNeighborhood, setActiveNeighborhood] = useState("All");
  const [selectedProject, setSelectedProject] = useState<(typeof projects)[0] | null>(null);

  const filtered = projects.filter((p) => {
    const catMatch = activeCategory === "All" || p.category === activeCategory;
    const hoodMatch = activeNeighborhood === "All" || p.neighborhood === activeNeighborhood;
    return catMatch && hoodMatch;
  });

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-12">
        <div>
          <span className="text-[10px] tracking-[0.2em] uppercase text-charcoal-light block mb-3">Category</span>
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 text-[12px] tracking-[0.05em] uppercase font-medium transition-all ${
                  activeCategory === cat
                    ? "bg-teal text-stone"
                    : "bg-transparent text-charcoal/60 hover:text-teal border border-charcoal/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-[10px] tracking-[0.2em] uppercase text-charcoal-light block mb-3">Neighborhood</span>
          <div className="flex flex-wrap gap-1">
            {neighborhoodFilters.map((hood) => (
              <button
                key={hood}
                onClick={() => setActiveNeighborhood(hood)}
                className={`px-4 py-2 text-[12px] tracking-[0.05em] uppercase font-medium transition-all ${
                  activeNeighborhood === hood
                    ? "bg-gold text-teal-dark"
                    : "bg-transparent text-charcoal/60 hover:text-teal border border-charcoal/10"
                }`}
              >
                {hood}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        <AnimatePresence mode="popLayout">
          {filtered.map((project) => (
            <motion.div
              key={project.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setSelectedProject(project)}
              className="group cursor-pointer"
            >
              <div className="relative h-72 overflow-hidden">
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
                <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-400">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-gold font-medium mb-1">
                    {project.category} &middot; {project.neighborhood}
                  </div>
                  <h3 className="font-heading text-lg text-white font-medium mb-1.5">{project.title}</h3>
                  <p className="text-white/60 text-[12px] font-light leading-relaxed line-clamp-2">
                    {project.caption}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Project Detail Modal */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-teal-dark/90 backdrop-blur-sm"
            onClick={() => setSelectedProject(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-off-white max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Image */}
              <div className="relative h-72 sm:h-96">
                <Image
                  src={selectedProject.image}
                  alt={selectedProject.title}
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => setSelectedProject(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                >
                  <X className="w-5 h-5 text-teal" />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 lg:p-10">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold font-medium mb-2">
                  {selectedProject.category} &middot; {selectedProject.neighborhood}
                </div>
                <h2 className="font-heading text-2xl lg:text-3xl font-medium text-teal mb-4">
                  {selectedProject.title}
                </h2>
                <p className="text-[15px] text-charcoal-light leading-relaxed font-light mb-4">
                  {selectedProject.description}
                </p>

                {/* Caption / Story */}
                {selectedProject.caption && (
                  <div className="border-l-2 border-gold/40 pl-5 mb-8">
                    <p className="text-[14px] text-charcoal/70 italic font-light leading-relaxed">
                      {selectedProject.caption}
                    </p>
                  </div>
                )}

                <h4 className="text-[10px] font-medium tracking-[0.2em] uppercase text-charcoal-light mb-4">
                  Scope of Work
                </h4>
                <div className="flex flex-wrap gap-2 mb-10">
                  {selectedProject.scope.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1.5 bg-stone text-[12px] text-charcoal/70 font-light"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <Link
                  href="/contact"
                  className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all"
                >
                  Start a Similar Project
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
