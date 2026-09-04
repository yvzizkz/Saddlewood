import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/ops/allowlist";
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

  // The allowlist is the real gate. A session for any other address, however
  // it was created, is ended here and sent back to the login page.
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
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
