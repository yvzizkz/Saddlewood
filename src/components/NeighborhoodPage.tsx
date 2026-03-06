"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Phone } from "lucide-react";
import type { NeighborhoodData } from "@/lib/neighborhoods";

export function NeighborhoodPage({ data }: { data: NeighborhoodData }) {
  return (
    <>
      {/* Hero */}
      <section className="relative h-screen min-h-[600px] flex items-end overflow-hidden bg-teal-dark">
        <Image
          src={data.heroImage}
          alt={`${data.fullName} remodeling by Saddlewood Contracting`}
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-teal-dark/70 to-teal-dark/20" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
              {data.zip}
            </span>
            <h1 className="font-heading text-6xl lg:text-7xl font-light text-stone mt-4 mb-6 leading-tight">
              Remodeling in
              <br />
              <span className="text-gold">{data.fullName}</span>
            </h1>
            <p className="text-stone/80 text-lg font-light max-w-xl leading-relaxed">
              {data.tagline}
            </p>
          </motion.div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="h-px w-8 bg-gold" />
                <span className="section-label">About</span>
              </div>
              <h2 className="font-heading text-5xl font-light text-charcoal mb-8 leading-tight">
                Why Saddlewood for
                <br />
                {data.name}?
              </h2>
              <div className="space-y-4 text-charcoal-light font-light leading-relaxed">
                {data.description.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="bg-cream p-8 border border-charcoal-light">
                <h3 className="font-heading text-2xl font-light text-charcoal mb-8">
                  Our {data.name}
                  <br />
                  Expertise
                </h3>
                <div className="space-y-4">
                  {data.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-4">
                      <div className="w-px h-5 bg-gold shrink-0 mt-0.5" />
                      <span className="text-charcoal-light text-sm font-light">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-teal-dark p-8">
                <h3 className="font-heading text-xl font-light text-stone mb-3">
                  Ready to start your {data.name} project?
                </h3>
                <p className="text-stone/70 text-sm font-light mb-6">
                  Schedule your free, no-obligation design consultation today.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/contact"
                    className="bg-gold hover:bg-gold-muted text-charcoal px-6 py-3 text-sm font-light transition-all text-center"
                  >
                    Schedule Consultation
                  </Link>
                  <a
                    href="tel:4809996100"
                    className="flex items-center justify-center gap-2 text-stone/80 hover:text-gold text-sm font-light transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    (480) 999-6100
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Projects Gallery with Captions */}
      <section className="py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px w-8 bg-gold" />
              <span className="section-label">Projects</span>
            </div>
            <h2 className="font-heading text-5xl font-light text-charcoal">
              {data.name} Projects
            </h2>
          </motion.div>

          {/* Featured project — large */}
          {data.projects.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="relative h-[360px] lg:h-[480px] overflow-hidden">
                  <Image
                    src={data.projects[0].image}
                    alt={data.projects[0].title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-gold text-charcoal text-xs font-light px-3 py-1">
                      {data.projects[0].category}
                    </span>
                  </div>
                </div>
                <div className="bg-teal-dark p-10 lg:p-14 flex flex-col justify-center">
                  <h3 className="font-heading text-3xl font-light text-stone mb-4">
                    {data.projects[0].title}
                  </h3>
                  <p className="text-stone/70 font-light leading-relaxed mb-6">
                    {data.projects[0].description}
                  </p>
                  {data.projects[0].caption && (
                    <p className="text-gold/80 text-sm font-light leading-relaxed italic border-l-2 border-gold/40 pl-5">
                      {data.projects[0].caption}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Remaining projects — grid with hover captions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.projects.slice(1).map((project, i) => (
              <motion.div
                key={project.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group"
              >
                <div className="relative h-64 overflow-hidden mb-4">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-gold text-charcoal text-xs font-light px-3 py-1">
                      {project.category}
                    </span>
                  </div>
                  {/* Hover caption overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-teal-dark/85 via-teal-dark/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-3 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500">
                    {project.caption && (
                      <p className="text-stone/90 text-[13px] font-light leading-relaxed">
                        {project.caption}
                      </p>
                    )}
                  </div>
                </div>
                <h3 className="font-heading text-lg font-light text-charcoal mb-2">
                  {project.title}
                </h3>
                <p className="text-charcoal-light text-sm font-light">{project.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-16">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-3 text-charcoal hover:text-gold font-light transition-colors border-b border-charcoal hover:border-gold pb-2"
            >
              View All Projects
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {data.testimonials.length > 0 && (
        <section className="py-24 bg-teal-dark">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px w-8 bg-gold" />
                <span className="section-label">Stories</span>
              </div>
              <h2 className="font-heading text-5xl font-light text-stone">
                From {data.name} Homeowners
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {data.testimonials.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="border-l-2 border-gold pl-8 py-8"
                >
                  <div className="flex gap-1 mb-6">
                    {[...Array(5)].map((_, j) => (
                      <svg key={j} className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-stone/80 leading-relaxed mb-6 font-light text-lg">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="pt-0">
                    <p className="text-stone font-light">{t.name}</p>
                    <p className="text-gold/70 text-xs mt-1 font-light">
                      {t.project} · {data.name}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-24 bg-charcoal">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-heading text-5xl sm:text-6xl font-light text-stone mb-8 leading-tight">
              Let&apos;s Talk About Your
              <br />
              <span className="text-gold">{data.name} Home</span>
            </h2>
            <p className="text-stone/70 text-lg font-light max-w-2xl mb-12 leading-relaxed">
              Schedule your free consultation and discover what Saddlewood can do for your {data.name} property.
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/contact"
                className="bg-gold hover:bg-gold-muted text-charcoal px-8 py-3 font-light transition-all border border-gold"
              >
                Schedule Consultation
              </Link>
              <a
                href="tel:4809996100"
                className="flex items-center gap-2 border border-gold/40 hover:border-gold text-stone/80 hover:text-gold px-8 py-3 font-light transition-all"
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
