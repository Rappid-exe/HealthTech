import Link from "next/link";
import { analyse } from "@/lib/cpic/match";
import { cpicMeta } from "@/lib/cpic/data";
import { DEMO_PATIENT } from "@/lib/demo/patient";
import { ReportView } from "@/components/ReportView";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "Your medication review · Beacon",
};

/**
 * The demo report, rendered on the server from the synthetic patient.
 *
 * Deliberately independent of the upload path: it needs no API key, no network,
 * and no model call, so there is always a working artifact to show even if the
 * live pipeline is having a bad day.
 */
export default function ReportPage() {
  const patient = DEMO_PATIENT;
  const result = analyse({
    genotypes: patient.genotypes,
    medications: patient.medications,
  });

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
        <ReportView
          result={result}
          header={{
            name: patient.name,
            subtitle: `${patient.age} · Panel reported ${patient.reportDate}`,
            context: patient.clinicalContext,
          }}
          recommendationCount={cpicMeta.counts.recommendations}
        />
        <ProvenanceFooter
          meta={{ ...cpicMeta.counts, seededAt: cpicMeta.seededAt }}
          synthetic
        />
      </main>
    </>
  );
}
