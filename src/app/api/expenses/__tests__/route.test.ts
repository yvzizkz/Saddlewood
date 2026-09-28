import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getAccountingStateMock,
  categorizeExpenseMock,
  dismissExpenseMock,
  addExpenseMock,
} = vi.hoisted(() => ({
  getAccountingStateMock: vi.fn(),
  categorizeExpenseMock: vi.fn(),
  dismissExpenseMock: vi.fn(),
  addExpenseMock: vi.fn(),
}));

vi.mock('@/lib/expenses/store', () => ({
  getAccountingState: getAccountingStateMock,
  categorizeExpense: categorizeExpenseMock,
  dismissExpense: dismissExpenseMock,
  addExpense: addExpenseMock,
}));

// No session in tests: the server client reports no user.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { GET, POST } from '../route';

const TOKEN = 'test-token-with-enough-length-1234';

describe('Expenses API Route', () => {
  beforeEach(() => {
    vi.stubEnv('OPS_AGENT_TOKEN', TOKEN);
    getAccountingStateMock.mockReset();
    categorizeExpenseMock.mockReset();
    dismissExpenseMock.mockReset();
    addExpenseMock.mockReset();

    getAccountingStateMock.mockResolvedValue({
      expenses: [
        {
          id: 'z-1',
          n: 1,
          source: 'zelle',
          direction: 'out',
          date: '2026-09-21',
          amount: 4700.0,
          recipient: 'Steve Knisely',
          memo: 'truck',
          status: 'pending',
          project: null,
          expenseType: null,
        },
      ],
      weeklyPurchases: { totalSpend: 5000, count: 5, byProject: {} },
      weeklyLabor: { totalHours: 120, byProject: {} },
      activeProjects: ['Powell Residence'],
      lastUpdated: '2026-09-21T00:00:00Z',
    });

    categorizeExpenseMock.mockImplementation(
      async (n: number | string, project: string, expenseType: string, actor: string, via: string) => ({
        id: 'z-1',
        n: 1,
        status: 'categorized',
        project,
        expenseType,
        decidedBy: actor,
        clearedVia: via,
      })
    );

    dismissExpenseMock.mockImplementation(async (n: number | string, actor: string, via: string) => ({
      id: 'z-2',
      n: 2,
      status: 'dismissed',
      decidedBy: actor,
      clearedVia: via,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('allows authorized token to fetch accounting state', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      headers: {
        authorization: `Bearer ${TOKEN}`,
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.expenses)).toBe(true);
    expect(data.weeklyPurchases).toBeDefined();
    expect(data.weeklyLabor).toBeDefined();
    expect(getAccountingStateMock).toHaveBeenCalled();
  });

  it('categorizes an expense via POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'categorize',
        n: 1,
        project: 'Powell Residence',
        expenseType: 'Materials',
        via: 'portal',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.item.status).toBe('categorized');
    expect(data.item.project).toBe('Powell Residence');
    expect(data.item.expenseType).toBe('Materials');
    expect(data.item.clearedVia).toBe('portal');
    expect(categorizeExpenseMock).toHaveBeenCalled();
  });

  it('dismisses an expense via POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'dismiss',
        n: 2,
        via: 'text',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.item.status).toBe('dismissed');
    expect(data.item.clearedVia).toBe('text');
    expect(dismissExpenseMock).toHaveBeenCalled();
  });
});
