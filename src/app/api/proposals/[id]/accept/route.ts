import { viewOnly } from '@/lib/proposals/viewOnly';

export const dynamic = 'force-dynamic';

// A client used to accept here. The old links are view-only now (see
// src/lib/proposals/viewOnly.ts): accepting goes through Saddlewood.
export async function POST() {
  return viewOnly();
}
