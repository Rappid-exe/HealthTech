"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:border-foreground/30"
    >
      Print / Save PDF
    </button>
  );
}
