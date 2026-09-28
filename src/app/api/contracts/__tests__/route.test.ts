import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getContractsStateMock,
  saveContractsStateMock,
  draftContractMock,
  updateContractMock,
} = vi.hoisted(() => ({
  getContractsStateMock: vi.fn(),
  saveContractsStateMock: vi.fn(),
  draftContractMock: vi.fn(),
  updateContractMock: vi.fn(),
}));

vi.mock('@/lib/contracts/store', () => ({
  getContractsState: getContractsStateMock,
  saveContractsState: saveContractsStateMock,
  draftContract: draftContractMock,
  updateContract: updateContractMock,
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
    draftContractMock.mockReset();
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

  it('rejects POST without authentication with 401', async () => {
    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      body: JSON.stringify({ client_name: 'Test' }),
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('validates required fields on contract draft', async () => {
    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_name: 'Test' }), // missing amount & scope
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it('successfully drafts a new contract with required legal protections', async () => {
    draftContractMock.mockResolvedValueOnce({
      id: 'cnt-002',
      n: 2,
      contract_number: 'SWC-2026-002',
      type: 'prime_residential',
      client_name: 'Powell Residence',
      amount: 45000,
      scope: 'Framing, Drywall & HVAC Coordination',
      status: 'draft',
      protections: {
        manufacturerDefectCarveOut: true,
        latePaymentPenalties: true,
        zeroVerbalChangeOrders: true,
        preliminaryLienNotice: true,
        limitedWorkmanshipWarranty: true,
      },
    });

    const req = new NextRequest('http://localhost/api/contracts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Ops-Actor': 'Marco',
      },
      body: JSON.stringify({
        client_name: 'Powell Residence',
        project_address: '3526 Emerson St',
        amount: 45000,
        scope: 'Framing, Drywall & HVAC Coordination',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contract.id).toBe('cnt-002');
    expect(data.contract.protections.manufacturerDefectCarveOut).toBe(true);
    expect(data.contract.protections.latePaymentPenalties).toBe(true);
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
