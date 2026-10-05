import { redirect } from 'next/navigation';
import { getProposalByShareToken } from '@/lib/proposals/store';

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const proposal = await getProposalByShareToken(token);

  if (proposal) {
    redirect(`/p/${token}`);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="max-w-lg w-full text-center bg-white p-8 rounded-2xl border border-[var(--color-stone)] shadow-sm">
        <h1
          className="text-2xl mb-2"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: 'var(--color-charcoal)',
          }}
        >
          Proposal & Estimate Review
        </h1>
        <p className="text-xs text-[var(--color-charcoal-light)]">
          The requested document link (<code className="font-mono text-slate-700">{token}</code>) is currently being processed or has moved.
        </p>
      </div>
    </div>
  );
}
