/**
 * Severity triage.
 *
 * Lives in its own module because both the findings engine and the full
 * drug-response profile need it, and having profile.ts import from match.ts
 * while match.ts imports from profile.ts would be a cycle.
 */

import type { CpicRecommendation } from "./data";
import type { Severity } from "./types";

/**
 * Maps a CPIC recommendation to a severity band.
 *
 * Order is load-bearing. Several "avoid" recommendations go on to name a safe
 * alternative at standard dose - "Avoid clopidogrel if possible. Use prasugrel
 * or ticagrelor at standard dose" - so testing for "standard dose" before
 * "avoid" would file the most dangerous findings as routine. Conversely
 * "No reason to avoid based on G6PD status" contains "avoid" but is reassuring,
 * which is why the high-risk patterns are anchored rather than free-floating.
 */
export function triage(rec: CpicRecommendation): Severity {
  const text = (rec.recommendation ?? "").trim();
  if (!text || /^no recommendation$/i.test(text)) return "unknown";
  if (/^no recommendation/i.test(rec.classification ?? "")) return "unknown";

  const lower = text.toLowerCase();

  // High risk: the drug should not be used, or not at its usual dose.
  if (
    /^avoid\b/.test(lower) ||
    /\bis contraindicated\b/.test(lower) ||
    /\bcontraindicated\b/.test(lower) ||
    /\bis not recommended\b/.test(lower) ||
    /^do not use\b/.test(lower) ||
    /\bselect alternative drug\b/.test(lower) ||
    /\bchoose an alternative\b/.test(lower) ||
    // "Prescribe an alternative statin" is directive - the drug in hand should
    // be replaced. Distinct from "consider an alternative", which is advisory
    // and belongs in the caution band below.
    /\bprescribe an alternative\b/.test(lower)
  ) {
    return "high";
  }

  // Caution: usable, but the dose or monitoring must change.
  if (
    /\breduc(e|tion)\b/.test(lower) ||
    /\bdecrease\b/.test(lower) ||
    /\bconsider an? alternative\b/.test(lower) ||
    /\balternative\b/.test(lower) ||
    /\bcautiously\b/.test(lower) ||
    /\bwith caution\b/.test(lower) ||
    /\bmonitor(ing|ed)?\b/.test(lower) ||
    /\bshortest feasible\b/.test(lower) ||
    /\btitrate\b/.test(lower) ||
    /\blower (the )?(starting )?dose\b/.test(lower) ||
    /\d+\s*%/.test(lower) ||
    /\bmust be measured\b/.test(lower)
  ) {
    return "caution";
  }

  // Routine: standard prescribing applies.
  if (
    /\bstandard dosing\b/.test(lower) ||
    /\bstandard doses?\b/.test(lower) ||
    /\brecommended starting dose\b/.test(lower) ||
    /\bno reason to avoid\b/.test(lower) ||
    /\bno need to avoid\b/.test(lower) ||
    /\blabel[- ]recommended\b/.test(lower) ||
    /\bnormal (starting )?dose\b/.test(lower)
  ) {
    return "standard";
  }

  return "unknown";
}

export const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  caution: 1,
  unknown: 2,
  standard: 3,
};

/** CPIC evidence strength, strongest first. */
export const CLASSIFICATION_RANK: Record<string, number> = {
  Strong: 0,
  Moderate: 1,
  Optional: 2,
  "No Recommendation": 3,
  "n/a": 4,
};

export function classificationRank(c: string | null | undefined): number {
  return CLASSIFICATION_RANK[c ?? ""] ?? 5;
}
