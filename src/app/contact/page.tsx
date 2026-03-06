import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Free Remodeling Consultation in Scottsdale | Contact Saddlewood",
  description:
    "Schedule your free, no-obligation design consultation with Scottsdale's trusted remodeling contractor. Serving McCormick Ranch, Gainey Ranch, and Pinnacle Peak. Call (480) 999-6100.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[500px] flex items-end bg-teal-dark">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-2xl">
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
              Get In Touch
            </span>
            <h1 className="font-heading text-6xl lg:text-7xl font-light text-stone mt-6 mb-6 leading-tight">
              Let&apos;s Talk
            </h1>
            <p className="text-stone/70 max-w-2xl text-lg font-light leading-relaxed">
              Ready to transform your home? Start with a free consultation — we'd love to hear about your vision.
            </p>
          </div>
        </div>
      </section>

      <ContactForm />
    </>
  );
}
