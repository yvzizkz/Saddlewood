// The bot's expense item, as /api/expenses has always taken and returned it
// (KB accounting.py, receipt_ocr.py, crew.py). Stored as purchases lines (0053).

export type ExpenseSource = 'zelle' | 'receipt' | 'card' | 'manual';
export type ExpenseDirection = 'out' | 'in';
export type ExpenseStatus = 'pending' | 'categorized' | 'dismissed';

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
  expenseType: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  clearedVia: 'portal' | 'text' | 'email' | null;
  notes?: string | null;
  receiptUrl?: string | null;
  vendor?: string | null;
  createdAt: string;
};
