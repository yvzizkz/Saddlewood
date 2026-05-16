import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saddlewood Portal",
  robots: { index: false, follow: false },
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
