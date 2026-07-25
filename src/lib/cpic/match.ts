/**
 * The clinical matching engine.
 *
 * Takes a patient's gene calls and medication list, and returns CPIC's
 * published guidance for each gene-drug pair. No language model participates in
 * this file: every clinical string in the output is copied verbatim from the
 * CPIC dataset. The model's job upstream is extraction, and downstream is
 * translation - never the recommendation itself.
 */

import {
  diplotypeMap,
  phenotypeInfo,
  recommendationsByDrug,
  drugsByName,
  guidelinesById,
  type CpicDrug,
  type CpicRecommendation,
} from "./data";
import { BRAND_TO_GENERIC, normaliseMedicationName } from "./brands";
import type {
  AnalysisResult,
  Finding,
  Genotype,
  ResolvedGenotype,
  ResolvedMedication,
  Severity,
} from "./types";

/* ------------------------------------------------------------------ */
/* Severity triage                                                     */
/* ------------------------------------------------------------------ */

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

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  caution: 1,
  unknown: 2,
  standard: 3,
};

/** CPIC evidence strength, strongest first. */
const CLASSIFICATION_RANK: Record<string, number> = {
  Strong: 0,
  Moderate: 1,
  Optional: 2,
  "No Recommendation": 3,
  "n/a": 4,
};

function classificationRank(c: string | null | undefined): number {
  return CLASSIFICATION_RANK[c ?? ""] ?? 5;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/** Resolves a gene + diplotype to its phenotype and CPIC join key. */
export function resolveGenotype(g: Genotype): ResolvedGenotype | null {
  const geneTable = diplotypeMap[g.gene];
  if (!geneTable) return null;

  // Diplotypes are unordered pairs; a report may write *17/*2 where CPIC has
  // *2/*17. Try as given, then swapped.
  const entry =
    geneTable[g.diplotype] ??
    (() => {
      const parts = g.diplotype.split("/");
      if (parts.length !== 2) return undefined;
      return geneTable[`${parts[1]}/${parts[0]}`];
    })();

  if (!entry) return null;

  const info = phenotypeInfo[`${g.gene}|${entry.p}`];
  return {
    gene: g.gene,
    diplotype: g.diplotype,
    phenotype: entry.p,
    joinKey: entry.k,
    priority: info?.priority ?? "unknown",
    description: info?.description ?? null,
    consultationText: info?.consultationText ?? null,
  };
}

/**
 * Resolves a free-text medication to a CPIC drug.
 *
 * Matching is token-exact rather than substring based. Substring matching looks
 * attractive for messy input but produces dangerous false positives - CPIC
 * carries both "aspirin" and drugs whose names contain shorter drug names.
 */
export function resolveMedication(raw: string): ResolvedMedication | null {
  const cleaned = normaliseMedicationName(raw);
  if (!cleaned) return null;

  const attempt = (
    candidate: string,
  ): { drug: CpicDrug; via: "generic" | "brand" } | null => {
    const generic = drugsByName.get(candidate);
    if (generic) return { drug: generic, via: "generic" };
    const brand = BRAND_TO_GENERIC[candidate];
    if (brand) {
      const drug = drugsByName.get(brand);
      if (drug) return { drug, via: "brand" };
    }
    return null;
  };

  // Whole string first, then individual words, then adjacent word pairs to
  // catch multi-word drug names.
  const tokens = cleaned.split(" ").filter(Boolean);
  const candidates: string[] = [cleaned, ...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    candidates.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  for (const candidate of candidates) {
    const hit = attempt(candidate);
    if (hit) {
      return {
        raw,
        drugId: hit.drug.drugId,
        drugName: hit.drug.name,
        matchedVia: hit.via,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * A recommendation applies only when we have a call for every gene it depends
 * on. Two thirds of CPIC's recommendations are multi-gene, and a partial match
 * would assert guidance the patient's data does not actually support.
 */
function recommendationApplies(
  rec: CpicRecommendation,
  byGene: Map<string, ResolvedGenotype>,
): ResolvedGenotype[] | null {
  const required = Object.keys(rec.lookupKey ?? {});
  if (required.length === 0) return null;

  const used: ResolvedGenotype[] = [];
  for (const gene of required) {
    const genotype = byGene.get(gene);
    if (!genotype) return null;
    if (genotype.joinKey !== rec.lookupKey[gene]) return null;
    used.push(genotype);
  }
  return used;
}

/**
 * Collapses the several indication-scoped recommendations CPIC may return for
 * one drug into a single finding. The most severe, best-evidenced one leads;
 * the others are preserved so the physician view can still show the full
 * picture rather than quietly discarding guidance.
 */
function collapseByIndication(matched: Finding[]): Finding {
  const ordered = [...matched].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      classificationRank(a.classification) - classificationRank(b.classification),
  );

  const [primary, ...rest] = ordered;
  return {
    ...primary,
    otherIndications: rest.map((f) => ({
      population: f.population,
      recommendation: f.recommendation,
      classification: f.classification,
      severity: f.severity,
    })),
  };
}

export interface AnalyseInput {
  genotypes: Genotype[];
  medications: string[];
}

export function analyse({ genotypes, medications }: AnalyseInput): AnalysisResult {
  const resolved: ResolvedGenotype[] = [];
  const unresolvedGenotypes: Genotype[] = [];

  for (const g of genotypes) {
    const r = resolveGenotype(g);
    if (r) resolved.push(r);
    else unresolvedGenotypes.push(g);
  }

  const byGene = new Map(resolved.map((g) => [g.gene, g]));

  const findings: Finding[] = [];
  const unmatchedMedications: string[] = [];
  const medicationsWithoutFindings: ResolvedMedication[] = [];

  for (const med of medications) {
    const drug = resolveMedication(med);
    if (!drug) {
      unmatchedMedications.push(med);
      continue;
    }

    const candidates = recommendationsByDrug.get(drug.drugId) ?? [];
    const matched: Finding[] = [];

    for (const rec of candidates) {
      const used = recommendationApplies(rec, byGene);
      if (!used) continue;

      const guideline = rec.guidelineId ? guidelinesById.get(rec.guidelineId) : undefined;
      matched.push({
        severity: triage(rec),
        drugName: drug.drugName,
        drugId: drug.drugId,
        medicationAsWritten: drug.raw,
        genotypes: used,
        recommendation: rec.recommendation,
        implications: rec.implications ?? {},
        classification: rec.classification,
        population: rec.population,
        comments: rec.comments,
        guideline: guideline
          ? { id: guideline.id, name: guideline.name, url: guideline.url }
          : null,
        otherIndications: [],
      });
    }

    if (matched.length === 0) {
      medicationsWithoutFindings.push(drug);
      continue;
    }

    findings.push(collapseByIndication(matched));
  }

  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      classificationRank(a.classification) - classificationRank(b.classification) ||
      a.drugName.localeCompare(b.drugName),
  );

  return {
    findings,
    genotypes: resolved,
    unresolvedGenotypes,
    unmatchedMedications,
    medicationsWithoutFindings,
    summary: {
      high: findings.filter((f) => f.severity === "high").length,
      caution: findings.filter((f) => f.severity === "caution").length,
      standard: findings.filter((f) => f.severity === "standard").length,
      genesTyped: resolved.length,
      medicationsReviewed: medications.length,
    },
  };
}
