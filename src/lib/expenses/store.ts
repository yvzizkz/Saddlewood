import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  AccountingDashboardState,
  ExpenseCategory,
  ExpenseItem,
  WeeklyLaborSummary,
  WeeklyPurchasesSummary,
} from './types';

const ACCOUNTING_STATE_ID = 'accounting-state';
const LOCAL_BOT_STATE_PATH = '/Users/landos/dev/Saddlewood-KB/bot/accounting_state.json';

const DEFAULT_ACTIVE_PROJECTS = [
  'Powell Residence',
  'A Finer Touch (AFT)',
  'North Lane',
  '6602 N 40th St',
  '24417 N 120th Pl',
  'General / Overhead',
];

const INITIAL_EXPENSES: ExpenseItem[] = [
  {
    id: 'z-1',
    n: 1,
    source: 'zelle',
    direction: 'out',
    date: '2026-09-21',
    amount: 4700.0,
    recipient: 'Steve Knisely',
    memo: 'truck / transport',
    transactionId: '25497567655',
    status: 'pending',
    project: null,
    expenseType: null,
    decidedBy: null,
    decidedAt: null,
    clearedVia: null,
    notes: 'Chase Zelle disbursement',
    createdAt: '2026-09-21T21:10:00Z',
  },
  {
    id: 'z-2',
    n: 2,
    source: 'zelle',
    direction: 'out',
    date: '2026-09-21',
    amount: 2450.0,
    recipient: 'Billy Boy',
    memo: 'framing assist',
    transactionId: '25497567891',
    status: 'pending',
    project: null,
    expenseType: null,
    decidedBy: null,
    decidedAt: null,
    clearedVia: null,
    notes: 'Chase Zelle disbursement',
    createdAt: '2026-09-21T22:20:00Z',
  },
  {
    id: 'z-3',
    n: 3,
    source: 'zelle',
    direction: 'out',
    date: '2026-09-20',
    amount: 3800.0,
    recipient: 'Manuel Aj Stucco',
    memo: 'exterior patch labor',
    transactionId: '25497567112',
    status: 'pending',
    project: null,
    expenseType: null,
    decidedBy: null,
    decidedAt: null,
    clearedVia: null,
    notes: 'Subcontractor payment',
    createdAt: '2026-09-20T16:15:00Z',
  },
  {
    id: 'z-4',
    n: 4,
    source: 'zelle',
    direction: 'out',
    date: '2026-09-18',
    amount: 1650.0,
    recipient: 'Aidan Glass',
    memo: 'shower enclosure hardware',
    transactionId: '25497566840',
    status: 'pending',
    project: null,
    expenseType: null,
    decidedBy: null,
    decidedAt: null,
    clearedVia: null,
    notes: 'Materials & install',
    createdAt: '2026-09-18T14:30:00Z',
  },
  {
    id: 'z-5',
    n: 5,
    source: 'zelle',
    direction: 'out',
    date: '2026-09-15',
    amount: 980.0,
    recipient: 'Valentin Container',
    memo: 'jobsite dumpster swap',
    transactionId: '25497565902',
    status: 'pending',
    project: null,
    expenseType: null,
    decidedBy: null,
    decidedAt: null,
    clearedVia: null,
    notes: 'Waste & debris haul',
    createdAt: '2026-09-15T11:00:00Z',
  },
];

const INITIAL_PURCHASES: WeeklyPurchasesSummary = {
  totalSpend: 11485.42,
  count: 14,
  byProject: {
    'Powell Residence': {
      total: 5820.65,
      count: 6,
      items: [
        {
          id: 'hd-1',
          date: '2026-09-24',
          vendor: 'The Home Depot (Store #0472)',
          description: 'Drywall 5/8 Type X 4x8, joint compound, paper tape',
          amount: 1420.5,
          project: 'Powell Residence',
          category: 'Drywall & Materials',
        },
        {
          id: 'hd-2',
          date: '2026-09-22',
          vendor: 'The Home Depot (Store #0472)',
          description: 'Lutron Maestro LED+ dimmers & companion switches',
          amount: 1166.67,
          project: 'Powell Residence',
          category: 'Electrical & Lighting',
        },
        {
          id: 'hd-3',
          date: '2026-09-21',
          vendor: 'The Home Depot (Store #0472)',
          description: '20 ft x 100 ft 6 mil plastic sheeting & tape',
          amount: 278.0,
          project: 'Powell Residence',
          category: 'Protection & Consumables',
        },
        {
          id: 'vr-1',
          date: '2026-09-20',
          vendor: 'Central Arizona Supply',
          description: 'Rough plumbing fittings, valves, PEX-A',
          amount: 2955.48,
          project: 'Powell Residence',
          category: 'Plumbing Fixtures',
        },
      ],
    },
    'North Lane': {
      total: 3410.22,
      count: 4,
      items: [
        {
          id: 'fd-1',
          date: '2026-09-23',
          vendor: 'Floor & Decor',
          description: 'Porcelain tile 24x48, thinset, leveling clips',
          amount: 2840.5,
          project: 'North Lane',
          category: 'Tile & Flooring',
        },
        {
          id: 'lw-1',
          date: '2026-09-21',
          vendor: "Lowe's",
          description: 'Schluter Ditra underlayment & waterproof membrane',
          amount: 569.72,
          project: 'North Lane',
          category: 'Waterproofing',
        },
      ],
    },
    'A Finer Touch (AFT)': {
      total: 2254.55,
      count: 4,
      items: [
        {
          id: 'hd-4',
          date: '2026-09-24',
          vendor: 'The Home Depot (Store #0411)',
          description: 'Steel studs 3-5/8 20ga, track, self-drilling screws',
          amount: 1840.25,
          project: 'A Finer Touch (AFT)',
          category: 'Steel Framing',
        },
        {
          id: 'hd-5',
          date: '2026-09-22',
          vendor: 'The Home Depot (Store #0411)',
          description: 'Fasteners, acoustic sealant, safety equipment',
          amount: 414.3,
          project: 'A Finer Touch (AFT)',
          category: 'Hardware & Fasteners',
        },
      ],
    },
  },
};

const INITIAL_LABOR: WeeklyLaborSummary = {
  totalHours: 346.5,
  byProject: {
    'Powell Residence': {
      project: 'Powell Residence',
      totalHours: 154.0,
      employees: [
        { name: 'Marco Ochoa', regularHours: 40.0, overtimeHours: 6.5, totalHours: 46.5 },
        { name: 'Refugio G.', regularHours: 40.0, overtimeHours: 4.0, totalHours: 44.0 },
        { name: 'Jose Martinez', regularHours: 38.0, overtimeHours: 0.0, totalHours: 38.0 },
        { name: 'Billy Boy', regularHours: 25.5, overtimeHours: 0.0, totalHours: 25.5 },
      ],
    },
    'A Finer Touch (AFT)': {
      project: 'A Finer Touch (AFT)',
      totalHours: 118.0,
      employees: [
        { name: 'Carlos H.', regularHours: 40.0, overtimeHours: 2.0, totalHours: 42.0 },
        { name: 'Tony Lopez', regularHours: 40.0, overtimeHours: 0.0, totalHours: 40.0 },
        { name: 'Gerardo M.', regularHours: 36.0, overtimeHours: 0.0, totalHours: 36.0 },
      ],
    },
    'North Lane': {
      project: 'North Lane',
      totalHours: 74.5,
      employees: [
        { name: 'David Lopez', regularHours: 40.0, overtimeHours: 0.0, totalHours: 40.0 },
        { name: 'Victor Flores', regularHours: 34.5, overtimeHours: 0.0, totalHours: 34.5 },
      ],
    },
  },
};

function readLocalBotState(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(LOCAL_BOT_STATE_PATH)) {
      const raw = fs.readFileSync(LOCAL_BOT_STATE_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // Ignore read errors from sandbox/prod
  }
  return null;
}

function writeLocalBotState(data: Record<string, unknown>) {
  try {
    if (fs.existsSync(path.dirname(LOCAL_BOT_STATE_PATH))) {
      fs.writeFileSync(LOCAL_BOT_STATE_PATH, JSON.stringify(data, null, 1), 'utf8');
    }
  } catch {
    // Ignore write errors in cloud environments
  }
}

export async function getAccountingState(): Promise<AccountingDashboardState> {
  const db = getSupabaseAdmin();
  let state: Partial<AccountingDashboardState> = {};

  try {
    const { data } = await db
      .from('progress_trackers')
      .select('state')
      .eq('id', ACCOUNTING_STATE_ID)
      .maybeSingle();

    if (data && data.state && typeof data.state === 'object') {
      state = data.state as Partial<AccountingDashboardState>;
    }
  } catch (err) {
    console.error('Supabase getAccountingState read error:', err);
  }

  // Check local bot state for any Zelle updates
  const localBot = readLocalBotState();
  let localZelle: ExpenseItem[] = [];
  if (localBot && Array.isArray(localBot.zelle_transactions)) {
    localZelle = localBot.zelle_transactions as ExpenseItem[];
  }

  let expenses: ExpenseItem[] = state.expenses || [];
  if (expenses.length === 0) {
    expenses = localZelle.length > 0 ? localZelle : INITIAL_EXPENSES;
  } else if (localZelle.length > 0) {
    // Merge local bot Zelle items
    const existingIds = new Set(expenses.map((e) => e.id || `z-${e.n}`));
    for (const z of localZelle) {
      const zKey = z.id || `z-${z.n}`;
      if (!existingIds.has(zKey)) {
        expenses.push(z);
      }
    }
  }

  const weeklyPurchases = state.weeklyPurchases || INITIAL_PURCHASES;
  const weeklyLabor = state.weeklyLabor || INITIAL_LABOR;
  const activeProjects = state.activeProjects || DEFAULT_ACTIVE_PROJECTS;

  return {
    expenses,
    weeklyPurchases,
    weeklyLabor,
    activeProjects,
    lastUpdated: state.lastUpdated || new Date().toISOString(),
  };
}

export async function saveAccountingState(
  state: AccountingDashboardState,
  actor: string
): Promise<AccountingDashboardState> {
  const db = getSupabaseAdmin();
  state.lastUpdated = new Date().toISOString();

  // Save to Supabase
  try {
    await db.from('progress_trackers').upsert({
      id: ACCOUNTING_STATE_ID,
      project_name: 'Accounting & Expenses',
      invoice_number: 'live',
      state: state as unknown as Record<string, unknown>,
      updated_by: actor,
    });
  } catch (err) {
    console.error('Supabase saveAccountingState upsert error:', err);
  }

  // Sync to local bot state if on local machine
  const localBot = readLocalBotState() || {};
  localBot.zelle_transactions = state.expenses;
  localBot.last_expense_update = state.lastUpdated;
  localBot.updated_by = actor;
  writeLocalBotState(localBot);

  return state;
}

export async function categorizeExpense(
  idOrN: string | number,
  project: string,
  expenseType: string,
  decidedBy: string,
  clearedVia: 'portal' | 'text' | 'email' = 'portal'
): Promise<ExpenseItem | null> {
  const state = await getAccountingState();
  const searchN = typeof idOrN === 'number' ? idOrN : parseInt(String(idOrN).replace(/\D/g, ''), 10);
  const searchId = String(idOrN).trim().toLowerCase();

  const item = state.expenses.find(
    (e) => e.id.toLowerCase() === searchId || (searchN && e.n === searchN)
  );

  if (!item) return null;

  item.status = 'categorized';
  item.project = project;
  item.expenseType = expenseType;
  item.decidedBy = decidedBy;
  item.decidedAt = new Date().toISOString();
  item.clearedVia = clearedVia;

  if (project && !state.activeProjects.includes(project)) {
    state.activeProjects.push(project);
  }

  await saveAccountingState(state, decidedBy);
  return item;
}

export async function dismissExpense(
  idOrN: string | number,
  decidedBy: string,
  clearedVia: 'portal' | 'text' | 'email' = 'portal'
): Promise<ExpenseItem | null> {
  const state = await getAccountingState();
  const searchN = typeof idOrN === 'number' ? idOrN : parseInt(String(idOrN).replace(/\D/g, ''), 10);
  const searchId = String(idOrN).trim().toLowerCase();

  const item = state.expenses.find(
    (e) => e.id.toLowerCase() === searchId || (searchN && e.n === searchN)
  );

  if (!item) return null;

  item.status = 'dismissed';
  item.decidedBy = decidedBy;
  item.decidedAt = new Date().toISOString();
  item.clearedVia = clearedVia;

  await saveAccountingState(state, decidedBy);
  return item;
}

export async function addExpense(
  expense: Partial<ExpenseItem> & Omit<ExpenseItem, 'id' | 'n' | 'createdAt'>,
  actor: string
): Promise<ExpenseItem> {
  const state = await getAccountingState();
  const maxN = state.expenses.reduce((m, e) => Math.max(m, e.n || 0), 0);
  const n = maxN + 1;
  const prefix = expense.source === 'receipt' ? 'r' : 'z';
  const newItem: ExpenseItem = {
    ...expense,
    id: expense.id || `${prefix}-${n}`,
    n,
    createdAt: new Date().toISOString(),
  };

  state.expenses.unshift(newItem);
  await saveAccountingState(state, actor);
  return newItem;
}
