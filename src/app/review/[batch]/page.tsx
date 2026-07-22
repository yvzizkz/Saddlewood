import { notFound } from "next/navigation";
import { BATCHES, REVIEW_TOKEN } from "@/lib/reviewData";
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
  if (!data || k !== REVIEW_TOKEN) notFound();
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <ReviewClient batch={data} token={k} />
    </main>
  );
}
