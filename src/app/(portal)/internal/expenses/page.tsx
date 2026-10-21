import { redirect } from 'next/navigation'

// The old Expenses page moved into the one spend ledger (migration 0053):
// Zelle payments and receipts are purchases lines, tagged to a job under
// Purchases > Tag spend. Old bookmarks and the bot's links land there.
export default function ExpensesMoved() {
  redirect('/app/accounting/purchases#tag-spend')
}
