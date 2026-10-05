import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasCrewRole } from "@/lib/crew/role";
import { isAllowedEmail } from "@/lib/ops/allowlist";

// Master security gate for Saddlewood.
// Public marketing routes remain accessible to everyone.
// All internal tools, review batches (/r/*, /review/*), ops, and internal APIs are strictly guarded.
//
// Two kinds of signed-in person:
//   staff  an address on the portal allowlist: the whole portal and the app
//   crew   a field worker or employee an owner gave a seat (src/lib/crew/role.ts):
//          the app at /app and its own API at /api/crew, and nothing else

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // A stale session that needs refreshing requires the cookie round-trip
  // to complete atomically.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isAllowed = isAllowedEmail(user?.email);
  const isCrew = !isAllowed && hasCrewRole(user);

  // 0. The crew's API (and the owners' side of it, /api/crew/admin). People
  // only: there is no token caller here. Each route decides which people.
  if (pathname.startsWith("/api/crew/")) {
    if (!user || !(isAllowed || isCrew)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  // 1. Guarded API routes
  // Not in this list, on purpose: /api/proposals, /api/contracts, /api/leads.
  // Part of each is for someone who cannot sign in (a client's proposal or
  // signing link, a phone provider's webhook), so those routes check the
  // caller themselves: src/lib/proposals/access.ts, src/lib/contracts/link.ts
  // and the top of src/app/api/leads/route.ts.
  if (
    pathname.startsWith("/api/review") ||
    pathname.startsWith("/api/ops") ||
    pathname.startsWith("/api/estimates") ||
    pathname.startsWith("/api/trackers") ||
    pathname.startsWith("/api/expenses") ||
    pathname.startsWith("/api/bot/")
  ) {
    const authHeader = request.headers.get("authorization");
    if (
      authHeader &&
      ((process.env.SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) ||
       (process.env.OPS_AGENT_TOKEN && authHeader === `Bearer ${process.env.OPS_AGENT_TOKEN}`))
    ) {
      return supabaseResponse;
    }
    if (!user || !isAllowed) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  // 2. Guarded internal & review pages
  // The app lives at /app. Match the folder exactly: "/app-sw.js" and the
  // manifest are public files that merely start with the same letters.
  const isAppPage = pathname === "/app" || pathname.startsWith("/app/");
  const isGuardedPage =
    isAppPage ||
    pathname.startsWith("/internal") ||
    pathname.startsWith("/r/") ||
    pathname === "/r" ||
    pathname.startsWith("/review/") ||
    pathname === "/review";

  if (isGuardedPage) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + (search || ""));
      return NextResponse.redirect(url);
    }

    if (isCrew) {
      // Crew belong in the app. Anything else on the portal sends them back to it.
      if (!isAppPage) {
        const url = request.nextUrl.clone();
        url.pathname = "/app";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } else if (!isAllowed) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(url);
    }
  }

  // 3. If already logged in and visiting /login, redirect to next (or /internal)
  if (pathname === "/login" && isCrew) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && isAllowed) {
    const next = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/internal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 4. The old one-tap punch link (/crew/punch?t=...) took no sign-in at all.
  // Time is clocked in the app now.
  if (pathname === "/crew/punch") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
