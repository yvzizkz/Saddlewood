import { NextRequest, NextResponse } from "next/server";
import { BATCHES, REVIEW_TOKEN } from "@/lib/reviewData";

// Short links: saddlewoodcontracting.com/r/m1 -> the approval queue, token attached.
// The short link itself is the capability; it is only ever sent to the owner.

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!BATCHES[slug]) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const url = new URL(`/review/${slug}`, req.url);
  url.searchParams.set("k", REVIEW_TOKEN);
  return NextResponse.redirect(url);
}
