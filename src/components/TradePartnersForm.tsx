"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { REVEAL_VIEWPORT } from "@/lib/reveal";
import { Phone, Mail, FileText, HardHat, Loader2 } from "lucide-react";

/**
 * Trade Partner / Subcontractor bid-list application.
 *
 * Mirrors ContactForm's proven stack: plain useState, an off-screen honeypot,
 * a fetch POST to a server Route Handler, and an inline success/error swap
 * (no toast, no redirect). On success the form is replaced by a confirmation
 * card; the server emails the team and files the applicant into the CRM bid
 * list. See src/app/api/trade-partners/route.ts.
 */

const TRADES = [
  "Framing / Rough Carpentry",
  "Concrete & Masonry",
  "Excavation / Grading",
  "Structural Steel / Metal",
  "Roofing",
  "Electrical",
  "Plumbing",
  "HVAC / Mechanical",
  "Drywall & Insulation",
  "Painting & Finishes",
  "Flooring & Tile",
  "Cabinetry / Millwork",
  "Windows & Doors",
  "Stucco / Exterior",
  "Landscaping / Hardscape",
  "Pools & Water Features",
  "Low-Voltage / Smart Home",
  "Other",
];

const inputClass =
  "w-full px-4 py-3 border border-charcoal-light bg-white text-charcoal focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all font-light";
const labelClass = "block text-sm text-charcoal-light font-light mb-3";

export function TradePartnersForm() {
  const [formData, setFormData] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    license: "",
    classifications: [] as string[],
    serviceArea: "",
    yearsInBusiness: "",
    bondedInsured: "",
    message: "",
    consent: false,
    // Honeypot — must stay empty. A bot that fills this is dropped server-side.
    company: "",
  });
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [formError, setFormError] = useState<string>("");

  const toggleTrade = (trade: string) => {
    setFormData((prev) => ({
      ...prev,
      classifications: prev.classifications.includes(trade)
        ? prev.classifications.filter((t) => t !== trade)
        : [...prev.classifications, trade],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // At least one trade classification is required (checkbox groups can't use
    // native `required`), so validate it in JS before submitting.
    if (formData.classifications.length === 0) {
      setFormError("Please select at least one trade classification.");
      setStatus("error");
      return;
    }

    setStatus("submitting");

    const contactName = formData.contactName.trim();
    const payload = {
      // GHL standard contact fields — the applicant is the point of contact.
      firstName: contactName.split(" ")[0] || contactName,
      lastName: contactName.split(" ").slice(1).join(" ") || "",
      name: contactName || formData.businessName,
      email: formData.email,
      phone: formData.phone,
      // Trade-partner specifics
      businessName: formData.businessName,
      website: formData.website,
      license: formData.license,
      classifications: formData.classifications,
      serviceArea: formData.serviceArea,
      yearsInBusiness: formData.yearsInBusiness,
      bondedInsured: formData.bondedInsured,
      message: formData.message,
      // Source tracking — distinct source + tags keep the bid list filterable
      // and separate from homeowner leads.
      source: "Website Trade Partner Application",
      tags: [
        "subcontractor",
        "bid-list",
        ...formData.classifications.map((t) => `trade:${t}`),
      ],
      // Honeypot — bots fill this; humans never see it.
      company: formData.company,
    };

    try {
      const response = await fetch("/api/trade-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Form submission failed");
      }

      setStatus("success");
      setFormData({
        businessName: "",
        contactName: "",
        email: "",
        phone: "",
        website: "",
        license: "",
        classifications: [],
        serviceArea: "",
        yearsInBusiness: "",
        bondedInsured: "",
        message: "",
        consent: false,
        company: "",
      });
    } catch {
      console.error("Trade partner form submission error");
      setFormError(
        "Something went wrong. Please try again or email info@saddlewoodcontracting.com."
      );
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
              initial={{ opacity: 0.12, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={REVEAL_VIEWPORT}
            >
              <span className="section-label !mb-6">Join Our Bid List</span>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal mb-4 leading-tight">
                Get On Our Bid List
              </h2>
              <p className="text-charcoal-light font-light mb-12 max-w-lg">
                Tell us about your company and the trades you self-perform. Once
                you&apos;re on our list, we&apos;ll send plans and architectural
                drawings directly to you when a project goes out for bid.
              </p>

              {status === "success" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-teal-dark p-12 text-center border border-gold"
                  role="status"
                  aria-live="polite"
                >
                  <h3 className="font-heading text-3xl font-light text-gold mb-2">
                    Application Received
                  </h3>
                  <p className="text-stone/80 font-light">
                    Thanks for your interest in working with Saddlewood
                    Contracting. You&apos;re on our bid list — we&apos;ll reach
                    out with plans when a project matching your trades goes out
                    for bid.
                  </p>
                </motion.div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-6"
                  aria-label="Trade partner bid list application"
                >
                  {/* Honeypot — off-screen; humans never see or tab to it, but
                      bots that auto-fill every field trip it and are dropped. */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "-9999px",
                      width: 1,
                      height: 1,
                      overflow: "hidden",
                    }}
                  >
                    <label htmlFor="tp-company">Company (leave this field empty)</label>
                    <input
                      id="tp-company"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                    />
                  </div>

                  {/* Business + contact */}
                  <div>
                    <label htmlFor="tp-business" className={labelClass}>
                      Business Name <span className="text-gold">*</span>
                    </label>
                    <input
                      id="tp-business"
                      type="text"
                      required
                      autoComplete="organization"
                      value={formData.businessName}
                      onChange={(e) =>
                        setFormData({ ...formData, businessName: e.target.value })
                      }
                      className={inputClass}
                      placeholder="Acme Framing LLC"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="tp-contact" className={labelClass}>
                        Contact Name <span className="text-gold">*</span>
                      </label>
                      <input
                        id="tp-contact"
                        type="text"
                        required
                        autoComplete="name"
                        value={formData.contactName}
                        onChange={(e) =>
                          setFormData({ ...formData, contactName: e.target.value })
                        }
                        className={inputClass}
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="tp-email" className={labelClass}>
                        Email <span className="text-gold">*</span>
                      </label>
                      <input
                        id="tp-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className={inputClass}
                        placeholder="jane@acmeframing.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="tp-phone" className={labelClass}>
                        Phone <span className="text-gold">*</span>
                      </label>
                      <input
                        id="tp-phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className={inputClass}
                        placeholder="(480) 555-0123"
                      />
                    </div>
                    <div>
                      <label htmlFor="tp-website" className={labelClass}>
                        Website
                      </label>
                      <input
                        id="tp-website"
                        type="url"
                        autoComplete="url"
                        value={formData.website}
                        onChange={(e) =>
                          setFormData({ ...formData, website: e.target.value })
                        }
                        className={inputClass}
                        placeholder="https://acmeframing.com"
                      />
                    </div>
                  </div>

                  {/* License + experience */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="tp-license" className={labelClass}>
                        License / AZ ROC #
                      </label>
                      <input
                        id="tp-license"
                        type="text"
                        value={formData.license}
                        onChange={(e) =>
                          setFormData({ ...formData, license: e.target.value })
                        }
                        className={inputClass}
                        placeholder="ROC #123456"
                      />
                    </div>
                    <div>
                      <label htmlFor="tp-years" className={labelClass}>
                        Years in Business
                      </label>
                      <input
                        id="tp-years"
                        type="text"
                        inputMode="numeric"
                        value={formData.yearsInBusiness}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            yearsInBusiness: e.target.value,
                          })
                        }
                        className={inputClass}
                        placeholder="10"
                      />
                    </div>
                  </div>

                  {/* Trade classifications */}
                  <fieldset>
                    <legend className={labelClass}>
                      Trade Classifications <span className="text-gold">*</span>
                      <span className="text-charcoal-light/70">
                        {" "}
                        — select all you self-perform
                      </span>
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2">
                      {TRADES.map((trade) => {
                        const id = `tp-trade-${trade
                          .toLowerCase()
                          .replace(/[^a-z]+/g, "-")}`;
                        const checked = formData.classifications.includes(trade);
                        return (
                          <label
                            key={trade}
                            htmlFor={id}
                            className="flex items-center gap-3 cursor-pointer text-sm text-charcoal-light font-light"
                          >
                            <input
                              id={id}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTrade(trade)}
                              className="w-4 h-4 accent-gold shrink-0 cursor-pointer"
                            />
                            {trade}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Coverage + bonding */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="tp-area" className={labelClass}>
                        Service Area
                      </label>
                      <input
                        id="tp-area"
                        type="text"
                        value={formData.serviceArea}
                        onChange={(e) =>
                          setFormData({ ...formData, serviceArea: e.target.value })
                        }
                        className={inputClass}
                        placeholder="Scottsdale, Paradise Valley, Phoenix metro"
                      />
                    </div>
                    <div>
                      <label htmlFor="tp-bonded" className={labelClass}>
                        Bonded &amp; Insured?
                      </label>
                      <select
                        id="tp-bonded"
                        value={formData.bondedInsured}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            bondedInsured: e.target.value,
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">Select</option>
                        <option value="Yes — bonded & insured">
                          Yes — bonded &amp; insured
                        </option>
                        <option value="Insured only">Insured only</option>
                        <option value="Not yet">Not yet</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor="tp-message" className={labelClass}>
                      Capabilities &amp; Notes
                    </label>
                    <textarea
                      id="tp-message"
                      rows={5}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      className={`${inputClass} resize-none`}
                      placeholder="Crew size, typical project size, notable projects, references, union/non-union, prevailing wage experience, or anything else we should know."
                    />
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      id="tp-consent"
                      type="checkbox"
                      required
                      checked={formData.consent}
                      onChange={(e) =>
                        setFormData({ ...formData, consent: e.target.checked })
                      }
                      className="mt-1 w-4 h-4 accent-gold shrink-0 cursor-pointer"
                    />
                    <label
                      htmlFor="tp-consent"
                      className="text-[13px] text-charcoal-light font-light leading-relaxed cursor-pointer"
                    >
                      I consent to Saddlewood Contracting contacting me about
                      bid opportunities via phone, email, or text. I have read
                      and agree to the{" "}
                      <a
                        href="/privacy"
                        className="text-teal underline hover:text-gold transition-colors"
                      >
                        Privacy Policy
                      </a>{" "}
                      and{" "}
                      <a
                        href="/terms"
                        className="text-teal underline hover:text-gold transition-colors"
                      >
                        Terms of Service
                      </a>
                      .
                    </label>
                  </div>

                  {status === "error" && (
                    <div
                      className="bg-red-50 border border-red-200 p-4"
                      role="alert"
                      aria-live="assertive"
                    >
                      <p className="text-red-700 text-sm font-light">
                        {formError ||
                          "Something went wrong. Please try again or call us directly at (480) 999-6100."}
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
                        Submitting...
                      </>
                    ) : (
                      "Submit Application"
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>

          {/* Sidebar Info */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0.12, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={REVEAL_VIEWPORT}
              transition={{ delay: 0.2 }}
              className="space-y-8"
            >
              <div className="bg-teal-dark p-8 text-stone">
                <h3 className="font-heading text-xl font-light mb-8">
                  Why Bid With Saddlewood
                </h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 font-light">
                    <HardHat className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Steady pipeline</p>
                      <p className="text-lg">
                        Ground-up new construction, framing, and luxury remodels
                        across Scottsdale &amp; Paradise Valley.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 font-light">
                    <FileText className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Plans sent to you</p>
                      <p className="text-lg">
                        Get architectural drawings and scopes emailed directly
                        when work matching your trade goes out for bid.
                      </p>
                    </div>
                  </div>
                  <a
                    href="tel:4809996100"
                    className="flex items-start gap-4 hover:text-gold transition-colors font-light"
                  >
                    <Phone className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-stone/70">Questions?</p>
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
                      <p className="text-lg break-all sm:break-normal">
                        info@saddlewoodcontracting.com
                      </p>
                    </div>
                  </a>
                </div>
              </div>

              <div className="bg-off-white p-8 border border-charcoal-light">
                <h3 className="font-heading text-lg font-light text-charcoal mb-6">
                  What We Look For
                </h3>
                <div className="space-y-4">
                  {[
                    "Properly licensed for your trade",
                    "Bonded & insured (or working toward it)",
                    "Reliable crews & clean job sites",
                    "Competitive, transparent pricing",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <div className="w-px h-4 bg-gold" aria-hidden="true" />
                      <span className="text-sm text-charcoal-light font-light">
                        {item}
                      </span>
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
