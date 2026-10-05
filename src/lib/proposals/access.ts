import type { NextRequest } from 'next/server';

import { authorizeOps, type OpsActor } from '@/lib/ops/auth';
import { getProposalById, getProposalByShareToken } from './store';
import type { ProposalItem } from './types';

// Who may open a proposal through the API, and by what name.
//
// A client is not signed in. What lets them in is the link we sent them,
// /p/<token>, and only that exact token. Staff (a signed-in address on the
// portal allowlist) and the bot (the agent token) may also use the short
// forms the store understands: prp-001, PRP-2026-001, "moore", the start of
// a token. Those are easy to guess, which is why they are not for the public:
// before this rule anyone could read a bid by asking for /api/proposals/prp-001.
//
// Someone who is not let in gets null, and the route answers 404: the same
// answer as for a proposal that does not exist.

export type ProposalAccess = { proposal: ProposalItem; staff: OpsActor | null };

export async function openProposal(
  request: NextRequest,
  identifier: string
): Promise<ProposalAccess | null> {
  const staff = await authorizeOps(request);
  const proposal = staff
    ? await getProposalById(identifier)
    : await getProposalByShareToken(identifier);
  return proposal ? { proposal, staff } : null;
}
