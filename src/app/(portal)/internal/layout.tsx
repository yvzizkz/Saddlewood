import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasCrewRole } from "@/lib/crew/role";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { countPendingEstimates } from "@/lib/estimates/queries";
import AppSidebar from "@/components/layout/AppSidebar";
import OldToolsNav from "@/components/layout/OldToolsNav";
import PhoneTabs from "@/components/layout/PhoneTabs";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";

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
    // Crew have the app and nothing else. (src/proxy.ts already turns them
    // around; this is the same answer if it ever does not.)
    if (hasCrewRole(user)) redirect("/app");
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  const [pendingCount, owner] = await Promise.all([countPendingEstimates(), getViewer().then(viewerIsOwner)]);
  // The same navigation as the app (components/layout/nav.ts): /internal is
  // one more set of screens in it, not a second portal.
  const viewer = { owner, crewAdmin: owner };

  return (
    <div className="min-h-screen">
      <AppSidebar viewer={viewer} badges={{ "/internal": pendingCount }} />
      <main className="md:ml-60 pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <OldToolsNav />
        {children}
      </main>
      <PhoneTabs viewer={viewer} />
    </div>
  );
}
