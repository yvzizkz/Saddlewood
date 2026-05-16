import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Terms of Service | Saddlewood Contracting",
  description:
    "Terms of Service for Saddlewood Contracting LLC — home remodeling services in Scottsdale, AZ.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageHero
        label="Legal"
        title="Terms of Service"
        description="Please review our terms of service carefully before using our website or engaging our services."
      />
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-12 bg-cream">
        <div className="max-w-[800px] mx-auto prose-custom">
          <p className="text-sm text-charcoal-light font-light mb-8">
            Last updated: March 6, 2026
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using the website of Saddlewood Contracting LLC
            (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;), located at saddlewoodcontracting.com (the
            &ldquo;Site&rdquo;), you agree to be bound by these Terms of
            Service. If you do not agree to these terms, please do not use the
            Site.
          </p>

          <h2>2. Services</h2>
          <p>
            Saddlewood Contracting LLC provides residential remodeling services
            in Scottsdale, Arizona, and surrounding areas. Services include but
            are not limited to kitchen remodeling, bathroom renovation,
            whole-home remodels, outdoor living, electrical work (ROC #350715),
            HVAC (ROC #350714), and plumbing (ROC #350716). All services are
            subject to a separate written contract between the Company and the
            client.
          </p>

          <h2>3. Use of Website</h2>
          <p>
            You agree to use this Site only for lawful purposes. You may not use
            the Site in any way that could damage, disable, overburden, or impair
            the Site or interfere with any other party&apos;s use of the Site.
            The content on this Site, including text, images, and design
            elements, is the property of Saddlewood Contracting LLC and is
            protected by copyright and trademark laws.
          </p>

          <h2>4. Estimates and Pricing</h2>
          <p>
            Any estimates, pricing information, or project timelines discussed
            through the Site, chat widget, or during consultations are
            approximate and non-binding. Final pricing will be provided in a
            written contract. Saddlewood Contracting LLC reserves the right to
            adjust pricing based on scope changes, material costs, and site
            conditions discovered during the project.
          </p>

          <h2>5. Contact Form and Communications</h2>
          <p>
            By submitting information through our contact form or chat widget,
            you consent to receiving communications from Saddlewood Contracting
            LLC regarding your inquiry. This may include phone calls, emails, or
            text messages to the contact information you provide. You may opt out
            of communications at any time by contacting us directly.
          </p>

          <h2>6. Disclaimer of Warranties</h2>
          <p>
            The information on this Site is provided &ldquo;as is&rdquo; without
            warranties of any kind, either express or implied. Saddlewood
            Contracting LLC does not warrant that the Site will be uninterrupted,
            error-free, or free of viruses or other harmful components. Project
            photos and descriptions represent completed work and may not reflect
            the exact results of your project.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            In no event shall Saddlewood Contracting LLC, its owners, employees,
            or affiliates be liable for any indirect, incidental, special, or
            consequential damages arising out of or in connection with your use
            of the Site. Our total liability shall not exceed the amount paid by
            you, if any, for accessing the Site.
          </p>

          <h2>8. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Saddlewood Contracting LLC
            and its owners, employees, and affiliates from any claims,
            liabilities, damages, losses, or expenses arising from your use of
            the Site or violation of these Terms.
          </p>

          <h2>9. Third-Party Links</h2>
          <p>
            The Site may contain links to third-party websites. Saddlewood
            Contracting LLC is not responsible for the content or privacy
            practices of those websites. Visiting third-party sites is at your
            own risk.
          </p>

          <h2>10. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the
            laws of the State of Arizona, without regard to conflict of law
            principles. Any disputes shall be resolved in the courts of Maricopa
            County, Arizona.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            Saddlewood Contracting LLC reserves the right to modify these Terms
            at any time. Changes will be posted on this page with an updated
            effective date. Continued use of the Site after changes constitutes
            acceptance of the revised Terms.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            If you have questions about these Terms of Service, please contact
            us:
          </p>
          <p>
            Saddlewood Contracting LLC
            <br />
            Scottsdale, AZ 85258
            <br />
            Phone:{" "}
            <a href="tel:4809996100" className="text-teal hover:text-gold transition-colors">
              (480) 999-6100
            </a>
            <br />
            Email:{" "}
            <a
              href="mailto:info@saddlewoodcontracting.com"
              className="text-teal hover:text-gold transition-colors"
            >
              info@saddlewoodcontracting.com
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
