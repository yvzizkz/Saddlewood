export type ExpenseSource = 'zelle' | 'receipt' | 'card' | 'manual';
export type ExpenseDirection = 'out' | 'in';
export type ExpenseStatus = 'pending' | 'categorized' | 'dismissed';

export type ExpenseCategory =
  | 'Materials'
  | 'Subcontractor'
  | 'Labor'
  | 'Equipment & Tools'
  | 'Permits & Fees'
  | 'Fuel & Travel'
  | 'Office & Overhead'
  | 'Other';

export type ExpenseItem = {
  id: string;
  n: number; // e.g. 1 for Z1
  source: ExpenseSource;
  direction: ExpenseDirection;
  date: string; // YYYY-MM-DD
  amount: number;
  recipient: string;
  memo: string;
  transactionId?: string;
  status: ExpenseStatus;
  project: string | null;
  expenseType: ExpenseCategory | string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  clearedVia: 'portal' | 'text' | 'email' | null;
  notes?: string | null;
  receiptUrl?: string | null;
  vendor?: string | null;
  createdAt: string;
};

export type PurchaseLineItem = {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  project: string;
  category: string;
};

export type WeeklyPurchasesSummary = {
  totalSpend: number;
  count: number;
  byProject: Record<
    string,
    {
      total: number;
      count: number;
      items: PurchaseLineItem[];
    }
  >;
};

export type EmployeeLaborHours = {
  name: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
};

export type ProjectLaborSummary = {
  project: string;
  totalHours: number;
  employees: EmployeeLaborHours[];
};

export type WeeklyLaborSummary = {
  totalHours: number;
  byProject: Record<string, ProjectLaborSummary>;
};

export type AccountingDashboardState = {
  expenses: ExpenseItem[];
  weeklyPurchases: WeeklyPurchasesSummary;
  weeklyLabor: WeeklyLaborSummary;
  activeProjects: string[];
  lastUpdated: string;
};
