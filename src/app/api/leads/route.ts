import { NextResponse } from 'next/server';
import { getLeadsState, updateLeadStatus } from '@/lib/leads/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const state = await getLeadsState(forceRefresh);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    console.error('Error fetching leads state:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { phone, status } = body;

    if (!phone || !['pending', 'called', 'texted', 'dismissed'].includes(status)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid phone or status' },
        { status: 400 }
      );
    }

    await updateLeadStatus(phone, status);
    return NextResponse.json({ ok: true, phone, status });
  } catch (error) {
    console.error('Error updating lead status:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
