import { NextResponse } from 'next/server';
import {
  getProposalById,
  getProposalByToken,
  updateProposalStatus,
  toggleProposalAlternate,
} from '@/lib/proposals/store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const proposal = (await getProposalById(id)) || (await getProposalByToken(id));
    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, proposal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (body.alternate_id !== undefined && body.selected !== undefined) {
      const updated = await toggleProposalAlternate(id, body.alternate_id, body.selected);
      return NextResponse.json({ ok: true, proposal: updated });
    }

    if (body.status) {
      const updated = await updateProposalStatus(id, body.status);
      return NextResponse.json({ ok: true, proposal: updated });
    }

    return NextResponse.json({ error: 'No valid action specified' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
