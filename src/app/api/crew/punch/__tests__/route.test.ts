import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getCrewStateMock,
  getWorkerDailyStatusMock,
  recordPunchMock,
  verifyPunchTokenMock,
} = vi.hoisted(() => ({
  getCrewStateMock: vi.fn(),
  getWorkerDailyStatusMock: vi.fn(),
  recordPunchMock: vi.fn(),
  verifyPunchTokenMock: vi.fn(),
}));

vi.mock('@/lib/crew/store', () => ({
  getCrewState: getCrewStateMock,
  getWorkerDailyStatus: getWorkerDailyStatusMock,
  recordPunch: recordPunchMock,
  verifyPunchToken: verifyPunchTokenMock,
}));

import { GET, POST } from '../route';

describe('Crew Punch API Routes', () => {
  beforeEach(() => {
    getCrewStateMock.mockReset();
    getWorkerDailyStatusMock.mockReset();
    recordPunchMock.mockReset();
    verifyPunchTokenMock.mockReset();

    getCrewStateMock.mockResolvedValue({
      workers: [
        { id: 'arnold', name: 'Arnold Mujica', phone: '+14805550142', role: 'Lead Framer', defaultProject: 'Powell Residence', active: true },
      ],
      jobsites: [
        { id: 'powell', name: 'Powell Residence', address: '6602 N 40th St', lat: 33.5332, lng: -111.9954, radiusMeters: 350, active: true },
      ],
      punches: [],
    });
  });

  it('GET /api/crew/punch returns overall crew status when no worker specified', async () => {
    const req = new NextRequest('http://localhost:3000/api/crew/punch');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.workers).toHaveLength(1);
    expect(body.jobsites).toHaveLength(1);
  });

  it('GET /api/crew/punch with token returns worker status and assigned site', async () => {
    verifyPunchTokenMock.mockReturnValue({ valid: true, workerId: 'arnold', date: '2026-09-27' });
    getWorkerDailyStatusMock.mockResolvedValue({
      worker: { id: 'arnold', name: 'Arnold Mujica' },
      assignedJobsite: { id: 'powell', name: 'Powell Residence' },
      status: 'clocked_out',
      activeShift: null,
      todayPunches: [],
      todayTotalHours: 0,
    });

    const req = new NextRequest('http://localhost:3000/api/crew/punch?t=valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.workerStatus.worker.name).toBe('Arnold Mujica');
    expect(body.workerStatus.status).toBe('clocked_out');
  });

  it('GET /api/crew/punch with invalid token returns 400', async () => {
    verifyPunchTokenMock.mockReturnValue({ valid: false });
    const req = new NextRequest('http://localhost:3000/api/crew/punch?t=bad-token');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Invalid or expired');
  });

  it('POST /api/crew/punch records clock_in with geofence calculation', async () => {
    verifyPunchTokenMock.mockReturnValue({ valid: true, workerId: 'arnold', date: '2026-09-27' });
    recordPunchMock.mockResolvedValue({
      punch: {
        id: 'punch-1',
        workerId: 'arnold',
        workerName: 'Arnold Mujica',
        action: 'clock_in',
        distanceMeters: 45,
        geofenceStatus: 'verified',
        timestamp: '2026-09-27T13:30:00Z',
      },
      workerStatus: {
        worker: { id: 'arnold', name: 'Arnold Mujica' },
        status: 'clocked_in',
        todayTotalHours: 0,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/crew/punch', {
      method: 'POST',
      body: JSON.stringify({
        token: 'valid-token',
        action: 'clock_in',
        lat: 33.5332,
        lng: -111.9954,
        accuracy: 10,
        notes: 'Ready for shear wall inspection',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.punch.action).toBe('clock_in');
    expect(body.punch.geofenceStatus).toBe('verified');
    expect(recordPunchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: 'arnold',
        action: 'clock_in',
        lat: 33.5332,
        lng: -111.9954,
      })
    );
  });

  it('POST /api/crew/punch rejects invalid action', async () => {
    verifyPunchTokenMock.mockReturnValue({ valid: true, workerId: 'arnold' });
    const req = new NextRequest('http://localhost:3000/api/crew/punch', {
      method: 'POST',
      body: JSON.stringify({
        token: 'valid-token',
        action: 'take_break',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Action must be');
  });
});
