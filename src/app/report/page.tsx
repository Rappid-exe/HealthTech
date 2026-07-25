import Link from "next/link";
import { analyse } from "@/lib/cpic/match";
import { cpicMeta } from "@/lib/cpic/data";
import { DEMO_PATIENT } from "@/lib/demo/patient";
import { FindingCard } from "@/components/FindingCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SEVERITY_UI } from "@/lib/present";

export const metadata = {
  title: "Your medication review · Beacon",
};

export default function ReportPage() {
  const patient = DEMO_PATIENT;
  const result = analyse({
    genotypes: patient.genotypes,
    medications: patient.medications,
  });

  const { summary, findings } = result;
  const needsAttention = summary.high + summary.caution;

  return (
    <>
      <SiteHeader
        action={
          <Link
            href="/report/clinical"
            className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:border-foreground/30"
          >
            Physician brief →
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {/* Patient strip */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{patient.name}</h1>
          <span className="text-sm text-muted">
            {patient.age} · Panel reported {patient.reportDate}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          {patient.clinicalContext}
        </p>

        {/* Headline */}
        <section
          className={`mt-6 rounded-xl border ${
            summary.high > 0
              ? "border-[var(--high-border)] bg-[var(--high-surface)]"
              : "border-border bg-surface"
          } px-5 py-4`}
        >
          <p className="text-lg font-semibold leading-snug">
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
            We checked {summary.medicationsReviewed} medications against{" "}
            {summary.genesTyped} of your gene results, using{" "}
            {cpicMeta.counts.recommendations.toLocaleString()} published prescribing
            recommendations.
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
                  <span
                    className={`h-2 w-2 rounded-full ${SEVERITY_UI[sev].dot}`}
                    aria-hidden
                  />
                  <span className="font-medium">{n}</span>
                  <span className="text-muted">{SEVERITY_UI[sev].label.toLowerCase()}</span>
                </span>
              ))}
          </div>
        </section>

        {/* Findings */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Findings
          </h2>
          <div className="mt-3 space-y-4">
            {findings.map((f) => (
              <FindingCard key={`${f.drugId}-${f.genotypes.map((g) => g.gene).join()}`} finding={f} />
            ))}
          </div>
        </section>

        {/* Everything we checked and cleared, stated explicitly. A silent
            absence of findings is indistinguishable from a broken pipeline. */}
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
                  <span className="ml-auto text-xs text-muted">
                    No guideline applies to your genotype
                  </span>
                </div>
              ))}
              {result.unmatchedMedications.map((m) => (
                <div key={m} className="flex items-baseline gap-3 px-5 py-3">
                  <span className="text-sm font-medium">{m}</span>
                  <span className="ml-auto text-xs text-muted">
                    No pharmacogenomic guideline exists
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gene panel */}
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
              {result.unresolvedGenotypes.length === 1 ? "" : "s"} could not be matched to
              a reference table:{" "}
              <span className="notation">
                {result.unresolvedGenotypes.map((g) => `${g.gene} ${g.diplotype}`).join(", ")}
              </span>
            </p>
          )}
        </section>

        {/* Provenance */}
        <footer className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-muted">
          <p>
            Every recommendation on this page is reproduced verbatim from the Clinical
            Pharmacogenetics Implementation Consortium (CPIC), matched to this genotype by
            a deterministic rules engine. No language model writes, edits or ranks the
            clinical content.
          </p>
          <p className="mt-2">
            Dataset: {cpicMeta.counts.recommendations.toLocaleString()} recommendations ·{" "}
            {cpicMeta.counts.drugs} drugs · {cpicMeta.counts.genes} genes ·{" "}
            {cpicMeta.counts.guidelines} guidelines. Synthetic patient data.
          </p>
          <p className="mt-2 font-medium text-foreground/70">
            Beacon is a demonstration prototype. It is not medical advice, diagnosis or
            treatment. Never change a prescribed medicine without speaking to your
            doctor or pharmacist.
          </p>
        </footer>
      </main>
    </>
  );
}
