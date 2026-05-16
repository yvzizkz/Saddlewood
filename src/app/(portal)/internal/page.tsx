import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function InternalDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    redirect("/login");
  }

  const displayName =
    user.email === "marco@saddlewoodcontracting.com" ? "Marco" : user.email;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="max-w-lg w-full text-center">
        <h1
          className="text-3xl mb-4"
          style={{
            fontFamily: "var(--font-fraunces)",
            color: "var(--color-charcoal)",
          }}
        >
          Welcome, {displayName}
        </h1>
        <p style={{ color: "var(--color-charcoal)", opacity: 0.7 }}>
          Estimates will appear here once the pipeline is connected.
        </p>
      </div>
    </div>
  );
}
