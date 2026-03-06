"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Phone } from "lucide-react";
import Image from "next/image";

const credentials = [
  {
    title: "General Contractor",
    detail: "ROC #305762",
    description: "Full-scope general contracting for residential remodels of any size.",
  },
  {
    title: "HVAC License",
    detail: "ROC #350714",
    description: "We install and service climate systems built for Arizona heat.",
  },
  {
    title: "Electrical License",
    detail: "ROC #350715",
    description: "Licensed electricians on every project — no outside subs needed.",
  },
  {
    title: "Plumbing License",
    detail: "ROC #350716",
    description: "From fixture swaps to full re-pipes, all done in-house.",
  },
];

const values = [
  {
    title: "Craftsmanship First",
    description: "We never cut corners. Every joint, every seam, every finish is executed to the highest standard.",
  },
  {
    title: "Client Partnership",
    description: "Your home, your vision. We listen first, advise second, and build exactly what you want.",
  },
  {
    title: "Local Expertise",
    description: "We know Scottsdale's HOA requirements, permit processes, and architectural styles inside and out.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[500px] flex items-end bg-teal-dark">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-2xl">
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
              About Us
            </span>
            <h1 className="font-heading text-6xl lg:text-7xl font-light text-stone mt-6 mb-6 leading-tight">
              Our Story
            </h1>
            <p className="text-stone/70 max-w-2xl text-lg font-light leading-relaxed">
              Built on a foundation of integrity, quality, and a deep love for transforming Scottsdale homes.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative h-[500px] border border-charcoal-light"
            >
              <Image
                src="/images/kitchen1.jpg"
                alt="Saddlewood craftsmanship"
                fill
                className="object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-charcoal to-charcoal/0 p-8">
                <p className="text-gold text-sm font-light">Saddlewood Team</p>
                <p className="text-stone/60 text-xs font-light">Scottsdale, Arizona</p>
              </div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="h-px w-8 bg-gold" />
                <span className="section-label">Heritage</span>
              </div>
              <h2 className="font-heading text-5xl font-light text-charcoal mb-8 leading-tight">
                Where Craftsmanship Meets Character
              </h2>
              <div className="space-y-6 text-charcoal-light font-light leading-relaxed">
                <p>
                  Saddlewood Contracting was founded with a simple belief: homeowners in Scottsdale&apos;s finest neighborhoods deserve a contractor who treats their home with the same care and attention to detail as if it were their own.
                </p>
                <p>
                  What sets us apart is our ability to handle every aspect of your remodel in-house. With four active ROC licenses — General, HVAC, Electrical, and Plumbing — we eliminate the coordination headaches that come with managing multiple subcontractors.
                </p>
                <p>
                  We specialize in the communities we know best: McCormick Ranch, Gainey Ranch, and Pinnacle Peak Country Club. This hyper-local focus means we understand the architectural styles, HOA requirements, and design preferences that make each neighborhood unique.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-20"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px w-8 bg-gold" />
              <span className="section-label">Values</span>
            </div>
            <h2 className="font-heading text-5xl font-light text-charcoal">
              What Drives Us
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="border-b border-gold mb-6 pb-6">
                  <h3 className="font-heading text-2xl font-light text-charcoal mb-4">
                    {v.title}
                  </h3>
                </div>
                <p className="text-charcoal-light font-light leading-relaxed text-sm">
                  {v.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-20"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px w-8 bg-gold" />
              <span className="section-label">Credentials</span>
            </div>
            <h2 className="font-heading text-5xl font-light text-charcoal">
              Licensed, Bonded & Insured
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {credentials.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-cream border border-charcoal-light p-8"
              >
                <h3 className="font-heading text-lg font-light text-charcoal mb-2">
                  {c.title}
                </h3>
                <p className="text-gold font-light text-sm mb-4">{c.detail}</p>
                <p className="text-charcoal-light text-sm font-light leading-relaxed">{c.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Area */}
      <section className="py-24 bg-charcoal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px w-8 bg-gold" />
              <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
                Service Area
              </span>
            </div>
            <h2 className="font-heading text-5xl font-light text-stone mb-6 leading-tight">
              Proudly Serving Scottsdale
            </h2>
            <p className="text-stone/70 max-w-2xl font-light leading-relaxed mb-12">
              Our hyper-local focus means deeper expertise and stronger relationships in the communities where we work.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mb-12">
              {["McCormick Ranch · 85258", "Gainey Ranch · 85258", "Pinnacle Peak CC · 85255"].map(
                (area) => (
                  <div
                    key={area}
                    className="bg-stone/10 border border-gold/30 px-6 py-4"
                  >
                    <p className="text-stone text-sm font-light">{area}</p>
                  </div>
                )
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/contact"
                className="bg-gold hover:bg-gold-muted text-charcoal px-8 py-3 font-light transition-all border border-gold"
              >
                Schedule Consultation
              </Link>
              <a
                href="tel:4809996100"
                className="flex items-center gap-2 text-stone/80 hover:text-gold transition-colors font-light border-b border-stone/20 hover:border-gold pb-2"
              >
                <Phone className="w-5 h-5" />
                (480) 999-6100
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
