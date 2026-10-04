import type { Metadata, Viewport } from "next";

// The portal pages (sign-in, /internal, /app) carry the app manifest, so a
// phone can put Saddlewood on its home screen from any of them. The public
// marketing pages do not: nobody browsing the site is offered an install.
export const metadata: Metadata = {
  title: "Saddlewood Portal",
  robots: { index: false, follow: false },
  manifest: "/saddlewood-app.webmanifest",
  appleWebApp: { capable: true, title: "Saddlewood", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f5f0e8",
};

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
      {children}
    </div>
  );
}
