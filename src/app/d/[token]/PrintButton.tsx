"use client";

// The browser's own print dialog, which also offers "Save as PDF".
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
    >
      Print or save as PDF
    </button>
  );
}
