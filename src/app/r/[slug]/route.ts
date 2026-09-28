import { NextRequest, NextResponse } from "next/server";
import { BATCHES, REVIEW_TOKEN } from "@/lib/reviewData";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/ops/allowlist";

// Short links: saddlewoodcontracting.com/r/m1 -> authenticated redirect to the approval queue.
// Unauthenticated visitors are sent to /login with their target preserved.

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!BATCHES[slug]) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `/r/${slug}`);
    return NextResponse.redirect(loginUrl);
  }

  const url = new URL(`/review/${slug}`, req.url);
  url.searchParams.set("k", REVIEW_TOKEN);
  return NextResponse.redirect(url);
}
