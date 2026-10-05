import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { withSignToken } from '@/lib/contracts/link';
import { getContractsState, updateContract } from '@/lib/contracts/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const state = await getContractsState();
  const contract = state.contracts.find(
    (c) => c.id === id || c.contract_number === id || String(c.n) === id
  );

  if (!contract) {
    return NextResponse.json({ ok: false, error: 'contract not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contract: withSignToken(contract) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // The signing token is worked out, never stored: do not let it be saved.
  if (body && typeof body === 'object') delete body.sign_token;

  try {
    const updated = await updateContract(id, body, who.actor);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'contract not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, contract: withSignToken(updated) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
