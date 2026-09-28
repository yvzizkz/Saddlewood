import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getProposalsStateMock,
  createProposalMock,
  getProposalByIdMock,
  getProposalByTokenMock,
  updateProposalStatusMock,
  toggleProposalAlternateMock,
  acceptProposalMock,
  addProposalUpdateMock,
  updateProposalUpdateStatusMock,
} = vi.hoisted(() => ({
  getProposalsStateMock: vi.fn(),
  createProposalMock: vi.fn(),
  getProposalByIdMock: vi.fn(),
  getProposalByTokenMock: vi.fn(),
  updateProposalStatusMock: vi.fn(),
  toggleProposalAlternateMock: vi.fn(),
  acceptProposalMock: vi.fn(),
  addProposalUpdateMock: vi.fn(),
  updateProposalUpdateStatusMock: vi.fn(),
}));

vi.mock('@/lib/proposals/store', () => ({
  getProposalsState: getProposalsStateMock,
  createProposal: createProposalMock,
  getProposalById: getProposalByIdMock,
  getProposalByToken: getProposalByTokenMock,
  updateProposalStatus: updateProposalStatusMock,
  toggleProposalAlternate: toggleProposalAlternateMock,
  acceptProposal: acceptProposalMock,
  addProposalUpdate: addProposalUpdateMock,
  updateProposalUpdateStatus: updateProposalUpdateStatusMock,
}));

import { GET as getProposals, POST as postProposal } from '../route';
import { GET as getSingleProposal, PATCH as patchProposal } from '../[id]/route';
import { POST as acceptProposalRoute } from '../[id]/accept/route';
import { GET as getUpdates, POST as postUpdate } from '../[id]/updates/route';

describe('Proposals API Routes', () => {
  const dummyProposal = {
    id: 'prp-001',
    token: 'bellevue-church-schifferer-ac938',
    proposal_number: 'PRP-2026-001',
    client_name: 'Dean Schifferer',
    project_name: 'Bellevue Heights Church',
    base_amount: 144913.0,
    alternates: [{ id: 'alt-1', title: 'ChamClad', amount: 15000, selected: true }],
    status: 'sent',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/proposals returns dashboard state', async () => {
    getProposalsStateMock.mockResolvedValue({
      proposals: [dummyProposal],
      next_number: 2,
    });

    const res = await getProposals();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposals).toHaveLength(1);
    expect(json.proposals[0].client_name).toBe('Dean Schifferer');
  });

  it('POST /api/proposals validates required fields', async () => {
    const req = new NextRequest('http://localhost:3000/api/proposals', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await postProposal(req);
    expect(res.status).toBe(400);
  });

  it('GET /api/proposals/[id] retrieves by token or id', async () => {
    getProposalByIdMock.mockResolvedValue(dummyProposal);
    const res = await getSingleProposal(
      new NextRequest('http://localhost:3000/api/proposals/prp-001'),
      { params: Promise.resolve({ id: 'prp-001' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.id).toBe('prp-001');
  });

  it('PATCH /api/proposals/[id] toggles alternates', async () => {
    toggleProposalAlternateMock.mockResolvedValue({
      ...dummyProposal,
      alternates: [{ id: 'alt-1', title: 'ChamClad', amount: 15000, selected: false }],
    });

    const req = new NextRequest('http://localhost:3000/api/proposals/prp-001', {
      method: 'PATCH',
      body: JSON.stringify({ alternate_id: 'alt-1', selected: false }),
    });

    const res = await patchProposal(req, { params: Promise.resolve({ id: 'prp-001' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.alternates[0].selected).toBe(false);
  });

  it('POST /api/proposals/[id]/accept captures acceptance', async () => {
    acceptProposalMock.mockResolvedValue({
      ...dummyProposal,
      status: 'accepted',
      accepted_by: 'Dean Schifferer',
      accepted_signature: 'data:image/png;base64,sample',
    });

    const req = new NextRequest('http://localhost:3000/api/proposals/prp-001/accept', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      body: JSON.stringify({
        name: 'Dean Schifferer',
        signature: 'data:image/png;base64,sample',
      }),
    });

    const res = await acceptProposalRoute(req, { params: Promise.resolve({ id: 'prp-001' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.status).toBe('accepted');
    expect(json.proposal.accepted_by).toBe('Dean Schifferer');
  });

  it('GET /api/proposals/[id]/updates retrieves updates list', async () => {
    getProposalByIdMock.mockResolvedValue({
      ...dummyProposal,
      updates: [
        {
          id: 'upd-001',
          author_name: 'Paul Johnson',
          category: 'drawing_revision',
          message: 'Rev 5 attached',
          attachments: [],
          status: 'pending_review',
        },
      ],
    });

    const res = await getUpdates(
      new NextRequest('http://localhost:3000/api/proposals/prp-001/updates'),
      { params: Promise.resolve({ id: 'prp-001' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updates).toHaveLength(1);
    expect(json.updates[0].author_name).toBe('Paul Johnson');
  });

  it('POST /api/proposals/[id]/updates validates and adds update', async () => {
    addProposalUpdateMock.mockResolvedValue({
      proposal: dummyProposal,
      update: {
        id: 'upd-002',
        author_name: 'Dean Schifferer',
        category: 'scope_change',
        message: 'Add blocking for TV mounts',
        attachments: [],
        status: 'pending_review',
        created_at: new Date().toISOString(),
      },
    });

    const req = new NextRequest('http://localhost:3000/api/proposals/prp-001/updates', {
      method: 'POST',
      body: JSON.stringify({
        author_name: 'Dean Schifferer',
        category: 'scope_change',
        message: 'Add blocking for TV mounts',
      }),
    });

    const res = await postUpdate(req, { params: Promise.resolve({ id: 'prp-001' }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.update.message).toBe('Add blocking for TV mounts');
  });
});
