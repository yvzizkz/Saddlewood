import { notFound, redirect } from "next/navigation";
import { BATCHES, REVIEW_TOKEN } from "@/lib/reviewData";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { ReviewClient } from "./ReviewClient";

export const metadata = {
  title: "Saddlewood approvals",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { batch } = await params;
  const { k } = await searchParams;
  const data = BATCHES[batch];
  if (!data) notFound();

  // Guard: requires either an authenticated session on the allowlist OR a valid token
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuth = user && isAllowedEmail(user.email);
  const hasToken = k === REVIEW_TOKEN;

  if (!isAuth && !hasToken) {
    redirect(`/login?next=/review/${batch}`);
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <ReviewClient batch={data} token={k || REVIEW_TOKEN} />
    </main>
  );
}
