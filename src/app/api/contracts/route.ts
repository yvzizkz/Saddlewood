import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { draftContract, getContractsState, saveContractsState } from '@/lib/contracts/store';
import type { DraftContractInput } from '@/lib/contracts/types';

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
      contracts: state.contracts,
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

    const payload: DraftContractInput = body.contract || body;
    if (!payload.client_name || !payload.amount || !payload.scope) {
      return NextResponse.json(
        { ok: false, error: 'Missing required contract fields: client_name, amount, or scope' },
        { status: 400 }
      );
    }

    const contract = await draftContract(payload, who.actor);
    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
