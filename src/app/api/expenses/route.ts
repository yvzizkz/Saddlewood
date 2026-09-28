import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import {
  addExpense,
  categorizeExpense,
  dismissExpense,
  getAccountingState,
} from '@/lib/expenses/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const state = await getAccountingState();
    return NextResponse.json({ ok: true, ...state });
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

  let body: {
    action?: 'categorize' | 'dismiss' | 'add';
    id?: string;
    n?: number;
    project?: string;
    expenseType?: string;
    via?: 'portal' | 'text' | 'email';
    expense?: any;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const { action, id, n, project, expenseType, via = 'portal', expense } = body;
  const targetId = id || n;

  if (action === 'categorize') {
    if (!targetId || !project || !expenseType) {
      return NextResponse.json(
        { ok: false, error: 'Missing target item, project, or expenseType' },
        { status: 400 }
      );
    }
    const updated = await categorizeExpense(targetId, project, expenseType, who.actor, via);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: updated });
  }

  if (action === 'dismiss') {
    if (!targetId) {
      return NextResponse.json({ ok: false, error: 'Missing target item' }, { status: 400 });
    }
    const updated = await dismissExpense(targetId, who.actor, via);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: updated });
  }

  if (action === 'add' && expense) {
    const added = await addExpense(expense, who.actor);
    return NextResponse.json({ ok: true, item: added }, { status: 201 });
  }

  return NextResponse.json(
    { ok: false, error: `Unsupported action: ${action}` },
    { status: 400 }
  );
}
