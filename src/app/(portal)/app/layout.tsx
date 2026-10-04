import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AppShell from "@/components/bot/AppShell";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { createClient } from "@/lib/supabase/server";

// The Saddlewood app: SaddleWoodBot from a phone. Staff only. Same gate as the
// rest of the portal (src/proxy.ts sends anyone without a session to /login
// before this runs; this is the second lock, on the page itself).

export const metadata: Metadata = {
  title: "Saddlewood",
};

export default async function BotAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) redirect("/login?next=/app");
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  return <AppShell>{children}</AppShell>;
}
