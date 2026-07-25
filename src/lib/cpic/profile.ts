/**
 * The full drug-response profile for a genotype.
 *
 * The findings engine answers "are the drugs you handed me safe". This answers
 * the larger question the same data supports: given this genome, what does CPIC
 * say about *every* drug it covers — including the ones nobody has prescribed
 * yet.
 *
 * That difference matters clinically. A CYP2D6 poor metaboliser told only that
 * codeine will not work for them is likely to be offered tramadol next, which
 * fails for exactly the same reason. That trap is invisible while you are only
 * looking at a current medication list, and it is the reason this exists.
 */

import { recommendations, drugsById, guidelinesById } from "./data";
import { triage } from "./match";
import { lookupPlainEnglish } from "@/lib/plain-english";
import { classFor, membersOf, CLASS_ORDER } from "./drug-classes";
import { drugsByName } from "./data";
import type { ResolvedGenotype, Severity } from "./types";

export interface ProfileEntry {
  drugId: string;
  drugName: string;
  severity: Severity;
  classification: string;
  /** Gene(s) driving this, so the reader can see the shared mechanism. */
  genes: string[];
  recommendation: string;
  plainEnglish: { headline: string; detail: string } | null;
  guideline: { name: string; url: string } | null;
  /** Already on the user's medication list, so shown as a finding elsewhere. */
  currentlyTaking: boolean;
  /**
   * Drugs the user already takes that are flagged for the *same gene*. This is
   * the codeine/tramadol relationship, stated generally.
   */
  sameMechanismAs: string[];
}

export interface DrugProfile {
  /** Every drug CPIC has guidance for, given this genotype. */
  total: number;
  avoid: ProfileEntry[];
  adjust: ProfileEntry[];
  standard: ProfileEntry[];
  /**
   * Grouped for display, in CLASS_ORDER, excluding empty groups.
   *
   * `unaffected` is the rest of the class: drugs CPIC covers where nothing
   * matched this genotype. Deliberately *not* called "safe" — it means this
   * genome does not change the usual prescribing advice, which is a narrower
   * claim and the only one the data supports.
   */
  grouped: Array<{
    className: string;
    entries: ProfileEntry[];
    unaffected: string[];
  }>;
  /** Genes that drove at least one avoid/adjust entry. */
  drivingGenes: string[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  caution: 1,
  unknown: 2,
  standard: 3,
};

const CLASSIFICATION_RANK: Record<string, number> = {
  Strong: 0,
  Moderate: 1,
  Optional: 2,
  "No Recommendation": 3,
};

/**
 * Builds the profile.
 *
 * `currentDrugIds` are the drugs already surfaced as findings; they stay in the
 * profile (removing them would hide the shared-mechanism relationship that
 * makes it useful) but are marked so the UI can treat them differently.
 */
export function buildProfile(
  genotypes: ResolvedGenotype[],
  currentDrugIds: Set<string> = new Set(),
  currentHighByGene: Map<string, string[]> = new Map(),
): DrugProfile {
  const byGene = new Map(genotypes.map((g) => [g.gene, g]));
  const best = new Map<string, ProfileEntry>();

  for (const rec of recommendations) {
    const required = Object.keys(rec.lookupKey ?? {});
    if (required.length === 0) continue;

    // Same rule as the findings engine: only apply a recommendation when every
    // gene it depends on has a call.
    let satisfied = true;
    for (const gene of required) {
      const g = byGene.get(gene);
      if (!g || g.joinKey !== rec.lookupKey[gene]) {
        satisfied = false;
        break;
      }
    }
    if (!satisfied) continue;

    const drug = drugsById.get(rec.drugId);
    if (!drug) continue;

    const severity = triage(rec);
    const existing = best.get(rec.drugId);
    // One entry per drug: keep the most serious, best-evidenced guidance.
    if (
      existing &&
      (SEVERITY_RANK[existing.severity] < SEVERITY_RANK[severity] ||
        (SEVERITY_RANK[existing.severity] === SEVERITY_RANK[severity] &&
          (CLASSIFICATION_RANK[existing.classification] ?? 9) <=
            (CLASSIFICATION_RANK[rec.classification] ?? 9)))
    ) {
      continue;
    }

    const guideline = rec.guidelineId ? guidelinesById.get(rec.guidelineId) : undefined;

    best.set(rec.drugId, {
      drugId: rec.drugId,
      drugName: drug.name,
      severity,
      classification: rec.classification,
      genes: required,
      recommendation: rec.recommendation,
      plainEnglish: lookupPlainEnglish(rec.recommendation, rec.implications ?? {}),
      guideline: guideline ? { name: guideline.name, url: guideline.url } : null,
      currentlyTaking: currentDrugIds.has(rec.drugId),
      sameMechanismAs: [],
    });
  }

  // Link each entry to the drugs the user already takes that fail for the same
  // reason. This is what turns a list into an insight.
  for (const entry of best.values()) {
    if (entry.currentlyTaking) continue;
    const related = new Set<string>();
    for (const gene of entry.genes) {
      for (const drugName of currentHighByGene.get(gene) ?? []) related.add(drugName);
    }
    entry.sameMechanismAs = [...related];
  }

  const all = [...best.values()];
  const bySeverity = (s: Severity) =>
    all
      .filter((e) => e.severity === s)
      .sort(
        (a, b) =>
          (CLASSIFICATION_RANK[a.classification] ?? 9) -
            (CLASSIFICATION_RANK[b.classification] ?? 9) ||
          a.drugName.localeCompare(b.drugName),
      );

  const avoid = bySeverity("high");
  const adjust = bySeverity("caution");
  const standard = bySeverity("standard");

  const actionable = [...avoid, ...adjust];
  const groups = new Map<string, ProfileEntry[]>();
  for (const e of actionable) {
    const cls = classFor(e.drugName);
    const list = groups.get(cls);
    if (list) list.push(e);
    else groups.set(cls, [e]);
  }

  // Everything flagged, so the rest of each class can be worked out by
  // subtraction.
  const flagged = new Set(actionable.map((e) => e.drugName.toLowerCase()));

  const grouped = CLASS_ORDER.filter((c) => groups.has(c)).map((className) => ({
    className,
    entries: groups
      .get(className)!
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.drugName.localeCompare(b.drugName),
      ),
    // The rest of the class: drugs CPIC covers, where nothing matched this
    // genotype. Restricted to drugs CPIC actually knows about — a drug absent
    // from the dataset entirely tells us nothing, and listing it here would
    // imply a check we never ran.
    unaffected: membersOf(className)
      .filter((name) => !flagged.has(name) && drugsByName.has(name))
      .sort(),
  }));

  const drivingGenes = [...new Set(actionable.flatMap((e) => e.genes))].sort();

  return { total: all.length, avoid, adjust, standard, grouped, drivingGenes };
}
