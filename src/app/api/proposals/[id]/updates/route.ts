import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { openProposal } from '@/lib/proposals/access';
import { updateProposalUpdateStatus } from '@/lib/proposals/store';
import { viewOnly } from '@/lib/proposals/viewOnly';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ ok: true, updates: access.proposal.updates || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// A client used to send notes and files here (they were emailed to the
// owners and then dropped). The old links are view-only now: they call or
// email instead.
export async function POST() {
  return viewOnly();
}

// Marking a note acknowledged or incorporated is staff work.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await authorizeOps(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.update_id || !body.status) {
      return NextResponse.json({ error: 'update_id and status are required' }, { status: 400 });
    }

    const updated = await updateProposalUpdateStatus(id, body.update_id, body.status);
    if (!updated) {
      return NextResponse.json({ error: 'Proposal or update item not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proposal: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
