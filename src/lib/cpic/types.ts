/** Severity band shown to the user. Derived from CPIC data, never invented. */
export type Severity = "high" | "caution" | "standard" | "unknown";

/** A gene call taken from the patient's genetic report. */
export interface Genotype {
  gene: string;
  diplotype: string;
}

/** A resolved gene call, with both display phenotype and recommendation join key. */
export interface ResolvedGenotype extends Genotype {
  phenotype: string;
  /** The value CPIC's recommendation table joins on. Equals phenotype for most
   *  genes, but is an activity score for CYP2D6. */
  joinKey: string;
  /** CPIC's own EHR priority for this phenotype. */
  priority: "high" | "normal" | "unknown";
  description: string | null;
  consultationText: string | null;
}

/** A medication as written by the patient, before resolution. */
export interface MedicationInput {
  /** Exactly what the user or their report said, e.g. "Plavix 75mg". */
  raw: string;
}

/** A medication resolved to a CPIC drug. */
export interface ResolvedMedication {
  raw: string;
  drugId: string;
  drugName: string;
  /** Set when the user gave a brand name we mapped to a generic. */
  matchedVia: "generic" | "brand";
}

/** One gene-drug interaction finding. Every clinical field is verbatim CPIC. */
export interface Finding {
  severity: Severity;
  drugName: string;
  drugId: string;
  /** What the patient wrote, so the UI can echo "Plavix" back to them. */
  medicationAsWritten: string;
  /** The gene calls that triggered this finding. */
  genotypes: ResolvedGenotype[];
  /** Verbatim CPIC recommendation text. Never paraphrased by a model. */
  recommendation: string;
  /** Verbatim CPIC implication text, per gene. */
  implications: Record<string, string>;
  /** CPIC evidence strength: Strong / Moderate / Optional / No Recommendation. */
  classification: string;
  /** Clinical population the recommendation applies to, when CPIC scopes it. */
  population: string | null;
  comments: string | null;
  /** Link to the published CPIC guideline this came from. */
  guideline: { id: number; name: string; url: string } | null;
  /**
   * CPIC often scopes guidance by clinical indication - clopidogrel carries
   * separate recommendations for acute coronary syndrome, non-ACS
   * cardiovascular use, and neurovascular use. Showing three near-identical
   * cards would bury the signal, so the strongest becomes the finding and the
   * rest hang off it for the physician view.
   */
  otherIndications: Array<{
    population: string | null;
    recommendation: string;
    classification: string;
    severity: Severity;
  }>;
}

/** Full result of running the engine. */
export interface AnalysisResult {
  findings: Finding[];
  /** Gene calls we resolved successfully. */
  genotypes: ResolvedGenotype[];
  /** Gene calls we could not resolve, so the UI can be honest about gaps. */
  unresolvedGenotypes: Genotype[];
  /** Medications we could not map to a CPIC drug. */
  unmatchedMedications: string[];
  /** Medications resolved but with no guideline for this patient's genotype. */
  medicationsWithoutFindings: ResolvedMedication[];
  summary: {
    high: number;
    caution: number;
    standard: number;
    genesTyped: number;
    medicationsReviewed: number;
  };
}
