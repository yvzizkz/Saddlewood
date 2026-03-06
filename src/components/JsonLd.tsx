export function JsonLd() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${siteUrl}/#business`,
    name: "Saddlewood Contracting LLC",
    alternateName: "Saddlewood Contracting",
    description:
      "Premium kitchen, bathroom, and whole-home remodeling in Scottsdale's most prestigious neighborhoods. Licensed general, electrical, HVAC, and plumbing contractor.",
    url: siteUrl,
    telephone: "+14809996100",
    email: "info@saddlewoodcontracting.com",
    logo: `${siteUrl}/images/logo.svg`,
    image: `${siteUrl}/images/mcr-kitchen-island-01.jpg`,
    priceRange: "$$$",
    currenciesAccepted: "USD",
    paymentAccepted: "Cash, Check, Credit Card",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Scottsdale",
      addressRegion: "AZ",
      postalCode: "85258",
      addressCountry: "US",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 33.5092,
      longitude: -111.9261,
    },
    areaServed: [
      {
        "@type": "Place",
        name: "McCormick Ranch, Scottsdale, AZ 85258",
      },
      {
        "@type": "Place",
        name: "Gainey Ranch, Scottsdale, AZ 85258",
      },
      {
        "@type": "Place",
        name: "Pinnacle Peak Country Club, Scottsdale, AZ 85255",
      },
      {
        "@type": "City",
        name: "Scottsdale",
        containedInPlace: {
          "@type": "State",
          name: "Arizona",
        },
      },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "07:00",
        closes: "17:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: "09:00",
        closes: "14:00",
      },
    ],
    hasCredential: [
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: "Arizona ROC General Contractor License #305762",
      },
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: "Arizona ROC HVAC License #350714",
      },
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: "Arizona ROC Electrical License #350715",
      },
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: "Arizona ROC Plumbing License #350716",
      },
    ],
    knowsAbout: [
      "Kitchen Remodeling",
      "Bathroom Renovation",
      "Whole Home Remodel",
      "Outdoor Living Spaces",
      "Electrical Work",
      "HVAC Installation",
      "Plumbing",
      "Luxury Home Renovation",
    ],
    sameAs: [
      // Add social profiles here when available
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "5",
      reviewCount: "47",
      bestRating: "5",
    },
  };

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Home Remodeling",
    provider: { "@id": `${siteUrl}/#business` },
    areaServed: {
      "@type": "City",
      name: "Scottsdale",
      containedInPlace: { "@type": "State", name: "Arizona" },
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Remodeling Services",
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Kitchen Remodeling in Scottsdale",
            description:
              "Custom kitchen remodels featuring islands, quartz countertops, cabinetry, and professional-grade appliances.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Bathroom Renovation in Scottsdale",
            description:
              "Spa-inspired bathroom renovations with freestanding tubs, walk-in showers, and heated floors.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Whole-Home Remodel in Scottsdale",
            description:
              "Comprehensive whole-home remodeling with coordinated electrical, HVAC, and plumbing under four ROC licenses.",
          },
        },
      ],
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Saddlewood Contracting",
    url: siteUrl,
    description: "Luxury home remodeling contractor in Scottsdale, Arizona",
    publisher: { "@id": `${siteUrl}/#business` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
    </>
  );
}
