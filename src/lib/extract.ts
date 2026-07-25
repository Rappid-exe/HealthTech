/**
 * The extraction layer.
 *
 * This is the one place a language model touches the pipeline, and its remit is
 * deliberately narrow: pull structured gene calls and medication names out of
 * whatever format a consumer lab decided to use, and stop there. It does not
 * interpret results, assess risk, or recommend anything — that is the matching
 * engine's job, working from CPIC's published tables.
 *
 * Extraction is genuinely hard and genuinely worth a model: every vendor lays
 * its report out differently, genotypes hide inside prose and tables, and
 * patients write "Plavix 75mg" where the record says clopidogrel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { supportedGenes } from "@/lib/cpic/data";
import type { Genotype } from "@/lib/cpic/types";

export interface ExtractionResult {
  genotypes: Genotype[];
  medications: string[];
  /** Anything the model saw but could not confidently place, kept for honesty. */
  notes: string[];
}

/**
 * Constrains the response shape. Structured outputs guarantee we get valid,
 * parseable JSON rather than prose we have to regex at.
 */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    genotypes: {
      type: "array",
      description: "Gene calls found in the report.",
      items: {
        type: "object",
        properties: {
          gene: {
            type: "string",
            description:
              "HGNC gene symbol, uppercase, exactly as CPIC writes it (e.g. CYP2C19, SLCO1B1, HLA-B).",
          },
          diplotype: {
            type: "string",
            description:
              "The two-allele call joined by a forward slash, e.g. *2/*2, *1/*17, Reference/Reference. Preserve star notation exactly.",
          },
        },
        required: ["gene", "diplotype"],
        additionalProperties: false,
      },
    },
    medications: {
      type: "array",
      description:
        "Medications the patient is currently taking, as written in the source, including dose if stated.",
      items: { type: "string" },
    },
    notes: {
      type: "array",
      description:
        "Anything ambiguous or unreadable that a human should check. Empty if nothing.",
      items: { type: "string" },
    },
  },
  required: ["genotypes", "medications", "notes"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You extract structured data from consumer pharmacogenomic reports.

Your only job is transcription. You do not interpret results, assess risk, judge
whether a result is normal, or comment on medications. Downstream systems handle
all clinical reasoning against published guidelines.

Rules:

1. Transcribe only what is written. Never infer a genotype from context, never
   complete a partial call, and never supply a "likely" or "typical" result. If
   a gene is named but its diplotype is unreadable, put it in notes and leave it
   out of genotypes. A wrong genotype is far worse than a missing one.

2. Normalise gene symbols to their standard uppercase HGNC form. "Cytochrome
   P450 2C19", "CYP 2C19" and "cyp2c19" are all CYP2C19.

3. Preserve diplotype notation exactly as written, joined with a single forward
   slash: *2/*2, *1/*17, *1/*28, Reference/Reference. Do not reorder the alleles
   and do not strip asterisks.

4. These are the genes worth extracting; ignore any others:
   ${supportedGenes.join(", ")}

5. For medications, copy what the source says, including dose and frequency if
   present. Keep brand names as brand names — do not convert "Plavix" to
   "clopidogrel". Include only current medications, not past ones or allergies.

6. If the source contains no genotypes, or no medications, return an empty array
   for that field rather than guessing.`;

export class ExtractionError extends Error {}

/**
 * Runs extraction over a report and an optional separate medication list.
 *
 * Throws ExtractionError when no API key is configured, so callers can fall
 * back to the demo path rather than showing a broken screen.
 */
export async function extract(
  reportText: string,
  medicationText?: string,
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractionError(
      "ANTHROPIC_API_KEY is not configured on the server.",
    );
  }
  if (!reportText.trim()) {
    throw new ExtractionError("No report content was provided.");
  }

  const client = new Anthropic({ apiKey });

  const userContent = medicationText?.trim()
    ? `<report>\n${reportText}\n</report>\n\n<medication_list>\n${medicationText}\n</medication_list>`
    : `<report>\n${reportText}\n</report>`;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    // Transcription is not a reasoning-heavy task, and this sits in the demo's
    // critical path, so we trade depth for latency.
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    },
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("The model declined to process this document.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ExtractionError("The model returned no readable output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError("The model returned malformed JSON.");
  }

  return normalise(parsed);
}

/**
 * Validates and cleans the model's output before it reaches the engine.
 *
 * Structured outputs guarantee the shape, not the content, so gene symbols are
 * still checked against the genes we actually hold tables for. Anything else is
 * dropped rather than passed through to fail silently downstream.
 */
function normalise(raw: unknown): ExtractionResult {
  const obj = raw as Record<string, unknown>;
  const known = new Set(supportedGenes);

  const genotypes: Genotype[] = [];
  const notes: string[] = Array.isArray(obj.notes)
    ? obj.notes.filter((n): n is string => typeof n === "string")
    : [];

  if (Array.isArray(obj.genotypes)) {
    for (const g of obj.genotypes) {
      if (!g || typeof g !== "object") continue;
      const gene = String((g as Record<string, unknown>).gene ?? "")
        .trim()
        .toUpperCase();
      const diplotype = String((g as Record<string, unknown>).diplotype ?? "").trim();
      if (!gene || !diplotype) continue;

      if (!known.has(gene)) {
        notes.push(`Ignored ${gene} ${diplotype} — no CPIC guideline table for this gene.`);
        continue;
      }
      genotypes.push({ gene, diplotype });
    }
  }

  const medications: string[] = Array.isArray(obj.medications)
    ? obj.medications
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter(Boolean)
    : [];

  return { genotypes, medications, notes };
}
