import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getLeadsStateMock, updateLeadStatusMock } = vi.hoisted(() => ({
  getLeadsStateMock: vi.fn(),
  updateLeadStatusMock: vi.fn(),
}));

vi.mock('@/lib/leads/store', () => ({
  getLeadsState: getLeadsStateMock,
  updateLeadStatus: updateLeadStatusMock,
}));

import { GET, PATCH } from '../route';

describe('Leads API Routes', () => {
  beforeEach(() => {
    getLeadsStateMock.mockReset();
    updateLeadStatusMock.mockReset();

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
  });

  it('GET /api/leads returns leads state', async () => {
    const req = new NextRequest('http://localhost:3000/api/leads');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state.fresh).toBe(18);
    expect(body.state.total_waiting).toBe(496);
    expect(body.state.fresh_list).toHaveLength(1);
    expect(body.state.fresh_list[0].phone).toBe('2524957763');
  });

  it('GET /api/leads?refresh=true triggers forceRefresh in store', async () => {
    const req = new NextRequest('http://localhost:3000/api/leads?refresh=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getLeadsStateMock).toHaveBeenCalledWith(true);
  });

  it('PATCH /api/leads successfully updates lead status', async () => {
    const req = new NextRequest('http://localhost:3000/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '2524957763', status: 'invalid_status' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
