import { NextRequest, NextResponse } from 'next/server';
import { openProposal } from '@/lib/proposals/access';
import { acceptProposal } from '@/lib/proposals/store';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, signature } = body;

    if (!name || !signature) {
      return NextResponse.json({ error: 'Name and signature are required' }, { status: 400 });
    }

    // Accepting takes the client's own link: the share token, not prp-001.
    const access = await openProposal(request, id);
    if (!access) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    const proposal = await acceptProposal(access.proposal.id, { name, signature, ip });
    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proposal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
