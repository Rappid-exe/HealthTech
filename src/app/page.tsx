import { cpicMeta } from "@/lib/cpic/data";
import { DEMO_REPORT_TEXT } from "@/lib/demo/patient";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadFlow } from "@/components/UploadFlow";
import { DnaBackdrop } from "@/components/DnaBackdrop";

/**
 * Server component wrapper. The CPIC dataset and the sample report are read
 * here and handed to the client island as plain props, so the ~3.4 MB of
 * clinical JSON never reaches the browser bundle.
 */
export default function Home() {
  return (
    <>
      <DnaBackdrop />
      <SiteHeader />
      <main className="flex-1 pb-16">
        <UploadFlow
          demoReportText={DEMO_REPORT_TEXT}
          meta={{ ...cpicMeta.counts, seededAt: cpicMeta.seededAt }}
        />
      </main>
    </>
  );
}
