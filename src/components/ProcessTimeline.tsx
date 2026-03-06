"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Compass, ClipboardCheck, HardHat, PartyPopper } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Free Consultation",
    subtitle: "Meet at your home",
    description:
      "We visit your home, listen to your vision, assess the space, and discuss budget expectations. This visit is always free and no-obligation.",
    detail: "Most consultations last about an hour. We'll measure the space, discuss your wish list, and answer every question.",
    icon: Phone,
    color: "#C49A3C",
  },
  {
    number: "02",
    title: "Design & Planning",
    subtitle: "Your vision, refined",
    description:
      "Our team creates detailed design plans, selects materials, and provides a comprehensive estimate with transparent line-item pricing.",
    detail: "You'll see exactly where every dollar goes. We walk you through material options in person at our supplier showrooms.",
    icon: Compass,
    color: "#C49A3C",
  },
  {
    number: "03",
    title: "Permits & Approvals",
    subtitle: "We handle everything",
    description:
      "We handle all City of Scottsdale permits and HOA approvals. With four ROC licenses, we pull our own permits for every trade.",
    detail: "General, Electrical, HVAC, and Plumbing — all under one roof. No subcontractor runaround.",
    icon: ClipboardCheck,
    color: "#C49A3C",
  },
  {
    number: "04",
    title: "Build Phase",
    subtitle: "Craftsmanship in action",
    description:
      "Our licensed crews handle every aspect — general, electrical, HVAC, and plumbing. Daily updates and a clean job site, always.",
    detail: "You'll get photo updates and a dedicated project manager who's on-site every day your project is active.",
    icon: HardHat,
    color: "#C49A3C",
  },
  {
    number: "05",
    title: "Final Reveal",
    subtitle: "The moment you've waited for",
    description:
      "We walk every detail with you, address any punch-list items on the spot, and don't consider the job done until you're thrilled.",
    detail: "Our warranty doesn't end at the walkthrough. We stand behind our work and stay in touch.",
    icon: PartyPopper,
    color: "#C49A3C",
  },
];

export function ProcessTimeline() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="py-24 lg:py-32 bg-off-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 lg:mb-20"
        >
          <div className="flex items-center gap-4 mb-6 justify-center">
            <div className="h-px w-8 bg-gold" />
            <span className="section-label">Our Process</span>
            <div className="h-px w-8 bg-gold" />
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal leading-tight mb-4">
            Five Steps to Your
            <br />
            <em className="italic text-teal font-normal">Dream Space</em>
          </h2>
          <p className="text-charcoal-light font-light max-w-lg mx-auto">
            From first hello to final reveal, here&apos;s exactly how we turn your vision into reality.
          </p>
        </motion.div>

        {/* Desktop: Horizontal Step Selector */}
        <div className="hidden lg:block mb-16">
          {/* Progress track */}
          <div className="relative">
            <div className="absolute top-8 left-0 right-0 h-px bg-stone-mid" />
            <div
              className="absolute top-8 left-0 h-px bg-gold transition-all duration-700 ease-out"
              style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
            />

            <div className="relative flex justify-between">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = i === activeStep;
                const isPast = i < activeStep;

                return (
                  <motion.button
                    key={step.number}
                    onClick={() => setActiveStep(i)}
                    className="flex flex-col items-center group relative"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    {/* Circle node */}
                    <div
                      className={`w-16 h-16 flex items-center justify-center transition-all duration-500 ${
                        isActive
                          ? "bg-gold text-teal-dark scale-110"
                          : isPast
                          ? "bg-teal text-stone"
                          : "bg-stone-mid text-charcoal-light group-hover:bg-stone group-hover:text-teal"
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>

                    {/* Step number */}
                    <span
                      className={`text-[11px] tracking-[0.15em] font-medium mt-4 transition-colors duration-300 ${
                        isActive ? "text-gold" : "text-charcoal-light"
                      }`}
                    >
                      STEP {step.number}
                    </span>

                    {/* Title */}
                    <span
                      className={`font-heading text-[15px] mt-1 transition-colors duration-300 ${
                        isActive ? "text-charcoal" : "text-charcoal-light"
                      }`}
                    >
                      {step.title}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop: Active Step Content */}
        <div className="hidden lg:block">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-2 gap-0 bg-white"
            >
              {/* Left — big number + subtitle */}
              <div className="bg-teal-dark p-12 lg:p-16 flex flex-col justify-center">
                <span className="font-heading text-[120px] leading-none text-gold/20 mb-4">
                  {steps[activeStep].number}
                </span>
                <h3 className="font-heading text-3xl font-light text-stone mb-2">
                  {steps[activeStep].title}
                </h3>
                <p className="text-gold text-sm tracking-wide font-light">
                  {steps[activeStep].subtitle}
                </p>
              </div>

              {/* Right — description */}
              <div className="p-12 lg:p-16 flex flex-col justify-center">
                <p className="text-charcoal-light font-light leading-relaxed text-[16px] mb-6">
                  {steps[activeStep].description}
                </p>
                <div className="border-l-2 border-gold/40 pl-5">
                  <p className="text-charcoal/60 text-[14px] italic font-light leading-relaxed">
                    {steps[activeStep].detail}
                  </p>
                </div>

                {/* Navigation */}
                <div className="flex gap-3 mt-10">
                  <button
                    onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                    disabled={activeStep === 0}
                    aria-label="Previous step"
                    className="w-10 h-10 border border-charcoal/15 flex items-center justify-center text-charcoal-light hover:border-gold hover:text-gold transition-all disabled:opacity-30 disabled:hover:border-charcoal/15 disabled:hover:text-charcoal-light"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
                    disabled={activeStep === steps.length - 1}
                    aria-label="Next step"
                    className="w-10 h-10 border border-charcoal/15 flex items-center justify-center text-charcoal-light hover:border-gold hover:text-gold transition-all disabled:opacity-30 disabled:hover:border-charcoal/15 disabled:hover:text-charcoal-light"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mobile: Accordion-style vertical cards */}
        <div className="lg:hidden space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;

            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <button
                  onClick={() => setActiveStep(i)}
                  className={`w-full text-left transition-all duration-400 ${
                    isActive ? "bg-teal-dark" : "bg-white border border-stone-mid"
                  }`}
                >
                  <div className="flex items-center gap-4 p-5">
                    <div
                      className={`w-12 h-12 flex items-center justify-center shrink-0 transition-all ${
                        isActive ? "bg-gold text-teal-dark" : "bg-stone text-charcoal-light"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-[10px] tracking-[0.15em] font-medium block ${
                          isActive ? "text-gold" : "text-charcoal-light"
                        }`}
                      >
                        STEP {step.number}
                      </span>
                      <h3
                        className={`font-heading text-lg font-light ${
                          isActive ? "text-stone" : "text-charcoal"
                        }`}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <svg
                      className={`w-5 h-5 shrink-0 transition-transform duration-300 ${
                        isActive ? "rotate-180 text-gold" : "text-charcoal-light"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden bg-teal-dark"
                    >
                      <div className="px-5 pb-6 pt-0">
                        <p className="text-stone/80 font-light leading-relaxed text-[15px] mb-4">
                          {step.description}
                        </p>
                        <div className="border-l-2 border-gold/40 pl-4">
                          <p className="text-stone/50 text-[13px] italic font-light leading-relaxed">
                            {step.detail}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
