import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// A client signs through POST /api/contracts/<id>/sign with the real store
// (SHIP review of #59): signed, and the signature block on its words, in one
// save. Only the edges are stand-ins: the progress_trackers row, the signed-in
// user, and fs, so the KB's contracts_state.json is never touched.

const { saved, upserts, written } = vi.hoisted(() => ({ saved: { state: null as unknown }, upserts: [] as unknown[], written: [] as string[] }));
vi.mock('fs', () => {
  const fs = { existsSync: () => false, readFileSync: () => '', writeFileSync: (p: string) => written.push(p), mkdirSync: () => undefined };
  return { ...fs, default: fs };
});
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved.state ? { state: structuredClone(saved.state) } : null }) }) }),
      upsert: async (row: { state: unknown }) => {
        saved.state = structuredClone(row.state);
        upserts.push(saved.state);
        return { error: null };
      },
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

import { signLinkToken } from '@/lib/contracts/link';
import { ContractTermsError, getContractsState, updateContract } from '@/lib/contracts/store';
import type { ContractItem } from '@/lib/contracts/types';
import { POST } from '../[id]/sign/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const signing = (id: string) =>
  new NextRequest(`http://localhost/api/contracts/${id}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone) Safari' },
    body: JSON.stringify({ signerName: ' Pat Client ', signerEmail: 'pat@example.com', agreed: true }),
  });

const stored = async (id: string): Promise<ContractItem> => (await getContractsState()).contracts.find((c) => c.id === id)!;

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-0123456789');
  saved.state = null;
  upserts.length = 0;
  written.length = 0;
});

describe('POST /api/contracts/<token>/sign, real store', () => {
  it('signs it and puts the signature block on its words, in one save', async () => {
    const before = await stored('cnt-002');
    expect(before.status).toBe('under_review');
    const token = signLinkToken('cnt-002')!;

    const res = await POST(signing(token), params(token));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const after = await stored('cnt-002');
    expect(after).toMatchObject({ status: 'signed', signed_by: 'Pat Client' });
    expect(after.signed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The drafted words, untouched, then the block: signer, time, IP and device.
    expect(after.contract_text.startsWith(before.contract_text)).toBe(true);
    const block = after.contract_text.slice(before.contract_text.length);
    expect(block).toContain('DIGITALLY SIGNED & EXECUTED');
    expect(block).toContain('Signer: Pat Client');
    expect(block).toMatch(/Timestamp: \w{3}, \d{2} \w{3} \d{4}/);
    expect(block).toContain('IP: 203.0.113.7');
    expect(block).toContain('User-Agent: Mozilla/5.0 (iPhone) Safari');
    expect(block).toContain('(pat@example.com)');
    expect(data.contract.contract_text).toBe(after.contract_text);
    expect(upserts).toHaveLength(1);
    // The other agreements are as they were.
    expect((await stored('cnt-001')).status).toBe('draft');
  });

  it('a second sign answers that it is already signed and changes nothing', async () => {
    const token = signLinkToken('cnt-002')!;
    expect((await POST(signing(token), params(token))).status).toBe(200);
    const once = await stored('cnt-002');

    const again = await POST(signing(token), params(token));
    expect(again.status).toBe(200);
    expect((await again.json()).message).toBe('Contract is already signed.');
    expect(await stored('cnt-002')).toEqual(once);
    expect(once.contract_text.match(/DIGITALLY SIGNED & EXECUTED/g)).toHaveLength(1);
    expect(upserts).toHaveLength(1);
  });

  it('any other change to its words is still refused', async () => {
    const before = await stored('cnt-001');
    await expect(updateContract('cnt-001', { contract_text: before.contract_text + '\n\nDIGITALLY SIGNED & EXECUTED' }, 'Marco')).rejects.toThrow(ContractTermsError);
    await expect(updateContract('cnt-001', { status: 'signed', contract_text: 'other words' }, 'Marco')).rejects.toThrow(ContractTermsError);
    expect(upserts).toHaveLength(0);
  });
});
