/**
 * Plain-English restatements of CPIC guidance, keyed by content.
 *
 * Generated once by scripts/translate-plain-english.mjs and committed, so the
 * text is reviewable and the request path stays free of model calls. See that
 * script for the constraints the translations were written under.
 *
 * This is explanatory text only. The verbatim CPIC recommendation is always
 * rendered alongside it and carries the actual instruction — if a translation
 * is ever missing, the UI simply shows the source text, which is what it showed
 * before this layer existed.
 */

import { createHash } from "node:crypto";
import data from "@/data/plain-english.json";

export interface PlainEnglish {
  headline: string;
  detail: string;
}

const translations = (data as { translations: Record<string, PlainEnglish> })
  .translations;

export const plainEnglishMeta = {
  generatedAt: (data as { generatedAt: string }).generatedAt,
  model: (data as { model: string }).model,
  count: Object.keys(translations).length,
};

/**
 * Must match the key derivation in scripts/translate-plain-english.mjs exactly.
 * A drift here produces no error — every lookup simply misses and the product
 * silently reverts to clinical language.
 */
function keyFor(recommendation: string, implication: string): string {
  return createHash("sha1")
    .update(`${recommendation}||${implication}`)
    .digest("hex")
    .slice(0, 16);
}

export function lookupPlainEnglish(
  recommendation: string,
  implications: Record<string, string>,
): PlainEnglish | null {
  const rec = (recommendation ?? "").trim();
  if (!rec) return null;
  const impl = Object.values(implications ?? {})
    .join(" ")
    .trim();
  return translations[keyFor(rec, impl)] ?? null;
}
