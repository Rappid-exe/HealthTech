/**
 * The trust footer. Present on every result view, because the product's central
 * claim — that no model authored the clinical content — is only worth anything
 * if it is stated where the clinical content is.
 *
 * Takes the dataset figures as props rather than importing them. The CPIC data
 * module pulls in ~3.4 MB of JSON, and this component renders inside a client
 * island on the upload flow.
 */

export interface DatasetMeta {
  recommendations: number;
  drugs: number;
  genes: number;
  guidelines: number;
  seededAt: string;
}

export function ProvenanceFooter({
  meta,
  synthetic = false,
}: {
  meta: DatasetMeta;
  synthetic?: boolean;
}) {
  return (
    <footer className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-muted">
      <p>
        Every recommendation on this page is reproduced verbatim from the Clinical
        Pharmacogenetics Implementation Consortium (CPIC), matched to this genotype by a
        deterministic rules engine. A language model reads the report; it does not write,
        edit or rank the clinical content.
      </p>
      <p className="mt-2">
        Dataset: {meta.recommendations.toLocaleString()} recommendations · {meta.drugs} drugs
        · {meta.genes} genes · {meta.guidelines} guidelines, retrieved{" "}
        {meta.seededAt.slice(0, 10)}.
        {synthetic && " Synthetic patient data."}
      </p>
      <p className="mt-2 font-medium text-foreground/70">
        Beacon is a demonstration prototype. It is not medical advice, diagnosis or
        treatment. Never change a prescribed medicine without speaking to your doctor or
        pharmacist.
      </p>
    </footer>
  );
}
