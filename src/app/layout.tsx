import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Saddlewood | Luxury Remodeling & Framing in Scottsdale, AZ",
    template: "%s",
  },
  description: "Luxury remodeling in Scottsdale, AZ.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // interactiveWidget=resizes-content makes the layout viewport shrink when the
  // iOS soft keyboard appears, so 100dvh on bottom sheets actually reflects the
  // visible area instead of leaving the sheet behind the keyboard.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`scroll-smooth ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
