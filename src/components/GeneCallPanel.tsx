import type { RawFileResult } from "@/lib/genotype/call";

/**
 * What we read out of a raw array file, and — as importantly — what we could
 * not.
 *
 * Consumer genomics has a habit of presenting an array result as though it were
 * a sequencing result. An array cannot see copy-number variation, so a "normal"
 * CYP2D6 from a chip is not the same claim as a normal CYP2D6 from a lab. Every
 * gene here carries its marker coverage, and anything uncallable is listed
 * rather than quietly omitted.
 */
export function GeneCallPanel({ data }: { data: RawFileResult }) {
  const called = data.calls.filter((c) => c.status === "called");
  const uncallable = data.calls.filter((c) => c.status !== "called");
  const limitations = data.calls.filter((c) => c.limitation);

  const source =
    data.format === "23andme"
      ? "23andMe"
      : data.format === "ancestrydna"
        ? "AncestryDNA"
        : "raw array";

  return (
    /* Tinted rather than white. Everything in this panel is provenance — where
       the data came from and what could not be read — which is a different kind
       of information from the findings, and should not compete with them. */
    <div className="overflow-hidden rounded-xl border border-border bg-accent-tint">
      <div className="border-b border-border bg-accent-soft px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">
          Read from your {source} file
        </p>
        <p className="mt-1 text-sm text-muted">
          {data.totalRows.toLocaleString()} markers scanned on your device.{" "}
          <span className="font-medium text-foreground/75">
            {data.matchedRows} were relevant — only those were sent.
          </span>{" "}
          Your genome never left this browser.
        </p>
      </div>

      <div className="divide-y divide-border">
        {called.map((c) => (
          <div key={c.gene} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
            <span className="notation text-sm font-semibold">{c.gene}</span>
            <span className="notation text-sm">{c.diplotype}</span>
            <span className="ml-auto text-xs text-muted">
              {c.covered}/{c.required} markers
              {c.partial && (
                <span className="ml-2 text-[var(--caution)]">partial coverage</span>
              )}
            </span>
          </div>
        ))}

        {uncallable.map((c) => (
          <div key={c.gene} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
            <span className="notation text-sm font-semibold text-muted">{c.gene}</span>
            <span className="text-sm text-muted">not called</span>
            <span className="ml-auto max-w-[60%] text-right text-xs text-faint">
              {c.reason}
            </span>
          </div>
        ))}
      </div>

      {limitations.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">
            What a chip cannot tell you
          </p>
          <ul className="mt-1.5 space-y-1">
            {limitations.map((c) => (
              <li key={c.gene} className="text-xs leading-relaxed text-muted">
                <span className="notation font-medium">{c.gene}</span> — {c.limitation}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
