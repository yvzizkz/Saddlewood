import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Privacy Policy | Saddlewood Contracting",
  description:
    "Privacy Policy for Saddlewood Contracting LLC — how we collect, use, and protect your personal information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        label="Legal"
        title="Privacy Policy"
        description="Your privacy matters to us. Learn how Saddlewood Contracting collects, uses, and protects your information."
      />
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-12 bg-cream">
        <div className="max-w-[800px] mx-auto prose-custom">
          <p className="text-sm text-charcoal-light font-light mb-8">
            Last updated: March 6, 2026
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            Saddlewood Contracting LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects the following types
            of information when you use our website at saddlewoodcontracting.com
            (the &ldquo;Site&rdquo;):
          </p>
          <p>
            <strong>Personal Information You Provide:</strong> When you fill out
            our contact form, use our chat widget, or communicate with us, we may
            collect your name, email address, phone number, neighborhood or
            location, project type, and any additional details you share about
            your remodeling project.
          </p>
          <p>
            <strong>Automatically Collected Information:</strong> We may
            automatically collect certain information when you visit our Site,
            including your IP address, browser type, operating system, referring
            URLs, pages viewed, and the dates and times of your visits. We use
            cookies and similar technologies to facilitate this collection.
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <p>
            Respond to your inquiries and schedule consultations. Provide
            estimates and communicate about your remodeling project. Send
            follow-up communications related to your inquiry. Improve our website
            and services. Comply with legal obligations. We do not sell, rent, or
            share your personal information with third parties for their
            marketing purposes.
          </p>

          <h2>3. Third-Party Service Providers</h2>
          <p>
            We use third-party services to help operate our business and
            communicate with you, including:
          </p>
          <p>
            <strong>GoHighLevel:</strong> Our customer relationship management
            (CRM) platform processes contact form submissions and manages
            communications. Your information submitted through our contact form
            or chat widget is transmitted to GoHighLevel for follow-up purposes.
          </p>
          <p>
            <strong>Analytics Services:</strong> We may use website analytics
            tools to understand how visitors use our Site. These services may
            collect anonymized usage data.
          </p>
          <p>
            These third-party providers are contractually obligated to protect
            your information and use it only for the purposes we specify.
          </p>

          <h2>4. Chat Widget</h2>
          <p>
            Our website includes a chat widget powered by GoHighLevel. When you
            interact with the chat widget, your messages and any personal
            information you provide are transmitted to our CRM system.
            Conversations may be handled by an AI assistant or a team member. The
            chat widget may use cookies to maintain your session.
          </p>

          <h2>5. Cookies and Tracking</h2>
          <p>
            We use cookies and similar technologies to enhance your browsing
            experience and analyze website usage. You can control cookie settings
            through your browser preferences. Disabling cookies may affect
            certain features of the Site, including the chat widget.
          </p>

          <h2>6. Data Retention</h2>
          <p>
            We retain your personal information for as long as necessary to
            fulfill the purposes outlined in this policy, unless a longer
            retention period is required by law. If you request deletion of your
            information, we will make reasonable efforts to comply, subject to
            legal and contractual obligations.
          </p>

          <h2>7. Data Security</h2>
          <p>
            We implement reasonable security measures to protect your personal
            information from unauthorized access, alteration, disclosure, or
            destruction. However, no method of transmission over the internet or
            electronic storage is completely secure, and we cannot guarantee
            absolute security.
          </p>

          <h2>8. Your Rights</h2>
          <p>
            Depending on your location, you may have certain rights regarding
            your personal information, including the right to access, correct, or
            delete your data. To exercise these rights, please contact us using
            the information below. We will respond to your request within a
            reasonable timeframe.
          </p>

          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Our Site and services are not directed to individuals under the age
            of 18. We do not knowingly collect personal information from
            children. If we learn that we have collected information from a
            child, we will delete it promptly.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated effective date. We encourage you
            to review this policy periodically. Continued use of the Site after
            changes constitutes acceptance of the revised policy.
          </p>

          <h2>11. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or how we handle your
            information, please contact us:
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
