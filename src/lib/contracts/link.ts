import { createHmac, timingSafeEqual } from 'crypto';

import type { ContractItem } from './types';

// The client's signing link: /sign/<token>.
//
// A contract's id (cnt-001), its number (SWC-2026-001) and its place in the
// list (1) are all easy to guess, and the signing page shows the whole
// agreement and takes a signature. So the link carries a token nobody can
// guess instead, and that token is the only thing that opens the signing
// page for someone who is not signed in.
//
// The token is not stored. It is worked out from the contract's id and a key
// only the server holds, so every contract has one, old or new, and it stays
// the same from one day to the next. Changing that server key
// (SUPABASE_SERVICE_ROLE_KEY) retires every outstanding link at once: copy
// the links again from /internal/contracts after a key change.

function linkKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key && key.length >= 16 ? key : null;
}

export function signLinkToken(contractId: string): string | null {
  const key = linkKey();
  if (!key) return null;
  return createHmac('sha256', key)
    .update(`contract-sign-link:${contractId}`)
    .digest('hex')
    .slice(0, 32);
}

export function findBySignToken(contracts: ContractItem[], token: string): ContractItem | null {
  const given = Buffer.from(token.trim().toLowerCase(), 'utf8');
  for (const c of contracts) {
    const expected = signLinkToken(c.id);
    if (!expected) return null;
    const want = Buffer.from(expected, 'utf8');
    if (given.length === want.length && timingSafeEqual(given, want)) return c;
  }
  return null;
}

// What staff get back from the API: the contract plus its signing token, so
// /internal/contracts can hand out the client's link.
export function withSignToken<T extends { id: string }>(contract: T): T & { sign_token?: string } {
  return { ...contract, sign_token: signLinkToken(contract.id) ?? undefined };
}
