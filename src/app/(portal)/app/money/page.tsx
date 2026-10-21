import { redirect } from "next/navigation";

// Money was the first owners' screen for who owes what. Its open invoices are
// now Accounting › Receivables (same reader, with aging and the proof record),
// its purchase search lives on Accounting › Purchases, and Bill sits on
// Billing. The old address keeps working for links and notifications.
export default function MoneyScreen() {
  redirect("/app/accounting/receivables");
}
