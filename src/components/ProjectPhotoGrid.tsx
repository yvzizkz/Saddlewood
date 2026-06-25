"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const photos = [
  {
    src: "/images/pv-kitchen-farmhouse-sink.jpg",
    alt: "Paradise Valley kitchen with farmhouse sink and brass fixtures",
    caption: "Farmhouse sink with brass fixtures",
    category: "Kitchen",
  },
  {
    src: "/images/pv-shower-dual-brass.jpg",
    alt: "Paradise Valley luxury dual rain shower with marble tile",
    caption: "Dual rain shower with marble tile",
    category: "Bathroom",
  },
  {
    src: "/images/pv-custom-closet.jpg",
    alt: "Paradise Valley custom walk-in closet with built-in shelving",
    caption: "Custom walk-in closet with built-ins",
    category: "Closet",
  },
  {
    src: "/images/pv-kitchen-sage-cabinets.jpg",
    alt: "Paradise Valley kitchen with sage cabinetry and integrated appliances",
    caption: "Sage cabinetry with integrated appliances",
    category: "Kitchen",
  },
];

export function ProjectPhotoGrid() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Project photos">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-12">
          <div className="section-label">Our Craftsmanship</div>
          <h2 className="font-heading text-3xl lg:text-[42px] font-medium text-teal max-w-[560px] leading-[1.15] tracking-[-0.02em] mb-5">
            Detail-driven results
          </h2>
          <p className="text-[15px] text-charcoal-light max-w-[480px] leading-relaxed font-light">
            From kitchens and bathrooms to custom storage — a recent Paradise Valley whole-home remodel showcasing what our in-house team delivers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.src}
              className="relative h-[300px] sm:h-[340px] overflow-hidden cursor-pointer group"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width:768px) 33vw, 100vw"
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
              <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 delay-50">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold font-medium mb-1.5">
                  {photo.category} &middot; Paradise Valley
                </div>
                <p className="text-white/70 text-[13px] font-light leading-relaxed">
                  {photo.caption}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
