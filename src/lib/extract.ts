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

/**
 * A failure we can explain to the caller.
 *
 * `kind` distinguishes causes that need different action — a rejected key is a
 * configuration problem, a rate limit is transient, a refusal is about the
 * document. Collapsing them into one "something went wrong" makes a deployment
 * misconfiguration indistinguishable from an outage, which is exactly the
 * situation this class was added to stop.
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "not_configured"
      | "auth_rejected"
      | "rate_limited"
      | "unavailable"
      | "refused"
      | "bad_input"
      | "bad_output" = "unavailable",
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Maps an SDK error onto an ExtractionError, using its typed classes. */
function classify(err: unknown): ExtractionError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new ExtractionError(
      "The Anthropic API key was rejected. Check that ANTHROPIC_API_KEY is set correctly on the server, with no leading or trailing whitespace.",
      "auth_rejected",
    );
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ExtractionError(
      "The Anthropic API key does not have access to this model.",
      "auth_rejected",
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ExtractionError(
      "The extraction service is rate limited. Try again in a moment.",
      "rate_limited",
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ExtractionError(
      "Could not reach the extraction service.",
      "unavailable",
    );
  }
  if (err instanceof Anthropic.APIError) {
    return new ExtractionError(
      `The extraction service returned an error (${err.status ?? "unknown"}).`,
      "unavailable",
    );
  }
  // Not an SDK error class. Carry the underlying name and message through so a
  // deployment-only failure is diagnosable without server log access — with any
  // key-shaped substring redacted, since this reaches the client.
  const name = err instanceof Error ? err.name : typeof err;
  const detail = (err instanceof Error ? err.message : String(err))
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 200);
  return new ExtractionError(
    `Extraction failed unexpectedly: ${name}: ${detail}`,
    "unavailable",
  );
}

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
  // Trimmed deliberately: a key pasted into a hosting dashboard very often
  // carries a leading space, and the resulting 401 is otherwise indistinguishable
  // from an invalid key.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ExtractionError(
      "ANTHROPIC_API_KEY is not configured on the server.",
      "not_configured",
    );
  }
  if (!reportText.trim()) {
    throw new ExtractionError("No report content was provided.", "bad_input");
  }

  const client = new Anthropic({ apiKey });

  const userContent = medicationText?.trim()
    ? `<report>\n${reportText}\n</report>\n\n<medication_list>\n${medicationText}\n</medication_list>`
    : `<report>\n${reportText}\n</report>`;

  let response;
  try {
    response = await client.messages.create({
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
  } catch (err) {
    throw classify(err);
  }

  if (response.stop_reason === "refusal") {
    throw new ExtractionError(
      "The model declined to process this document.",
      "refused",
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ExtractionError("The model returned no readable output.", "bad_output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError("The model returned malformed JSON.", "bad_output");
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
