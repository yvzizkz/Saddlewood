import { NextResponse } from 'next/server';

// The old proposal links (/p/<token>) are view-only as of 2026-10-21. Their
// store is a file on the office Mac, so on the live site an acceptance, a
// picked alternate or a client's note was dropped without anyone seeing it.
// Accepting now goes through Saddlewood (Sales proposals, /d/<token>).
export const VIEW_ONLY_MESSAGE =
  'This proposal link is view-only. To accept it or ask for changes, call (480) 999-6100 or email info@saddlewoodcontracting.com.';

export function viewOnly(): NextResponse {
  return NextResponse.json({ ok: false, error: VIEW_ONLY_MESSAGE }, { status: 410 });
}
