import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getContractsStateMock, updateContractMock, session } = vi.hoisted(() => ({
  getContractsStateMock: vi.fn(),
  updateContractMock: vi.fn(),
  session: { user: null as null | { email: string; app_metadata?: Record<string, unknown> } },
}));

vi.mock('@/lib/contracts/store', () => ({
  getContractsState: getContractsStateMock,
  updateContract: updateContractMock,
}));

// Who is signed in, as far as the server client can tell. null is a visitor.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
  }),
}));

import { findBySignToken, signLinkToken, withSignToken } from '@/lib/contracts/link';
import type { ContractItem } from '@/lib/contracts/types';
import { GET, POST } from '../[id]/sign/route';

const AGENT_TOKEN = 'test-token-with-enough-length-1234';
const SERVER_KEY = 'test-service-role-key-0123456789';
const asAgent = { Authorization: `Bearer ${AGENT_TOKEN}` };

const contract = (n: number, status: string) =>
  ({
    id: `cnt-00${n}`,
    n,
    contract_number: `SWC-2026-00${n}`,
    type: 'prime_residential',
    client_name: `Client ${n}`,
    project_name: `Project ${n}`,
    project_address: '3526 Emerson St',
    amount: 45000,
    deposit: 4500,
    scope: 'Framing & Drywall',
    status,
    created_by: 'Marco',
    contract_text: `AGREEMENT ${n}`,
  }) as unknown as ContractItem;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const signing = (id: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/contracts/${id}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ signerName: 'Pat Client', signerEmail: 'pat@example.com', agreed: true }),
  });

describe('the signing link', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('OPS_AGENT_TOKEN', AGENT_TOKEN);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVER_KEY);
    session.user = null;
    getContractsStateMock.mockReset();
    updateContractMock.mockReset();
    getContractsStateMock.mockResolvedValue({
      contracts: [contract(1, 'draft'), contract(2, 'under_review'), contract(3, 'signed')],
      next_number: 4,
      lastUpdated: '2026-09-24T18:00:00Z',
    });
    updateContractMock.mockImplementation(async (id: string, updates: Partial<ContractItem>) => ({
      ...contract(Number(id.slice(-1)), 'draft'),
      ...updates,
    }));
  });

  describe('the token', () => {
    it('is 32 hex characters, the same every time, and different for each contract', () => {
      const one = signLinkToken('cnt-001');
      expect(one).toMatch(/^[0-9a-f]{32}$/);
      expect(signLinkToken('cnt-001')).toBe(one);
      expect(signLinkToken('cnt-002')).not.toBe(one);
    });

    it('changes when the server key changes', () => {
      const before = signLinkToken('cnt-001');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'another-service-role-key-98765');
      expect(signLinkToken('cnt-001')).not.toBe(before);
    });

    it('cannot be made without a server key', () => {
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      expect(signLinkToken('cnt-001')).toBeNull();
      expect(withSignToken(contract(1, 'draft')).sign_token).toBeUndefined();
    });

    it('finds its own contract and nothing else', () => {
      const all = [contract(1, 'draft'), contract(2, 'under_review')];
      const two = signLinkToken('cnt-002')!;
      expect(findBySignToken(all, two)?.id).toBe('cnt-002');
      expect(findBySignToken(all, ` ${two.toUpperCase()} `)?.id).toBe('cnt-002');
      for (const guess of ['cnt-002', '2', 'SWC-2026-002', '', two.slice(0, 31), `${two}0`]) {
        expect(findBySignToken(all, guess)).toBeNull();
      }
    });
  });

  describe('reading the agreement', () => {
    it.each(['cnt-001', '1', 'SWC-2026-001', 'cnt-003', '3'])(
      'GET /api/contracts/%s/sign answers 404 to a visitor',
      async (guess) => {
        const res = await GET(new NextRequest(`http://localhost/api/contracts/${guess}/sign`), params(guess));
        expect(res.status).toBe(404);
      }
    );

    it('opens for a visitor holding the token, with the client view only', async () => {
      const token = signLinkToken('cnt-002')!;
      const res = await GET(new NextRequest(`http://localhost/api/contracts/${token}/sign`), params(token));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.contract.id).toBe('cnt-002');
      expect(data.contract.contract_text).toBe('AGREEMENT 2');
      expect(data.contract.created_by).toBeUndefined();
    });

    it('opens by id for staff', async () => {
      const res = await GET(
        new NextRequest('http://localhost/api/contracts/cnt-001/sign', { headers: asAgent }),
        params('cnt-001')
      );
      expect(res.status).toBe(200);

      session.user = { email: 'marco@saddlewoodcontracting.com' };
      const signedIn = await GET(new NextRequest('http://localhost/api/contracts/1/sign'), params('1'));
      expect(signedIn.status).toBe(200);
    });

    it('stays shut by id for a signed-in crew member', async () => {
      session.user = { email: 'framer@example.com', app_metadata: { sw_role: 'crew' } };
      const res = await GET(new NextRequest('http://localhost/api/contracts/1/sign'), params('1'));
      expect(res.status).toBe(404);
    });

    it('is shut to every visitor when the server cannot make tokens', async () => {
      const token = signLinkToken('cnt-001')!;
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      const res = await GET(new NextRequest(`http://localhost/api/contracts/${token}/sign`), params(token));
      expect(res.status).toBe(404);
    });
  });

  describe('signing it', () => {
    it.each(['cnt-001', '1', 'SWC-2026-001'])(
      'POST /api/contracts/%s/sign signs nothing for a visitor',
      async (guess) => {
        const res = await POST(signing(guess), params(guess));
        expect(res.status).toBe(404);
        expect(updateContractMock).not.toHaveBeenCalled();
      }
    );

    it('signs the contract the token belongs to', async () => {
      const token = signLinkToken('cnt-001')!;
      const res = await POST(signing(token), params(token));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(updateContractMock.mock.calls[0][0]).toBe('cnt-001');
      expect(updateContractMock.mock.calls[0][1]).toMatchObject({ status: 'signed', signed_by: 'Pat Client' });
    });

    it('does not sign twice', async () => {
      const token = signLinkToken('cnt-003')!;
      const res = await POST(signing(token), params(token));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('Contract is already signed.');
      expect(updateContractMock).not.toHaveBeenCalled();
    });
  });
});
