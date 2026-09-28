import { NextResponse } from 'next/server';
import { getProposalsState, createProposal } from '@/lib/proposals/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getProposalsState();
    return NextResponse.json(state);
  } catch (err) {
    console.error('Error fetching proposals:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
