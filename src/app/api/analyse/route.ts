import { NextResponse } from "next/server";
import { extract, ExtractionError } from "@/lib/extract";
import { analyse } from "@/lib/cpic/match";
import type { AnalysisResult } from "@/lib/cpic/types";

export const runtime = "nodejs";
// The CPIC dataset is imported at module scope; keep this off the edge runtime
// and out of any static optimisation.
export const dynamic = "force-dynamic";

export interface AnalyseResponse {
  result: AnalysisResult;
  extraction: {
    genotypes: number;
    medications: number;
    notes: string[];
  };
}

/** Guards against someone pasting a novel into the box. */
const MAX_CHARS = 200_000;

export async function POST(request: Request) {
  let body: { reportText?: unknown; medicationText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const reportText = typeof body.reportText === "string" ? body.reportText : "";
  const medicationText =
    typeof body.medicationText === "string" ? body.medicationText : undefined;

  if (!reportText.trim()) {
    return NextResponse.json(
      { error: "Paste or upload a genetic report to analyse." },
      { status: 400 },
    );
  }
  if (reportText.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Report is too long (limit ${MAX_CHARS.toLocaleString()} characters).` },
      { status: 413 },
    );
  }

  try {
    const extraction = await extract(reportText, medicationText);

    if (extraction.genotypes.length === 0) {
      return NextResponse.json(
        {
          error:
            "No gene results could be read from this document. Check that it is a pharmacogenomic report.",
          notes: extraction.notes,
        },
        { status: 422 },
      );
    }

    const result = analyse({
      genotypes: extraction.genotypes,
      medications: extraction.medications,
    });

    const payload: AnalyseResponse = {
      result,
      extraction: {
        genotypes: extraction.genotypes.length,
        medications: extraction.medications.length,
        notes: extraction.notes,
      },
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof ExtractionError) {
      // Status follows the cause so a misconfigured deployment is not
      // indistinguishable from an outage in the logs or to the caller.
      const status =
        err.kind === "rate_limited"
          ? 429
          : err.kind === "bad_input"
            ? 400
            : err.kind === "refused"
              ? 422
              : 503;
      console.error(`analyse: ${err.kind} — ${err.message}`);
      return NextResponse.json({ error: err.message, kind: err.kind }, { status });
    }
    console.error("analyse route failed:", err);
    return NextResponse.json(
      { error: "Analysis failed unexpectedly. Try the demo report instead." },
      { status: 500 },
    );
  }
}
