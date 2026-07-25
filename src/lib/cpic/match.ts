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
import { triage, SEVERITY_RANK, classificationRank } from "./triage";
import { buildProfile } from "./profile";
import { lookupPlainEnglish } from "@/lib/plain-english";
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

// Lives in ./triage so the drug-response profile can use it without creating
// an import cycle. Re-exported here because callers and tests reference it as
// part of the engine's surface.
export { triage } from "./triage";

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
        plainEnglish: lookupPlainEnglish(rec.recommendation, rec.implications ?? {}),
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

  // Which drugs the user already takes, and which genes are already causing
  // them a serious problem — so the profile can point out that an untaken drug
  // fails for the same reason as one they are on.
  const currentDrugIds = new Set(findings.map((f) => f.drugId));
  const currentHighByGene = new Map<string, string[]>();
  for (const f of findings) {
    if (f.severity !== "high") continue;
    for (const g of f.genotypes) {
      const list = currentHighByGene.get(g.gene) ?? [];
      if (!list.includes(f.drugName)) list.push(f.drugName);
      currentHighByGene.set(g.gene, list);
    }
  }

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
    profile: buildProfile(resolved, currentDrugIds, currentHighByGene),
  };
}
