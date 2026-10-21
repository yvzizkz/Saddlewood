import { NextRequest, NextResponse } from 'next/server';
import { openProposal } from '@/lib/proposals/access';
import { updateProposalStatus } from '@/lib/proposals/store';
import { viewOnly } from '@/lib/proposals/viewOnly';

export const dynamic = 'force-dynamic';

// The [id] in the path is the client's share token, or, for staff only, any
// of the short forms: see src/lib/proposals/access.ts.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await openProposal(request, id);
    if (!access) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, proposal: access.proposal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await openProposal(request, id);
    if (!access) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    const body = await request.json();

    // A client used to pick alternates here; the old links are view-only now.
    if (body.alternate_id !== undefined && body.selected !== undefined) {
      return viewOnly();
    }

    // Moving it between draft, sent, accepted and declined is staff work.
    // (A client accepts through /accept, which records who signed.)
    if (body.status) {
      if (!access.staff) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      const updated = await updateProposalStatus(access.proposal.id, body.status);
      return NextResponse.json({ ok: true, proposal: updated });
    }

    return NextResponse.json({ error: 'No valid action specified' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
