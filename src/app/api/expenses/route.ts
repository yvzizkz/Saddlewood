import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { addExpense, categorizeExpense, dismissExpense, listExpenses } from '@/lib/expenses/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The bot's door to the spend ledger (purchases, migration 0053), kept in the
// old Expenses page's shape: KB accounting.py (Zelle tagging, "Z12 Powell
// Materials"), receipt_ocr.py (texted receipts) and crew.py (app receipts,
// already in purchases as app:<entry id>) post here. The page itself moved to
// Purchases > Tag spend.

function fail(err: unknown) {
  return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, expenses: await listExpenses() });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: { action?: string; id?: string; n?: number; project?: string; expenseType?: string; expense?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const { action, id, n, project, expenseType, expense } = body;
  const target = id || n;

  try {
    if (action === 'categorize') {
      if (!target || typeof project !== 'string' || !project.trim() || typeof expenseType !== 'string' || !expenseType.trim()) {
        return NextResponse.json({ ok: false, error: 'Missing target item, project, or expenseType' }, { status: 400 });
      }
      const updated = await categorizeExpense(target, project, expenseType, who.actor);
      if (!updated) return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
      return NextResponse.json({ ok: true, item: updated });
    }

    if (action === 'dismiss') {
      if (!target) return NextResponse.json({ ok: false, error: 'Missing target item' }, { status: 400 });
      const updated = await dismissExpense(target, who.actor);
      if (!updated) return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
      return NextResponse.json({ ok: true, item: updated });
    }

    if (action === 'add') {
      // accounting.py sends a new Zelle payment's number alone: there is nothing to enter from that.
      const added = await addExpense(expense);
      if (!added.ok) return NextResponse.json({ ok: false, error: added.error }, { status: 422 });
      return NextResponse.json({ ok: true, item: added.item }, { status: added.created ? 201 : 200 });
    }
  } catch (err) {
    return fail(err);
  }

  return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
}
