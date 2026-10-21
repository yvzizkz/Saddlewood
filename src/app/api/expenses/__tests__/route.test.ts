import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { listExpenses, categorizeExpense, dismissExpense, addExpense } = vi.hoisted(() => ({
  listExpenses: vi.fn(),
  categorizeExpense: vi.fn(),
  dismissExpense: vi.fn(),
  addExpense: vi.fn(),
}));

vi.mock('@/lib/expenses/store', () => ({ listExpenses, categorizeExpense, dismissExpense, addExpense }));

// No session in tests: the server client reports no user.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { GET, POST } from '../route';

const TOKEN = 'test-token-with-enough-length-1234';
const ITEM = { id: 'z-1', n: 1, source: 'zelle', status: 'pending', amount: 4700 };

function post(body: unknown) {
  return new NextRequest('http://localhost:3000/api/expenses', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-Ops-Actor': 'marco' },
    body: JSON.stringify(body),
  });
}

describe('/api/expenses: the bot writes to the spend ledger', () => {
  beforeEach(() => {
    vi.stubEnv('OPS_AGENT_TOKEN', TOKEN);
    for (const m of [listExpenses, categorizeExpense, dismissExpense, addExpense]) m.mockReset();
    listExpenses.mockResolvedValue([ITEM]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized requests', async () => {
    expect((await GET(new NextRequest('http://localhost:3000/api/expenses'))).status).toBe(401);
    expect((await POST(new NextRequest('http://localhost:3000/api/expenses', { method: 'POST', body: '{}' }))).status).toBe(401);
  });

  it('lists the items from the ledger', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/expenses', { headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expenses: [ITEM] });
  });

  it('categorizes by number, as accounting.py sends it', async () => {
    categorizeExpense.mockResolvedValue({ ...ITEM, status: 'categorized', project: 'Powell' });
    const res = await POST(post({ action: 'categorize', n: 1, project: 'Powell', expenseType: 'Materials', via: 'text' }));
    expect(res.status).toBe(200);
    expect((await res.json()).item.project).toBe('Powell');
    expect(categorizeExpense).toHaveBeenCalledWith(1, 'Powell', 'Materials', expect.any(String));
  });

  it('needs a project and a type to categorize, and says when the item is unknown', async () => {
    expect((await POST(post({ action: 'categorize', n: 1, project: ' ', expenseType: 'Materials' }))).status).toBe(400);
    expect(categorizeExpense).not.toHaveBeenCalled();
    categorizeExpense.mockResolvedValue(null);
    expect((await POST(post({ action: 'categorize', n: 99, project: 'Powell', expenseType: 'Materials' }))).status).toBe(404);
  });

  it('dismisses', async () => {
    dismissExpense.mockResolvedValue({ ...ITEM, status: 'dismissed' });
    const res = await POST(post({ action: 'dismiss', n: 2, via: 'text' }));
    expect(res.status).toBe(200);
    expect((await res.json()).item.status).toBe('dismissed');
    dismissExpense.mockResolvedValue(null);
    expect((await POST(post({ action: 'dismiss', n: 99 }))).status).toBe(404);
  });

  it('adds a whole item (201), takes a resend (200), and refuses a bare number (422)', async () => {
    addExpense.mockResolvedValueOnce({ ok: true, item: ITEM, created: true });
    expect((await POST(post({ action: 'add', expense: ITEM }))).status).toBe(201);
    addExpense.mockResolvedValueOnce({ ok: true, item: ITEM, created: false });
    expect((await POST(post({ action: 'add', expense: ITEM }))).status).toBe(200);
    addExpense.mockResolvedValueOnce({ ok: false, error: 'send the whole expense item, not only its number' });
    const bare = await POST(post({ action: 'add', n: 12 }));
    expect(bare.status).toBe(422);
    expect((await bare.json()).error).toMatch(/whole expense item/);
  });

  it('says what failed when the database does', async () => {
    dismissExpense.mockRejectedValue(new Error('purchases update failed: boom'));
    const res = await POST(post({ action: 'dismiss', n: 2 }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/boom/);
  });

  it('refuses an unknown action', async () => {
    expect((await POST(post({ action: 'explode' }))).status).toBe(400);
  });
});
