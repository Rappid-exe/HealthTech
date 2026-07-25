import type { AnalysisResult } from "@/lib/cpic/types";
import { FindingCard } from "@/components/FindingCard";
import { SEVERITY_UI } from "@/lib/present";

export interface ReportHeader {
  name: string;
  subtitle?: string;
  context?: string;
}

/**
 * The patient-facing dashboard.
 *
 * Pure presentation over an AnalysisResult, so the pre-computed demo report and
 * a freshly uploaded one render through exactly the same component. Two views of
 * the same findings that could drift apart would be a liability in a product
 * whose entire claim is that the clinical content is not invented.
 */
export function ReportView({
  result,
  header,
  recommendationCount,
}: {
  result: AnalysisResult;
  header: ReportHeader;
  recommendationCount: number;
}) {
  const { summary, findings } = result;
  const needsAttention = summary.high + summary.caution;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="display text-[1.9rem]">{header.name}</h1>
        {header.subtitle && <span className="text-sm text-muted">{header.subtitle}</span>}
      </div>
      {header.context && (
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{header.context}</p>
      )}

      <section
        className={`reveal mt-6 rounded-xl border ${
          summary.high > 0
            ? "border-[var(--high-border)] bg-[var(--high-surface)]"
            : "border-border bg-surface"
        } px-5 py-4`}
      >
        <p className="display text-balance text-[1.45rem] leading-snug sm:text-[1.7rem]">
          {needsAttention > 0 ? (
            <>
              {needsAttention} of your {summary.medicationsReviewed} medications{" "}
              {needsAttention === 1 ? "needs" : "need"} attention.
            </>
          ) : (
            <>No prescribing conflicts found in your current medications.</>
          )}
        </p>
        <p className="mt-1 text-sm text-muted">
          We checked {summary.medicationsReviewed} medications against {summary.genesTyped} of
          your gene results, using {recommendationCount.toLocaleString()} published
          prescribing recommendations.
        </p>

        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {(
            [
              ["high", summary.high],
              ["caution", summary.caution],
              ["standard", summary.standard],
            ] as const
          )
            .filter(([, n]) => n > 0)
            .map(([sev, n]) => (
              <span key={sev} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${SEVERITY_UI[sev].dot}`} aria-hidden />
                <span className="font-medium">{n}</span>
                <span className="text-muted">{SEVERITY_UI[sev].label.toLowerCase()}</span>
              </span>
            ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Findings</h2>
        <div className="mt-3 space-y-4">
          {findings.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted">
              No CPIC guideline applies to this combination of genes and medications.
            </p>
          ) : (
            findings.map((f, i) => (
              <div
                key={`${f.drugId}-${f.genotypes.map((g) => g.gene).join()}`}
                className="reveal"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <FindingCard finding={f} prominent={i === 0} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* Stated explicitly: a silent absence of findings is indistinguishable
          from a broken pipeline. */}
      {(result.medicationsWithoutFindings.length > 0 ||
        result.unmatchedMedications.length > 0) && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Also reviewed
          </h2>
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {result.medicationsWithoutFindings.map((m) => (
              <div key={m.raw} className="flex items-baseline gap-3 px-5 py-3">
                <span className="text-sm font-medium capitalize">{m.drugName}</span>
                <span className="ml-auto text-right text-xs text-muted">
                  No guideline applies to your genotype
                </span>
              </div>
            ))}
            {result.unmatchedMedications.map((m) => (
              <div key={m} className="flex items-baseline gap-3 px-5 py-3">
                <span className="text-sm font-medium">{m}</span>
                <span className="ml-auto text-right text-xs text-muted">
                  No pharmacogenomic guideline exists
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Your gene results
        </h2>
        <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {result.genotypes.map((g) => (
            <div key={g.gene} className="bg-surface px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="notation text-sm font-semibold">{g.gene}</span>
                <span className="notation text-sm text-muted">{g.diplotype}</span>
                {g.priority === "high" && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-[var(--high)]">
                    Atypical
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-foreground/85">{g.phenotype}</p>
            </div>
          ))}
        </div>
        {result.unresolvedGenotypes.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {result.unresolvedGenotypes.length} result
            {result.unresolvedGenotypes.length === 1 ? "" : "s"} could not be matched to a
            reference table:{" "}
            <span className="notation">
              {result.unresolvedGenotypes.map((g) => `${g.gene} ${g.diplotype}`).join(", ")}
            </span>
          </p>
        )}
      </section>
    </>
  );
}
