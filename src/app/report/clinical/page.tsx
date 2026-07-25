import Link from "next/link";
import { analyse } from "@/lib/cpic/match";
import { cpicMeta } from "@/lib/cpic/data";
import { DEMO_PATIENT } from "@/lib/demo/patient";
import { PrintButton } from "@/components/PrintButton";
import { ClinicalBrief } from "@/components/ClinicalBrief";

export const metadata = {
  title: "Physician brief · Beacon",
};

/**
 * The worked example's brief, server-rendered from committed data.
 *
 * Kept as its own route so there is always a physician brief reachable by URL
 * alone — no API key, no upload, no client state. The live upload flow renders
 * the same component from whatever was actually analysed.
 */
export default function ClinicalBriefPage() {
  const patient = DEMO_PATIENT;
  const result = analyse({
    genotypes: patient.genotypes,
    medications: patient.medications,
  });

  return (
    <main className="mx-auto w-full max-w-[820px] flex-1 px-6 py-6 text-[13px] leading-snug">
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

      <ClinicalBrief
        result={result}
        subject={{
          name: `${patient.name} · ${patient.age}y · ${patient.sex}`,
          indication: patient.clinicalContext,
          source: `${patient.reportVendor}, reported ${patient.reportDate}`,
        }}
        meta={{ ...cpicMeta.counts, seededAt: cpicMeta.seededAt }}
        generatedOn={new Date().toISOString().slice(0, 10)}
      />
    </main>
  );
}
