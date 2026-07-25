import Link from "next/link";
import { analyse } from "@/lib/cpic/match";
import { cpicMeta } from "@/lib/cpic/data";
import { DEMO_PATIENT } from "@/lib/demo/patient";
import { PrintButton } from "@/components/PrintButton";
import { classificationLabel, populationClinical } from "@/lib/present";
import type { Finding } from "@/lib/cpic/types";

export const metadata = {
  title: "Physician brief · Beacon",
};

/**
 * The physician-facing artifact.
 *
 * Designed against an eight-minute appointment: one page, no scrolling, no
 * prose the reader has to parse for meaning. Actionable findings sit at the
 * top in a fixed-column table so the eye can run down the action column alone;
 * the full panel and provenance sit below the fold of attention, present for
 * anyone who wants to check the work.
 */
export default function ClinicalBriefPage() {
  const patient = DEMO_PATIENT;
  const result = analyse({
    genotypes: patient.genotypes,
    medications: patient.medications,
  });

  const actionable = result.findings.filter(
    (f) => f.severity === "high" || f.severity === "caution",
  );
  const routine = result.findings.filter(
    (f) => f.severity !== "high" && f.severity !== "caution",
  );

  return (
    <main className="mx-auto w-full max-w-[820px] flex-1 px-6 py-6 text-[13px] leading-snug">
      {/* Screen-only controls */}
      <div className="no-print mb-5 flex items-center gap-3">
        <Link
          href="/report"
          className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:border-foreground/30"
        >
          ← Patient view
        </Link>
        <PrintButton />
        <span className="ml-auto text-xs text-faint">Formatted for A4 · one page</span>
      </div>

      {/* Masthead */}
      <header className="border-b-2 border-foreground pb-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="display text-[1.25rem] tracking-normal">
            Pharmacogenomic Brief
          </h1>
          <span className="text-[11px] text-muted">
            Generated {new Date().toISOString().slice(0, 10)} · Beacon
          </span>
        </div>
      </header>

      {/* Patient block */}
      <section className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 border-b border-border py-2.5 text-[12px]">
        <span className="font-semibold">Patient</span>
        <span>
          {patient.name} · {patient.age}y · {patient.sex}
        </span>
        <span className="font-semibold">Indication</span>
        <span>{patient.clinicalContext}</span>
        <span className="font-semibold">Source</span>
        <span>
          {patient.reportVendor}, reported {patient.reportDate}
        </span>
        <span className="font-semibold">Reviewed</span>
        <span>
          {result.summary.medicationsReviewed} medications against{" "}
          {result.summary.genesTyped} gene results
        </span>
      </section>

      {/* Actionable findings */}
      <section className="mt-4">
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider">
          Actionable findings ({actionable.length})
        </h2>
        {/* The brief is designed for A4 and its columns do not usefully reflow.
            On a narrow screen the table scrolls within its own container rather
            than pushing the whole page sideways; print is unaffected. */}
        <div className="-mx-6 overflow-x-auto px-6 print:mx-0 print:overflow-visible print:px-0">
        <table className="w-full min-w-[560px] border-collapse print:min-w-0">
          <thead>
            <tr className="border-y border-border-strong text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="py-1 pr-3 font-semibold">Drug</th>
              <th className="py-1 pr-3 font-semibold">Genotype</th>
              <th className="py-1 pr-3 font-semibold">Phenotype</th>
              <th className="py-1 font-semibold">CPIC recommendation</th>
            </tr>
          </thead>
          <tbody>
            {actionable.map((f) => (
              <ClinicalRow key={`${f.drugId}-${f.genotypes.map((g) => g.gene).join()}`} finding={f} />
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* Routine + no-finding drugs, compressed to a single line each */}
      {(routine.length > 0 ||
        result.medicationsWithoutFindings.length > 0 ||
        result.unmatchedMedications.length > 0) && (
        <section className="mt-4">
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider">
            No action indicated
          </h2>
          <p className="text-[12px] leading-relaxed text-foreground/80">
            {[
              ...routine.map(
                (f) => `${f.drugName} (${f.genotypes.map((g) => g.gene).join("/")}: standard dosing)`,
              ),
              ...result.medicationsWithoutFindings.map(
                (m) => `${m.drugName} (no guideline for this genotype)`,
              ),
              ...result.unmatchedMedications.map((m) => `${m} (no CPIC guideline)`),
            ].join(" · ")}
          </p>
        </section>
      )}

      {/* Full panel */}
      <section className="mt-4">
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider">
          Full panel ({result.genotypes.length} genes)
        </h2>
        {/* Single column on a phone: at two columns the gene, diplotype and
            phenotype cannot share a row without spilling. A4 is wide enough for
            three, which is what print gets. */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 text-[12px] sm:grid-cols-3">
          {result.genotypes.map((g) => (
            <div key={g.gene} className="flex items-baseline gap-1.5">
              <span className="notation font-semibold">{g.gene}</span>
              <span className="notation">{g.diplotype}</span>
              <span className="ml-auto text-right text-muted">{g.phenotype}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Provenance */}
      <footer className="mt-5 border-t border-border pt-2.5 text-[10px] leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-foreground/80">Method.</span> Diplotypes
          mapped to phenotypes using CPIC lookup tables, then matched to CPIC prescribing
          recommendations by a deterministic rules engine. Recommendation and implication
          text is reproduced verbatim; no generative model authors, edits or ranks clinical
          content. Recommendations requiring genes absent from this panel are not shown.
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground/80">Dataset.</span>{" "}
          CPIC {cpicMeta.counts.recommendations.toLocaleString()} recommendations ·{" "}
          {cpicMeta.counts.guidelines} guidelines · retrieved{" "}
          {String(cpicMeta.seededAt).slice(0, 10)}. Full guideline text at cpicpgx.org.
        </p>
        <p className="mt-1 font-semibold text-foreground/80">
          Demonstration prototype on synthetic data. Not a medical device. Not medical
          advice, diagnosis or treatment. Clinical decisions remain the responsibility of
          the treating clinician.
        </p>
      </footer>
    </main>
  );
}

function ClinicalRow({ finding }: { finding: Finding }) {
  const pop = populationClinical(finding.population);
  return (
    <tr className="border-b border-border align-top break-inside-avoid">
      <td className="py-1.5 pr-3 font-semibold capitalize">{finding.drugName}</td>
      <td className="notation py-1.5 pr-3 whitespace-nowrap">
        {finding.genotypes.map((g) => (
          <div key={g.gene}>
            {g.gene} {g.diplotype}
          </div>
        ))}
      </td>
      <td className="py-1.5 pr-3">
        {finding.genotypes.map((g) => (
          <div key={g.gene}>{g.phenotype}</div>
        ))}
      </td>
      <td className="py-1.5">
        <span
          className={
            finding.severity === "high"
              ? "font-semibold text-[var(--high)]"
              : "font-medium text-[var(--caution)]"
          }
        >
          {finding.recommendation}
        </span>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
          {classificationLabel(finding.classification)}
          {pop && <> · {pop}</>}
          {finding.guideline && <> · {finding.guideline.name}</>}
        </div>
      </td>
    </tr>
  );
}
