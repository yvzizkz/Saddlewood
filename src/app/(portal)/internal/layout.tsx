import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countPendingEstimates } from "@/lib/estimates/queries";
import BottomTabBar from "@/components/layout/BottomTabBar";
import DesktopSidebar from "@/components/layout/DesktopSidebar";

export default async function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    redirect("/login");
  }

  const pendingCount = await countPendingEstimates();

  return (
    <div className="min-h-screen">
      <DesktopSidebar pendingCount={pendingCount} />
      <main className="md:ml-64 pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
        {children}
      </main>
      <BottomTabBar pendingCount={pendingCount} />
    </div>
  );
}
