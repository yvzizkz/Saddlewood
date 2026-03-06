import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Free Remodeling Consultation in Scottsdale | Contact Saddlewood",
  description:
    "Schedule your free, no-obligation design consultation with Scottsdale's trusted remodeling contractor. Serving McCormick Ranch, Gainey Ranch, and Pinnacle Peak. Call (480) 999-6100.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        label="Get In Touch"
        title="Let's Talk"
        description="Ready to transform your home? Start with a free consultation — we'd love to hear about your vision."
        image="/images/living1.jpg"
        imageAlt="Luxury living room remodel in Scottsdale by Saddlewood Contracting"
      />
      <ContactForm />
    </>
  );
}
