import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getLeadsStateMock, updateLeadStatusMock, recordInboundLeadMock, session, sendMock } = vi.hoisted(() => ({
  getLeadsStateMock: vi.fn(),
  updateLeadStatusMock: vi.fn(),
  recordInboundLeadMock: vi.fn(),
  session: { user: null as null | { email: string; app_metadata?: Record<string, unknown> } },
  sendMock: vi.fn(),
}));

vi.mock('@/lib/leads/store', () => ({
  getLeadsState: getLeadsStateMock,
  updateLeadStatus: updateLeadStatusMock,
  recordInboundLead: recordInboundLeadMock,
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

import { GET, PATCH, POST } from '../route';

const AGENT_TOKEN = 'test-token-with-enough-length-1234';
const WEBHOOK_KEY = 'webhook-key-0123456789abcdef';
const asAgent = { Authorization: `Bearer ${AGENT_TOKEN}` };

describe('Leads API Routes', () => {
  const inbound = {
    phone: '4805550199',
    name: 'Dave Wilson',
    email: 'dave@wilsonbuilders.com',
    summary: 'Caller wants framing takeoff for 4,000 SF medical office.',
    tags: ['commercial-bid'],
  };

  const webhook = (url: string, headers: Record<string, string> = {}, body: unknown = inbound) =>
    new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('OPS_AGENT_TOKEN', AGENT_TOKEN);
    session.user = null;
    getLeadsStateMock.mockReset();
    updateLeadStatusMock.mockReset();
    recordInboundLeadMock.mockReset();
    sendMock.mockReset();

    getLeadsStateMock.mockResolvedValue({
      generated: '2026-09-27T08:36:17.414900+00:00',
      total_waiting: 496,
      fresh: 18,
      backlog: 478,
      backlog_with_history: 28,
      with_history: 29,
      named: 36,
      fresh_list: [
        {
          phone: '2524957763',
          display: '(252) 495-7763',
          named: false,
          unread: 6,
          last: '2026-09-23',
          last_ts: '2026-09-23T17:29:49.220000+00:00',
          age_days: 3,
          tags: ['callback-requested', 'voice-ai-lead'],
          opps: 2,
          fanout: false,
          tollfree: false,
          score: 188,
          snippet: 'Missed call',
          kb: null,
          dial_url: 'tel:+12524957763',
          suggested_sms: 'Hi there! This is Marco with Saddlewood Contracting...',
          sms_url: 'sms:+12524957763&body=...',
          callback_status: 'pending',
        },
      ],
      backlog_list: [],
      gone_quiet: [],
      gone_quiet_total: 0,
    });

    recordInboundLeadMock.mockResolvedValue({
      phone: '4805550199',
      display: '(480) 555-0199',
      name: 'Dave Wilson',
      tags: ['commercial-bid', 'ghl-webhook'],
      dial_url: 'tel:+14805550199',
      sms_url: 'sms:+14805550199',
    });
  });

  describe('the lead list is staff only', () => {
    it('GET /api/leads answers 401 to a visitor and reads nothing', async () => {
      const res = await GET(new NextRequest('http://localhost:3000/api/leads'));
      expect(res.status).toBe(401);
      expect(getLeadsStateMock).not.toHaveBeenCalled();
    });

    it('GET /api/leads?refresh=true answers 401 to a visitor and runs no sync', async () => {
      const res = await GET(new NextRequest('http://localhost:3000/api/leads?refresh=true'));
      expect(res.status).toBe(401);
      expect(getLeadsStateMock).not.toHaveBeenCalled();
    });

    it('GET /api/leads answers 401 to a signed-in crew member', async () => {
      session.user = { email: 'framer@example.com', app_metadata: { sw_role: 'crew' } };
      const res = await GET(new NextRequest('http://localhost:3000/api/leads'));
      expect(res.status).toBe(401);
    });

    it('GET /api/leads returns leads state to signed-in staff', async () => {
      session.user = { email: 'marco@saddlewoodcontracting.com' };
      const res = await GET(new NextRequest('http://localhost:3000/api/leads'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.state.fresh).toBe(18);
      expect(body.state.total_waiting).toBe(496);
      expect(body.state.fresh_list).toHaveLength(1);
      expect(body.state.fresh_list[0].phone).toBe('2524957763');
    });

    it('GET /api/leads?refresh=true triggers forceRefresh in store', async () => {
      const req = new NextRequest('http://localhost:3000/api/leads?refresh=true', { headers: asAgent });
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(getLeadsStateMock).toHaveBeenCalledWith(true);
    });

    it('PATCH /api/leads answers 401 to a visitor and changes nothing', async () => {
      const req = new NextRequest('http://localhost:3000/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '2524957763', status: 'dismissed' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(401);
      expect(updateLeadStatusMock).not.toHaveBeenCalled();
    });

    it('PATCH /api/leads successfully updates lead status', async () => {
      const req = new NextRequest('http://localhost:3000/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...asAgent },
        body: JSON.stringify({ phone: '2524957763', status: 'called' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.phone).toBe('2524957763');
      expect(body.status).toBe('called');
      expect(updateLeadStatusMock).toHaveBeenCalledWith('2524957763', 'called');
    });

    it('PATCH /api/leads validates invalid status', async () => {
      const req = new NextRequest('http://localhost:3000/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...asAgent },
        body: JSON.stringify({ phone: '2524957763', status: 'invalid_status' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  });

  describe('the webhook takes a key', () => {
    it('POST /api/leads is shut while no key is set', async () => {
      const res = await POST(webhook('http://localhost:3000/api/leads'));
      expect(res.status).toBe(401);
      expect(recordInboundLeadMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('POST /api/leads is shut to an empty key while no key is set', async () => {
      const res = await POST(webhook('http://localhost:3000/api/leads?key='));
      expect(res.status).toBe(401);
      expect(recordInboundLeadMock).not.toHaveBeenCalled();
    });

    it('POST /api/leads refuses a key that is too short to be one', async () => {
      vi.stubEnv('LEADS_WEBHOOK_KEY', 'short');
      const res = await POST(webhook('http://localhost:3000/api/leads?key=short'));
      expect(res.status).toBe(401);
      expect(recordInboundLeadMock).not.toHaveBeenCalled();
    });

    it('POST /api/leads refuses the wrong key', async () => {
      vi.stubEnv('LEADS_WEBHOOK_KEY', WEBHOOK_KEY);
      const res = await POST(webhook('http://localhost:3000/api/leads?key=webhook-key-0123456789abcdeX'));
      expect(res.status).toBe(401);
      expect(recordInboundLeadMock).not.toHaveBeenCalled();
    });

    it('POST /api/leads successfully receives webhook and records lead', async () => {
      vi.stubEnv('LEADS_WEBHOOK_KEY', WEBHOOK_KEY);
      const res = await POST(webhook(`http://localhost:3000/api/leads?key=${WEBHOOK_KEY}`));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.lead.phone).toBe('4805550199');
      expect(recordInboundLeadMock).toHaveBeenCalled();
    });

    it('POST /api/leads takes the key in a header too', async () => {
      vi.stubEnv('LEADS_WEBHOOK_KEY', WEBHOOK_KEY);
      const res = await POST(webhook('http://localhost:3000/api/leads', { 'x-webhook-key': WEBHOOK_KEY }));
      expect(res.status).toBe(201);
    });

    it('POST /api/leads lets staff record a lead without the key', async () => {
      const res = await POST(webhook('http://localhost:3000/api/leads', asAgent));
      expect(res.status).toBe(201);
      expect(recordInboundLeadMock).toHaveBeenCalled();
    });

    it('POST /api/leads validates missing phone', async () => {
      const res = await POST(webhook('http://localhost:3000/api/leads', asAgent, { name: 'No Phone Person' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it('the alert email escapes what the caller sent', async () => {
      vi.stubEnv('LEADS_WEBHOOK_KEY', WEBHOOK_KEY);
      vi.stubEnv('RESEND_API_KEY', 're_test');
      recordInboundLeadMock.mockResolvedValue({
        phone: '4805550199',
        display: '<u>(480) 555-0199</u>',
        name: '<b>Dave</b>',
        email: 'dave@example.com"><script>alert(1)</script>',
        tags: ['<i>tag</i>'],
        dial_url: 'tel:+14805550199',
        sms_url: 'sms:+14805550199&body=Hi%20Dave',
      });

      const res = await POST(
        webhook(`http://localhost:3000/api/leads?key=${WEBHOOK_KEY}`, {}, {
          ...inbound,
          summary: '<img src=x onerror=alert(1)> call me',
        })
      );
      expect(res.status).toBe(201);
      expect(sendMock).toHaveBeenCalledTimes(1);
      const mail = sendMock.mock.calls[0][0];
      expect(mail.html).not.toContain('<img');
      expect(mail.html).not.toContain('<script');
      expect(mail.html).not.toContain('<b>Dave</b>');
      expect(mail.html).not.toContain('<i>tag</i>');
      expect(mail.html).not.toContain('<u>');
      expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt; call me');
      expect(mail.html).toContain('href="sms:+14805550199&amp;body=Hi%20Dave"');
    });
  });
});
