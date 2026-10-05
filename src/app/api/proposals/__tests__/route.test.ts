import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getProposalsStateMock,
  createProposalMock,
  getProposalByIdMock,
  getProposalByTokenMock,
  getProposalByShareTokenMock,
  updateProposalStatusMock,
  toggleProposalAlternateMock,
  acceptProposalMock,
  addProposalUpdateMock,
  updateProposalUpdateStatusMock,
  session,
  sendMock,
} = vi.hoisted(() => ({
  getProposalsStateMock: vi.fn(),
  createProposalMock: vi.fn(),
  getProposalByIdMock: vi.fn(),
  getProposalByTokenMock: vi.fn(),
  getProposalByShareTokenMock: vi.fn(),
  updateProposalStatusMock: vi.fn(),
  toggleProposalAlternateMock: vi.fn(),
  acceptProposalMock: vi.fn(),
  addProposalUpdateMock: vi.fn(),
  updateProposalUpdateStatusMock: vi.fn(),
  session: { user: null as null | { email: string; app_metadata?: Record<string, unknown> } },
  sendMock: vi.fn(),
}));

vi.mock('@/lib/proposals/store', () => ({
  getProposalsState: getProposalsStateMock,
  createProposal: createProposalMock,
  getProposalById: getProposalByIdMock,
  getProposalByToken: getProposalByTokenMock,
  getProposalByShareToken: getProposalByShareTokenMock,
  updateProposalStatus: updateProposalStatusMock,
  toggleProposalAlternate: toggleProposalAlternateMock,
  acceptProposal: acceptProposalMock,
  addProposalUpdate: addProposalUpdateMock,
  updateProposalUpdateStatus: updateProposalUpdateStatusMock,
}));

// Who is signed in, as far as the server client can tell. null is a visitor.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
  }),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { GET as getProposals, POST as postProposal } from '../route';
import { GET as getSingleProposal, PATCH as patchProposal } from '../[id]/route';
import { POST as acceptProposalRoute } from '../[id]/accept/route';
import { GET as getUpdates, POST as postUpdate, PATCH as patchUpdate } from '../[id]/updates/route';

const AGENT_TOKEN = 'test-token-with-enough-length-1234';
const SHARE_TOKEN = 'bellevue-church-schifferer-ac938';
const asAgent = { Authorization: `Bearer ${AGENT_TOKEN}` };

describe('Proposals API Routes', () => {
  const dummyProposal = {
    id: 'prp-001',
    token: SHARE_TOKEN,
    proposal_number: 'PRP-2026-001',
    client_name: 'Dean Schifferer',
    project_name: 'Bellevue Heights Church',
    base_amount: 144913.0,
    drawing_basis: { current_rev: 'Rev. 5', set_name: 'Permit Set', date: 'July 20, 2026' },
    alternates: [{ id: 'alt-1', title: 'ChamClad', amount: 15000, selected: true }],
    status: 'sent',
  };

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('OPS_AGENT_TOKEN', AGENT_TOKEN);
    session.user = null;
    // The store as the routes see it: the exact share token opens the
    // proposal for anyone; the short forms are only ever asked for staff.
    getProposalByShareTokenMock.mockImplementation(async (t: string) =>
      t === SHARE_TOKEN ? dummyProposal : null
    );
    getProposalByIdMock.mockImplementation(async (t: string) =>
      ['prp-001', 'PRP-2026-001', 'bellevue', SHARE_TOKEN].includes(t) ? dummyProposal : null
    );
  });

  describe('the list and new proposals are staff only', () => {
    it('GET /api/proposals answers 401 to a visitor and reads nothing', async () => {
      const res = await getProposals(new NextRequest('http://localhost:3000/api/proposals'));
      expect(res.status).toBe(401);
      expect(getProposalsStateMock).not.toHaveBeenCalled();
    });

    it('GET /api/proposals returns dashboard state to the bot', async () => {
      getProposalsStateMock.mockResolvedValue({ proposals: [dummyProposal], next_number: 2 });

      const res = await getProposals(
        new NextRequest('http://localhost:3000/api/proposals', { headers: asAgent })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.proposals).toHaveLength(1);
      expect(json.proposals[0].client_name).toBe('Dean Schifferer');
    });

    it('GET /api/proposals returns dashboard state to signed-in staff', async () => {
      session.user = { email: 'marco@saddlewoodcontracting.com' };
      getProposalsStateMock.mockResolvedValue({ proposals: [dummyProposal], next_number: 2 });

      const res = await getProposals(new NextRequest('http://localhost:3000/api/proposals'));
      expect(res.status).toBe(200);
    });

    it('GET /api/proposals answers 401 to a signed-in crew member', async () => {
      session.user = { email: 'framer@example.com', app_metadata: { sw_role: 'crew' } };

      const res = await getProposals(new NextRequest('http://localhost:3000/api/proposals'));
      expect(res.status).toBe(401);
      expect(getProposalsStateMock).not.toHaveBeenCalled();
    });

    it('POST /api/proposals answers 401 to a visitor and creates nothing', async () => {
      const req = new NextRequest('http://localhost:3000/api/proposals', {
        method: 'POST',
        body: JSON.stringify({ client_name: 'X', project_name: 'Y', base_amount: 1 }),
      });
      const res = await postProposal(req);
      expect(res.status).toBe(401);
      expect(createProposalMock).not.toHaveBeenCalled();
    });

    it('POST /api/proposals validates required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/proposals', {
        method: 'POST',
        headers: asAgent,
        body: JSON.stringify({}),
      });
      const res = await postProposal(req);
      expect(res.status).toBe(400);
    });
  });

  describe('one proposal: the share token for a client, the short forms for staff', () => {
    it('GET /api/proposals/[id] opens for a visitor holding the exact token', async () => {
      const res = await getSingleProposal(
        new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}`),
        params(SHARE_TOKEN)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.proposal.id).toBe('prp-001');
      expect(getProposalByIdMock).not.toHaveBeenCalled();
    });

    it.each(['prp-001', 'PRP-2026-001', 'bellevue', 'bel'])(
      'GET /api/proposals/%s answers 404 to a visitor',
      async (guess) => {
        const res = await getSingleProposal(
          new NextRequest(`http://localhost:3000/api/proposals/${guess}`),
          params(guess)
        );
        expect(res.status).toBe(404);
        expect(getProposalByIdMock).not.toHaveBeenCalled();
      }
    );

    it('GET /api/proposals/[id] retrieves by id or short name for staff', async () => {
      const res = await getSingleProposal(
        new NextRequest('http://localhost:3000/api/proposals/bellevue', { headers: asAgent }),
        params('bellevue')
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.proposal.id).toBe('prp-001');
    });

    it('PATCH /api/proposals/[id] toggles alternates for the token holder', async () => {
      toggleProposalAlternateMock.mockResolvedValue({
        ...dummyProposal,
        alternates: [{ id: 'alt-1', title: 'ChamClad', amount: 15000, selected: false }],
      });

      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}`, {
        method: 'PATCH',
        body: JSON.stringify({ alternate_id: 'alt-1', selected: false }),
      });

      const res = await patchProposal(req, params(SHARE_TOKEN));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.proposal.alternates[0].selected).toBe(false);
      expect(toggleProposalAlternateMock).toHaveBeenCalledWith('prp-001', 'alt-1', false);
    });

    it('PATCH /api/proposals/[id] changes nothing for a visitor who guessed the id', async () => {
      const req = new NextRequest('http://localhost:3000/api/proposals/prp-001', {
        method: 'PATCH',
        body: JSON.stringify({ alternate_id: 'alt-1', selected: false }),
      });

      const res = await patchProposal(req, params('prp-001'));
      expect(res.status).toBe(404);
      expect(toggleProposalAlternateMock).not.toHaveBeenCalled();
    });

    it('PATCH /api/proposals/[id] keeps the status for staff, even from the token holder', async () => {
      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'declined' }),
      });

      const res = await patchProposal(req, params(SHARE_TOKEN));
      expect(res.status).toBe(401);
      expect(updateProposalStatusMock).not.toHaveBeenCalled();
    });

    it('PATCH /api/proposals/[id] lets staff change the status', async () => {
      updateProposalStatusMock.mockResolvedValue({ ...dummyProposal, status: 'declined' });
      const req = new NextRequest('http://localhost:3000/api/proposals/prp-001', {
        method: 'PATCH',
        headers: asAgent,
        body: JSON.stringify({ status: 'declined' }),
      });

      const res = await patchProposal(req, params('prp-001'));
      expect(res.status).toBe(200);
      expect(updateProposalStatusMock).toHaveBeenCalledWith('prp-001', 'declined');
    });

    it('POST /api/proposals/[id]/accept captures acceptance from the token holder', async () => {
      acceptProposalMock.mockResolvedValue({
        ...dummyProposal,
        status: 'accepted',
        accepted_by: 'Dean Schifferer',
        accepted_signature: 'data:image/png;base64,sample',
      });

      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/accept`, {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.1' },
        body: JSON.stringify({
          name: 'Dean Schifferer',
          signature: 'data:image/png;base64,sample',
        }),
      });

      const res = await acceptProposalRoute(req, params(SHARE_TOKEN));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.proposal.status).toBe('accepted');
      expect(json.proposal.accepted_by).toBe('Dean Schifferer');
      expect(acceptProposalMock).toHaveBeenCalledWith('prp-001', {
        name: 'Dean Schifferer',
        signature: 'data:image/png;base64,sample',
        ip: '198.51.100.1',
      });
    });

    it('POST /api/proposals/[id]/accept refuses a visitor who guessed the id', async () => {
      const req = new NextRequest('http://localhost:3000/api/proposals/prp-001/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Somebody Else', signature: 'x' }),
      });

      const res = await acceptProposalRoute(req, params('prp-001'));
      expect(res.status).toBe(404);
      expect(acceptProposalMock).not.toHaveBeenCalled();
    });
  });

  describe('the notes a client sends in', () => {
    const update = {
      id: 'upd-002',
      author_name: 'Dean Schifferer',
      category: 'scope_change',
      message: 'Add blocking for TV mounts',
      attachments: [],
      status: 'pending_review',
      created_at: new Date().toISOString(),
    };

    it('GET /api/proposals/[id]/updates lists them for the token holder', async () => {
      getProposalByShareTokenMock.mockResolvedValue({
        ...dummyProposal,
        updates: [{ ...update, id: 'upd-001', author_name: 'Paul Johnson' }],
      });

      const res = await getUpdates(
        new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/updates`),
        params(SHARE_TOKEN)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.updates).toHaveLength(1);
      expect(json.updates[0].author_name).toBe('Paul Johnson');
    });

    it('GET /api/proposals/[id]/updates answers 404 to a visitor who guessed the id', async () => {
      const res = await getUpdates(
        new NextRequest('http://localhost:3000/api/proposals/prp-001/updates'),
        params('prp-001')
      );
      expect(res.status).toBe(404);
    });

    it('POST /api/proposals/[id]/updates validates and adds update', async () => {
      addProposalUpdateMock.mockResolvedValue({ proposal: dummyProposal, update });

      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/updates`, {
        method: 'POST',
        body: JSON.stringify({
          author_name: 'Dean Schifferer',
          category: 'scope_change',
          message: 'Add blocking for TV mounts',
        }),
      });

      const res = await postUpdate(req, params(SHARE_TOKEN));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.update.message).toBe('Add blocking for TV mounts');
      expect(addProposalUpdateMock.mock.calls[0][0]).toBe('prp-001');
    });

    it('POST /api/proposals/[id]/updates refuses a category it does not know', async () => {
      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/updates`, {
        method: 'POST',
        body: JSON.stringify({ author_name: 'X', category: 'toString', message: 'hello' }),
      });

      const res = await postUpdate(req, params(SHARE_TOKEN));
      expect(res.status).toBe(400);
      expect(addProposalUpdateMock).not.toHaveBeenCalled();
    });

    it('POST /api/proposals/[id]/updates adds nothing for a visitor who guessed the id', async () => {
      const req = new NextRequest('http://localhost:3000/api/proposals/prp-001/updates', {
        method: 'POST',
        body: JSON.stringify({ author_name: 'X', category: 'scope_change', message: 'hello' }),
      });

      const res = await postUpdate(req, params('prp-001'));
      expect(res.status).toBe(404);
      expect(addProposalUpdateMock).not.toHaveBeenCalled();
    });

    it('the alert email escapes what the sender typed', async () => {
      vi.stubEnv('RESEND_API_KEY', 're_test');
      addProposalUpdateMock.mockResolvedValue({
        proposal: dummyProposal,
        update: {
          ...update,
          author_name: '<b>Dean</b>',
          author_email: 'not an address"><script>',
          message: '<img src=x onerror=alert(1)>',
          attachments: [{ id: 'a', name: '<i>plan</i>.pdf', size: 2048, type: 'application/pdf', data_url: '#' }],
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/updates`, {
        method: 'POST',
        body: JSON.stringify({ author_name: 'x', category: 'scope_change', message: 'x' }),
      });

      const res = await postUpdate(req, params(SHARE_TOKEN));
      expect(res.status).toBe(201);
      expect(sendMock).toHaveBeenCalledTimes(1);
      const mail = sendMock.mock.calls[0][0];
      expect(mail.html).not.toContain('<img');
      expect(mail.html).not.toContain('<script');
      expect(mail.html).not.toContain('<b>Dean</b>');
      expect(mail.html).not.toContain('<i>plan</i>');
      expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(mail.html).toContain('&lt;i&gt;plan&lt;/i&gt;.pdf (2 KB)');
      expect(mail.replyTo).toBe('info@saddlewoodcontracting.com');
    });

    it('PATCH /api/proposals/[id]/updates is staff only', async () => {
      const body = JSON.stringify({ update_id: 'upd-002', status: 'acknowledged' });

      const visitor = await patchUpdate(
        new NextRequest(`http://localhost:3000/api/proposals/${SHARE_TOKEN}/updates`, {
          method: 'PATCH',
          body,
        }),
        params(SHARE_TOKEN)
      );
      expect(visitor.status).toBe(401);
      expect(updateProposalUpdateStatusMock).not.toHaveBeenCalled();

      updateProposalUpdateStatusMock.mockResolvedValue(dummyProposal);
      const staff = await patchUpdate(
        new NextRequest('http://localhost:3000/api/proposals/prp-001/updates', {
          method: 'PATCH',
          headers: asAgent,
          body,
        }),
        params('prp-001')
      );
      expect(staff.status).toBe(200);
      expect(updateProposalUpdateStatusMock).toHaveBeenCalledWith('prp-001', 'upd-002', 'acknowledged');
    });
  });
});
