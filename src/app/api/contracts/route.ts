import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { withSignToken } from '@/lib/contracts/link';
import { getContractsState, saveContractsState } from '@/lib/contracts/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const state = await getContractsState();
    const contracts = state.contracts;

    const summary = {
      totalCount: contracts.length,
      draftCount: contracts.filter((c) => c.status === 'draft').length,
      reviewCount: contracts.filter((c) => c.status === 'under_review').length,
      signedCount: contracts.filter((c) => c.status === 'signed').length,
      totalPipelineValue: contracts.reduce((acc, c) => acc + (c.amount || 0), 0),
      signedValue: contracts
        .filter((c) => c.status === 'signed')
        .reduce((acc, c) => acc + (c.amount || 0), 0),
    };

    return NextResponse.json({
      ok: true,
      contracts: state.contracts.map(withSignToken),
      next_number: state.next_number,
      lastUpdated: state.lastUpdated,
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- old prototype route, goes with cleanup Batch 2
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  try {
    // If incoming payload is from bot sync
    if (body.action === 'draft' && body.contract) {
      const state = await getContractsState();
      const incoming = body.contract;
      const existingIdx = state.contracts.findIndex(
        (c) => c.id === incoming.id || c.contract_number === incoming.contract_number
      );
      if (existingIdx >= 0) {
        state.contracts[existingIdx] = { ...state.contracts[existingIdx], ...incoming };
      } else {
        state.contracts.push(incoming);
      }
      await saveContractsState(state, who.actor);
      return NextResponse.json({ ok: true, contract: incoming });
    }

    // The site no longer writes an agreement's words here (T112): an
    // agreement is drafted on its job, from the accepted proposal. The bot's
    // own drafts (contract.py, action "draft" above) still sync until its
    // patch moves it to the job's agreement route.
    return NextResponse.json(
      { ok: false, error: 'agreements are drafted on the job now: /app/jobs/<id>' },
      { status: 410 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
