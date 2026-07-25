/** Presentation helpers. Nothing here changes clinical meaning - labels only. */

import type { Severity } from "@/lib/cpic/types";

export const SEVERITY_UI: Record<
  Severity,
  { label: string; short: string; text: string; surface: string; border: string; dot: string }
> = {
  high: {
    label: "Action needed",
    short: "Action",
    text: "text-[var(--high)]",
    surface: "bg-[var(--high-surface)]",
    border: "border-[var(--high-border)]",
    dot: "bg-[var(--high)]",
  },
  caution: {
    label: "Discuss with your doctor",
    short: "Discuss",
    text: "text-[var(--caution)]",
    surface: "bg-[var(--caution-surface)]",
    border: "border-[var(--caution-border)]",
    dot: "bg-[var(--caution)]",
  },
  standard: {
    label: "No change expected",
    short: "Routine",
    text: "text-[var(--standard)]",
    surface: "bg-[var(--standard-surface)]",
    border: "border-[var(--standard-border)]",
    dot: "bg-[var(--standard)]",
  },
  unknown: {
    label: "See guideline",
    short: "Review",
    text: "text-[var(--unknown)]",
    surface: "bg-[var(--unknown-surface)]",
    border: "border-[var(--unknown-border)]",
    dot: "bg-[var(--unknown)]",
  },
};

/**
 * CPIC scopes some recommendations to a clinical indication and encodes it
 * tersely - "CVI ACS PCI" means cardiovascular indications in acute coronary
 * syndrome or percutaneous coronary intervention. Unexpanded, these read as
 * noise to a patient and as a typo to everyone else.
 */
const POPULATION_LABELS: Record<string, string> = {
  "CVI ACS PCI": "Heart attack or stent procedure",
  "CVI non-ACS non-PCI": "Other cardiovascular use",
  NVI: "Stroke or other neurovascular use",
  "adults and adolescents": "Adults and adolescents",
  adults: "Adults",
  pediatrics: "Children",
  general: "",
};

export function populationLabel(population: string | null): string | null {
  if (!population) return null;
  const key = population.trim();
  const mapped = POPULATION_LABELS[key];
  if (mapped === "") return null;
  if (mapped) return mapped;
  // Unknown code: title-case it rather than showing a raw token.
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Clinical population as a physician would want it - terse, uncollapsed. */
export function populationClinical(population: string | null): string | null {
  if (!population) return null;
  const key = population.trim();
  if (key === "general") return null;
  return key;
}

/** CPIC evidence strength, phrased for a lay reader. */
export function classificationLabel(classification: string): string {
  switch (classification) {
    case "Strong":
      return "Strong evidence";
    case "Moderate":
      return "Moderate evidence";
    case "Optional":
      return "Optional";
    case "No Recommendation":
      return "No recommendation";
    default:
      return classification;
  }
}
