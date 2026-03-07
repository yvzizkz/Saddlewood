"use client";

import { motion } from "framer-motion";
import { Shield, MapPin, Award, Calendar } from "lucide-react";

const reasons = [
  {
    icon: Shield,
    title: "4 ROC Licenses",
    description:
      "General, HVAC, Electrical, and Plumbing — all under one roof. No subcontractor coordination headaches.",
  },
  {
    icon: MapPin,
    title: "Scottsdale Specialists",
    description:
      "We know McCormick Ranch, Gainey Ranch, and Pinnacle Peak Country Club because we work there every day.",
  },
  {
    icon: Award,
    title: "Premium Craftsmanship",
    description:
      "Every detail matters. From precision tile work to custom cabinetry, we deliver results that exceed expectations.",
  },
  {
    icon: Calendar,
    title: "Free Consultations",
    description:
      "Start with a no-obligation design consultation. We'll walk your space, listen to your vision, and provide a detailed estimate.",
  },
];

export function WhySaddlewood() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-gold-accessible text-sm tracking-[0.2em] uppercase font-medium">
            Why Choose Us
          </span>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-teal mt-3 mb-4">
            The Saddlewood Difference
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {reasons.map((reason, i) => (
            <motion.div
              key={reason.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-stone mx-auto mb-6 flex items-center justify-center group-hover:bg-teal transition-colors duration-300">
                <reason.icon className="w-7 h-7 text-teal group-hover:text-gold transition-colors duration-300" />
              </div>
              <h3 className="font-heading text-xl font-bold text-teal mb-3">
                {reason.title}
              </h3>
              <p className="text-charcoal/60 text-sm leading-relaxed">
                {reason.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
