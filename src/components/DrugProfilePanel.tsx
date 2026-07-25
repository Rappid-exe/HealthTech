import type { DrugProfile, ProfileEntry } from "@/lib/cpic/profile";
import { classFor } from "@/lib/cpic/drug-classes";
import { SEVERITY_UI } from "@/lib/present";

/**
 * What this genome means for medicines the reader has not been prescribed.
 *
 * The findings above answer "are the drugs you take safe". This answers the
 * question that makes the result worth keeping: what happens the next time
 * someone writes you a prescription.
 *
 * The shared-mechanism callout is the point of the whole section. A CYP2D6 poor
 * metaboliser told only that codeine will not work for them gets offered
 * tramadol next — which fails for exactly the same reason. Nothing in a current
 * medication list can surface that.
 */
export function DrugProfilePanel({
  profile,
  medicationsReviewed,
}: {
  profile: DrugProfile;
  medicationsReviewed: number;
}) {
  const actionable = profile.avoid.length + profile.adjust.length;
  if (actionable === 0) return null;

  // Drugs not currently taken that fail for the same reason as one that is.
  //
  // Sorted so same-class substitutes lead. Sharing an enzyme with codeine makes
  // both tramadol and nortriptyline mechanistically identical cases, but only
  // tramadol is a drug someone would actually reach for *instead of* codeine —
  // and "watch for the obvious substitute" has to be true of the first thing it
  // shows, or the reader stops believing the rest.
  const traps = profile.avoid
    .filter((e) => !e.currentlyTaking && e.sameMechanismAs.length > 0)
    .map((e) => ({
      entry: e,
      sameClass: e.sameMechanismAs.some(
        (related) => classFor(related) === classFor(e.drugName),
      ),
    }))
    .sort((a, b) => Number(b.sameClass) - Number(a.sameClass))
    .map((x) => x.entry);

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
        Beyond the medicines you take now
      </h2>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border bg-accent-tint px-5 py-4">
          <p className="display text-balance text-[1.35rem] leading-snug">
            Your genome affects {profile.total} medicines. You told us about{" "}
            {medicationsReviewed}.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            These results do not expire. {profile.avoid.length} of these should be avoided
            or swapped for you, and {profile.adjust.length} need a different dose or extra
            monitoring — whether or not anyone has prescribed them yet.
          </p>
        </div>

        {/* The insight that only exists at this altitude. */}
        {traps.length > 0 && (
          <div className="border-b border-[var(--high-border)] bg-[var(--high-surface)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--high)]">
              Watch for the obvious substitute
            </p>
            <ul className="mt-2 space-y-2">
              {traps.slice(0, 3).map((t) => (
                <li key={t.drugId} className="text-[15px] leading-relaxed">
                  <span className="font-semibold capitalize">{t.drugName}</span> fails for
                  the same reason as{" "}
                  <span className="font-medium capitalize">
                    {t.sameMechanismAs.join(" and ")}
                  </span>{" "}
                  — both depend on{" "}
                  <span className="notation">{t.genes.join(", ")}</span>. It is a common
                  next choice, and it would not work for you either.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="divide-y divide-border">
          {profile.grouped.map((group) => (
            <div key={group.className} className="px-5 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                {group.className}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.entries.map((e) => (
                  <DrugChip key={e.drugId} entry={e} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-3">
          <p className="text-xs leading-relaxed text-muted">
            Derived from the same CPIC dataset as the findings above, matched to{" "}
            {profile.drivingGenes.length} of your gene results (
            <span className="notation">{profile.drivingGenes.join(", ")}</span>). Drugs
            with no entry here have no published pharmacogenomic guidance for your
            genotype.
          </p>
        </div>
      </div>
    </section>
  );
}

function DrugChip({ entry }: { entry: ProfileEntry }) {
  const ui = SEVERITY_UI[entry.severity];
  return (
    <span
      title={entry.recommendation}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] ${ui.border} ${ui.surface} ${
        entry.currentlyTaking ? "ring-1 ring-inset ring-[var(--border-strong)]" : ""
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ui.dot}`} aria-hidden />
      <span className="font-medium capitalize">{entry.drugName}</span>
      {entry.currentlyTaking && (
        <span className="text-[10px] uppercase tracking-wider text-muted">taking</span>
      )}
    </span>
  );
}
