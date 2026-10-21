// Shown where Payables would be when the bills tables (migration 0031) are not
// in this database yet: the page still renders, without bills.
export default function PayablesMissing() {
  return (
    <p role="status" className="rounded-xl border border-dashed border-[var(--color-stone-mid)] bg-[var(--color-cream)] px-4 py-3 text-sm text-[var(--color-charcoal-light)]">
      Payables isn&apos;t set up in this database yet (migration 0031 not applied). Bills and payments out will show here once it is.
    </p>
  );
}
