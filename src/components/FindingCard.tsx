import type { Finding } from "@/lib/cpic/types";
import {
  SEVERITY_UI,
  classificationLabel,
  populationLabel,
} from "@/lib/present";

/**
 * A single gene-drug finding.
 *
 * The layout deliberately separates two kinds of text. The plain-language lines
 * are ours. The blockquote is CPIC's published recommendation, reproduced word
 * for word and attributed. Keeping them visually distinct is the whole trust
 * argument of the product: the reader can always see which sentence a model
 * wrote and which one a guideline committee did.
 */
export function FindingCard({ finding }: { finding: Finding }) {
  const ui = SEVERITY_UI[finding.severity];
  const indication = populationLabel(finding.population);
  const implication = Object.entries(finding.implications);

  return (
    <article
      className={`overflow-hidden rounded-xl border ${ui.border} bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]`}
    >
      <div className={`flex items-center gap-2.5 border-b ${ui.border} ${ui.surface} px-5 py-2.5`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${ui.dot}`} aria-hidden />
        <span className={`text-xs font-semibold uppercase tracking-wider ${ui.text}`}>
          {ui.label}
        </span>
        <span className="ml-auto text-xs font-medium text-muted">
          CPIC · {classificationLabel(finding.classification)}
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="text-xl font-semibold tracking-tight capitalize">
            {finding.drugName}
          </h3>
          <span className="text-sm text-muted">
            on your list as &ldquo;{finding.medicationAsWritten}&rdquo;
          </span>
        </div>

        {indication && (
          <p className="mt-1 text-xs text-faint">Guidance for: {indication}</p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              Your result
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {finding.genotypes.map((g) => (
                <span
                  key={g.gene}
                  className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  <span className="notation font-medium">{g.gene}</span>
                  <span className="notation text-muted">{g.diplotype}</span>
                  <span className="text-faint">·</span>
                  <span className="font-medium">{g.phenotype}</span>
                </span>
              ))}
            </div>
          </div>

          {implication.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                What this means
              </p>
              {implication.map(([gene, text]) => (
                <p key={gene} className="mt-1 text-[15px] leading-relaxed text-foreground/90">
                  {text}
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              Guideline recommendation
            </p>
            <blockquote
              className={`mt-1.5 border-l-2 ${ui.border} ${ui.surface} py-2.5 pl-3.5 pr-3 text-[15px] font-medium leading-relaxed`}
            >
              {finding.recommendation}
            </blockquote>
          </div>

          {finding.comments && (
            <p className="text-[13px] leading-relaxed text-muted">{finding.comments}</p>
          )}
        </div>

        {finding.otherIndications.length > 0 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:underline">
              Guidance differs for {finding.otherIndications.length} other clinical
              {finding.otherIndications.length === 1 ? " use" : " uses"} ▸
            </summary>
            <div className="mt-2 space-y-2 border-l border-border pl-3">
              {finding.otherIndications.map((alt, i) => (
                <div key={i} className="text-[13px]">
                  <p className="font-medium text-muted">
                    {populationLabel(alt.population) ?? "Other use"} ·{" "}
                    {classificationLabel(alt.classification)}
                  </p>
                  <p className="mt-0.5 leading-relaxed text-foreground/80">
                    {alt.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}

        {finding.guideline && (
          <div className="mt-4 border-t border-border pt-3">
            <a
              href={finding.guideline.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted underline decoration-border underline-offset-2 hover:text-accent hover:decoration-accent"
            >
              Source: CPIC {finding.guideline.name} guideline
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
