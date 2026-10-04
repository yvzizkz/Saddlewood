import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AppShell from "@/components/bot/AppShell";
import CrewShell from "@/components/crew/CrewShell";
import { getViewer } from "@/lib/crew/auth";
import { createClient } from "@/lib/supabase/server";

// The Saddlewood app. One link for everyone, two different apps behind it:
//
//   staff (the portal allowlist)  SaddleWoodBot from a phone: oversight,
//                                 approvals, duties, and the Crew tab
//   crew (a seat an owner gave)   their own day: the clock, receipts,
//                                 progress, the end-of-day check-in, their
//                                 schedule and tasks. The bot stays in the
//                                 background for them.
//
// src/proxy.ts sends anyone without a session to /login before this runs;
// this is the second lock, on the page itself.

export const metadata: Metadata = {
  title: "Saddlewood",
};

export default async function BotAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/app");
  if (viewer.kind === "stranger") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized&next=/app");
  }

  if (viewer.kind === "unavailable") {
    // The seat could not be looked up just now. Say so and let them try again;
    // signing them out here would also throw away a clock-in waiting on their phone.
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg text-[var(--color-charcoal)]">Saddlewood could not load just now. · Saddlewood no pudo cargar.</p>
        <a
          href="/app"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-teal)] px-6 text-sm font-medium text-white"
        >
          Try again · Intentar de nuevo
        </a>
      </div>
    );
  }

  if (viewer.kind === "crew") {
    return (
      <CrewShell lang={viewer.person.lang} email={viewer.person.email}>
        {children}
      </CrewShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}
