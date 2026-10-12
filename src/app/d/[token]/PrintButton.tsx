"use client";

// The browser's own print dialog, which also offers "Save as PDF".
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-teal px-3 py-1.5 text-sm font-medium text-off-white hover:bg-teal-dark"
    >
      Print or save as PDF
    </button>
  );
}
