"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, Mail, MapPin, Clock, Loader2 } from "lucide-react";

const GHL_WEBHOOK_URL = process.env.NEXT_PUBLIC_GHL_WEBHOOK_URL || "";

export function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    neighborhood: "",
    projectType: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");

    // Build the payload matching GoHighLevel contact/opportunity fields
    const payload = {
      // GHL standard contact fields
      firstName: formData.name.split(" ")[0] || formData.name,
      lastName: formData.name.split(" ").slice(1).join(" ") || "",
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      // Custom fields (mapped in GHL workflow)
      neighborhood: formData.neighborhood,
      projectType: formData.projectType,
      message: formData.message,
      // Source tracking
      source: "Website Contact Form",
      tags: ["website-lead", formData.projectType, formData.neighborhood].filter(Boolean),
    };

    try {
      if (GHL_WEBHOOK_URL) {
        // Send to GoHighLevel webhook
        const response = await fetch(GHL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`GoHighLevel webhook failed: ${response.status}`);
        }
      } else {
        // Fallback: send to our API route which handles GHL integration
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Form submission failed");
        }
      }

      setStatus("success");
      setFormData({
        name: "",
        email: "",
        phone: "",
        neighborhood: "",
        projectType: "",
        message: "",
      });
    } catch {
      console.error("Form submission error");
      setStatus("error");
    }
  };

  return (
    <section className="py-24 bg-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-16">
          {/* Form */}
          <div className="lg:col-span-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px w-8 bg-gold" />
                <span className="section-label">Contact</span>
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-4 leading-tight">
                Start Your Project
              </h2>
              <p className="text-charcoal-light font-light mb-12 max-w-lg">
                Tell us about your vision and we&apos;ll schedule a free, no-obligation consultation.
              </p>

              {status === "success" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-teal-dark p-12 text-center border border-gold"
                >
                  <h3 className="font-heading text-3xl font-light text-gold mb-2">
                    Message Sent
                  </h3>
                  <p className="text-stone/80 font-light">
                    We&apos;ll be in touch within 24 hours to schedule your free consultation.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" aria-label="Contact form">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="contact-name" className="block text-sm text-charcoal-light font-light mb-3">
                        Full Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        autoComplete="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="block text-sm text-charcoal-light font-light mb-3">
                        Email
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="contact-phone" className="block text-sm text-charcoal-light font-light mb-3">
                        Phone
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light"
                        placeholder="(480) 555-0123"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-neighborhood" className="block text-sm text-charcoal-light font-light mb-3">
                        Neighborhood
                      </label>
                      <select
                        id="contact-neighborhood"
                        value={formData.neighborhood}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            neighborhood: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light"
                      >
                        <option value="">Select neighborhood</option>
                        <option value="McCormick Ranch">McCormick Ranch</option>
                        <option value="Gainey Ranch">Gainey Ranch</option>
                        <option value="Pinnacle Peak Country Club">
                          Pinnacle Peak Country Club
                        </option>
                        <option value="Other Scottsdale Area">Other Scottsdale Area</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-project-type" className="block text-sm text-charcoal-light font-light mb-3">
                      Project Type
                    </label>
                    <select
                      id="contact-project-type"
                      value={formData.projectType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          projectType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light"
                    >
                      <option value="">Select project type</option>
                      <option value="Kitchen Remodel">Kitchen Remodel</option>
                      <option value="Bathroom Renovation">Bathroom Renovation</option>
                      <option value="Whole-Home Remodel">Whole-Home Remodel</option>
                      <option value="Outdoor Living">Outdoor Living</option>
                      <option value="Electrical">Electrical</option>
                      <option value="HVAC">HVAC</option>
                      <option value="Plumbing">Plumbing</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="block text-sm text-charcoal-light font-light mb-3">
                      Tell Us About Your Project
                    </label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all resize-none font-light"
                      placeholder="Describe your vision, timeline, budget range, or any questions you have..."
                    />
                  </div>

                  {status === "error" && (
                    <div className="bg-red-50 border border-red-200 p-4">
                      <p className="text-red-700 text-sm font-light">
                        Something went wrong. Please try again or call us directly at (480) 999-6100.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="bg-gold hover:bg-gold-muted text-charcoal px-8 py-3 font-light transition-all hover:shadow-lg border border-gold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {status === "submitting" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Message"
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>

          {/* Sidebar Info */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="space-y-8"
            >
              <div className="bg-teal-dark p-8 text-stone">
                <h3 className="font-heading text-xl font-light mb-8">
                  Contact Information
                </h3>
                <div className="space-y-6">
                  <a
                    href="tel:4809996100"
                    className="flex items-start gap-4 hover:text-gold transition-colors font-light"
                  >
                    <Phone className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Phone</p>
                      <p className="text-lg">(480) 999-6100</p>
                    </div>
                  </a>
                  <a
                    href="mailto:info@saddlewoodcontracting.com"
                    className="flex items-start gap-4 hover:text-gold transition-colors font-light"
                  >
                    <Mail className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Email</p>
                      <p className="text-lg break-all sm:break-normal">info@saddlewoodcontracting.com</p>
                    </div>
                  </a>
                  <div className="flex items-start gap-4 font-light">
                    <MapPin className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Service Area</p>
                      <p className="text-lg">Scottsdale, AZ</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 font-light">
                    <Clock className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Hours</p>
                      <p className="text-lg">Mon-Fri: 7am - 5pm</p>
                      <p className="text-sm text-stone/60">Sat: By appointment</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-off-white p-8 border border-charcoal-light">
                <h3 className="font-heading text-lg font-light text-charcoal mb-6">
                  What to Expect
                </h3>
                <div className="space-y-4">
                  {[
                    "Response within 24 hours",
                    "Free in-home consultation",
                    "Detailed written estimate",
                    "No-obligation, no pressure",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <div className="w-px h-4 bg-gold" />
                      <span className="text-sm text-charcoal-light font-light">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
