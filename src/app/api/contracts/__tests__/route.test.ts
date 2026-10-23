import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getContractsStateMock,
  saveContractsStateMock,
  updateContractMock,
  ContractTermsErrorMock,
} = vi.hoisted(() => ({
  getContractsStateMock: vi.fn(),
  saveContractsStateMock: vi.fn(),
  updateContractMock: vi.fn(),
  ContractTermsErrorMock: class extends Error {},
}));

vi.mock('@/lib/contracts/store', () => ({
  getContractsState: getContractsStateMock,
  saveContractsState: saveContractsStateMock,
  updateContract: updateContractMock,
  ContractTermsError: ContractTermsErrorMock,
}));

// No session in tests: server client reports no user
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { GET, POST } from '../route';
import { PATCH } from '../[id]/route';

const TOKEN = 'test-token-with-enough-length-1234';

describe('Contracts API Routes', () => {
  beforeEach(() => {
    vi.stubEnv('OPS_AGENT_TOKEN', TOKEN);
    getContractsStateMock.mockReset();
    saveContractsStateMock.mockReset();
    updateContractMock.mockReset();
    updateContractMock.mockReset();

    getContractsStateMock.mockResolvedValue({
      contracts: [
        {
          id: 'cnt-001',
          n: 1,
          contract_number: 'SWC-2026-001',
          type: 'prime_residential',
          client_name: 'Mark & Heather Powell',
          project_address: '3526 Emerson St',
          amount: 45000.0,
          scope: 'Framing & Drywall',
          status: 'draft',
          protections: {
            manufacturerDefectCarveOut: true,
            latePaymentPenalties: true,
            zeroVerbalChangeOrders: true,
            preliminaryLienNotice: true,
            limitedWorkmanshipWarranty: true,
          },
        },
      ],
      next_number: 2,
      lastUpdated: '2026-09-24T18:00:00Z',
    });
  });

  it('rejects GET without authentication with 401', async () => {
    const req = new NextRequest('http://localhost/api/contracts');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns contracts and summary metrics for authorized GET', async () => {
    const req = new NextRequest('http://localhost/api/contracts', {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'X-Ops-Actor': 'Lando',
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contracts).toHaveLength(1);
    expect(data.summary.totalPipelineValue).toBe(45000);
    expect(data.summary.draftCount).toBe(1);
  });

  it('gives staff the signing token with each contract', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-0123456789');
    const req = new NextRequest('http://localhost/api/contracts', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const res = await GET(req);
    const data = await res.json();
    expect(data.contracts[0].sign_token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects POST without authentication with 401', async () => {
    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      body: JSON.stringify({ client_name: 'Test' }),
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('no longer drafts an agreement on the site: 410, nothing saved', async () => {
    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Powell Residence', amount: 45000, scope: 'Framing' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toMatch(/drafted on the job/);
    expect(saveContractsStateMock).not.toHaveBeenCalled();
  });

  it("still saves the bot's own draft (contract.py, action draft), words and all", async () => {
    getContractsStateMock.mockResolvedValueOnce({ contracts: [], next_number: 4, lastUpdated: '' });
    const contract = { id: 'cnt-004', contract_number: 'SWC-2026-004', client_name: 'Test', amount: 1000, scope: 'Drywall', contract_text: '# PRIME RESIDENTIAL CONSTRUCTION AGREEMENT' };
    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft', contract }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(saveContractsStateMock.mock.calls[0][0].contracts).toEqual([contract]);
  });

  it('answers 409 when a PATCH would change the terms of a drafted agreement', async () => {
    updateContractMock.mockRejectedValueOnce(new ContractTermsErrorMock('amount can\'t change on a drafted agreement; draft it again on the job'));
    const req = new NextRequest('http://localhost/api/contracts/cnt-001', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'cnt-001' }) });
    expect(res.status).toBe(409);
  });

  it('updates contract status via PATCH [id]', async () => {
    updateContractMock.mockResolvedValueOnce({
      id: 'cnt-001',
      contract_number: 'SWC-2026-001',
      status: 'signed',
      signed_by: 'Marco',
    });

    const req = new NextRequest('http://localhost/api/contracts/cnt-001', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Ops-Actor': 'Marco',
      },
      body: JSON.stringify({ status: 'signed' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'cnt-001' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contract.status).toBe('signed');
  });
});
