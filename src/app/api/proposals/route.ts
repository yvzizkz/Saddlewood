import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { getProposalsState, createProposal } from '@/lib/proposals/store';

export const dynamic = 'force-dynamic';

// The whole list, and writing a new proposal, are staff work: a signed-in
// address on the allowlist, or the bot with its agent token. A client only
// ever reaches one proposal, through /api/proposals/<their token>.

const unauthorized = () =>
  NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await authorizeOps(request))) return unauthorized();

  try {
    const state = await getProposalsState();
    return NextResponse.json(state);
  } catch (err) {
    console.error('Error fetching proposals:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorizeOps(request))) return unauthorized();

  try {
    const body = await request.json();
    if (!body.client_name || !body.project_name || body.base_amount === undefined) {
      return NextResponse.json({ error: 'Missing required proposal fields' }, { status: 400 });
    }

    const proposal = await createProposal(body, body.created_by || 'Marco');
    return NextResponse.json({ ok: true, proposal });
  } catch (err) {
    console.error('Error creating proposal:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
