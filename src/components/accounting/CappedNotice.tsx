// Shown when a section read more rows than the read cap (lib/supabase/paged.ts):
// the totals below leave some out, so they are not to be trusted as complete.
export default function CappedNotice({ what }: { what: string }) {
  return (
    <p role="alert" className="rounded-xl border border-[#d49a89] bg-[#fdf5f3] px-4 py-3 text-sm text-[#9a2a1f]">
      There are more {what} in this period than this screen reads at once, so these totals leave some out. Pick a shorter period to see it all.
    </p>
  );
}
