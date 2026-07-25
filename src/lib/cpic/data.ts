/**
 * Loads the committed CPIC dataset.
 *
 * These files are produced by scripts/seed-cpic.mjs. They are only ever read on
 * the server - the dataset is ~3.4 MB and must not reach the client bundle.
 */

import diplotypePhenotype from "@/data/cpic/diplotype-phenotype.json";
import phenotypesRaw from "@/data/cpic/phenotypes.json";
import recommendationsRaw from "@/data/cpic/recommendations.json";
import drugsRaw from "@/data/cpic/drugs.json";
import guidelinesRaw from "@/data/cpic/guidelines.json";
import metaRaw from "@/data/cpic/meta.json";

export interface DiplotypeEntry {
  /** Display phenotype, e.g. "Poor Metabolizer". */
  p: string;
  /** Recommendation join key. Differs from `p` for CYP2D6 (activity score). */
  k: string;
}

export interface PhenotypeInfo {
  gene: string;
  phenotype: string;
  priority: "high" | "normal" | "unknown";
  description: string | null;
  consultationText: string | null;
}

export interface CpicRecommendation {
  id: number;
  guidelineId: number | null;
  drugId: string;
  phenotypes: Record<string, string>;
  lookupKey: Record<string, string>;
  implications: Record<string, string>;
  recommendation: string;
  classification: string;
  population: string | null;
  comments: string | null;
}

export interface CpicDrug {
  drugId: string;
  name: string;
  guidelineId: number | null;
  rxNormId: string | null;
}

export interface CpicGuideline {
  id: number;
  name: string;
  url: string;
  genes: string[];
}

export const diplotypeMap = diplotypePhenotype as unknown as Record<
  string,
  Record<string, DiplotypeEntry>
>;
export const phenotypeInfo = phenotypesRaw as unknown as Record<string, PhenotypeInfo>;
export const recommendations = recommendationsRaw as unknown as CpicRecommendation[];
export const drugs = drugsRaw as unknown as CpicDrug[];
export const guidelines = guidelinesRaw as unknown as CpicGuideline[];
export const cpicMeta = metaRaw;

/** drugId -> recommendations, so matching is a map hit rather than a table scan. */
export const recommendationsByDrug: Map<string, CpicRecommendation[]> = (() => {
  const m = new Map<string, CpicRecommendation[]>();
  for (const rec of recommendations) {
    const list = m.get(rec.drugId);
    if (list) list.push(rec);
    else m.set(rec.drugId, [rec]);
  }
  return m;
})();

/** Lowercased generic name -> drug. */
export const drugsByName: Map<string, CpicDrug> = new Map(
  drugs.map((d) => [d.name.toLowerCase(), d]),
);

export const guidelinesById: Map<number, CpicGuideline> = new Map(
  guidelines.map((g) => [g.id, g]),
);

export const drugsById: Map<string, CpicDrug> = new Map(drugs.map((d) => [d.drugId, d]));

/** Genes we hold diplotype tables for. */
export const supportedGenes: string[] = Object.keys(diplotypeMap).sort();
