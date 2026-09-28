import { NextResponse, type NextRequest } from 'next/server';
import {
  getCrewState,
  getWorkerDailyStatus,
  recordPunch,
  verifyPunchToken,
} from '@/lib/crew/store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    const workerIdParam = searchParams.get('workerId');

    let workerId = workerIdParam;
    if (token) {
      const verified = verifyPunchToken(token);
      if (!verified.valid || !verified.workerId) {
        return NextResponse.json({ ok: false, error: 'Invalid or expired punch token' }, { status: 400 });
      }
      workerId = verified.workerId;
    }

    if (!workerId) {
      // If no specific worker, return overall crew status (e.g. for superintendent or ops board)
      const state = await getCrewState();
      return NextResponse.json({
        ok: true,
        workers: state.workers,
        jobsites: state.jobsites,
        recentPunches: (state.punches || []).slice(-20).reverse(),
      });
    }

    const workerStatus = await getWorkerDailyStatus(workerId);
    if (!workerStatus) {
      return NextResponse.json({ ok: false, error: `Worker '${workerId}' not found` }, { status: 404 });
    }

    const state = await getCrewState();

    return NextResponse.json({
      ok: true,
      workerStatus,
      availableJobsites: state.jobsites.filter((j) => j.active),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, workerId: rawWorkerId, projectId, action, lat, lng, accuracy, notes } = body;

    let workerId = rawWorkerId;
    if (token) {
      const verified = verifyPunchToken(token);
      if (!verified.valid || !verified.workerId) {
        return NextResponse.json({ ok: false, error: 'Invalid or expired punch link' }, { status: 400 });
      }
      workerId = verified.workerId;
    }

    if (!workerId) {
      return NextResponse.json({ ok: false, error: 'Missing workerId or token' }, { status: 400 });
    }

    if (action !== 'clock_in' && action !== 'clock_out') {
      return NextResponse.json({ ok: false, error: "Action must be 'clock_in' or 'clock_out'" }, { status: 400 });
    }

    const result = await recordPunch({
      workerId,
      projectId,
      action,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      notes: notes ? String(notes) : undefined,
      source: 'web_punch',
    });

    return NextResponse.json({
      ok: true,
      punch: result.punch,
      workerStatus: result.workerStatus,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
