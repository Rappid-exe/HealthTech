import { NextResponse } from "next/server";
import { analyse } from "@/lib/cpic/match";
import type { AnalysisResult, Genotype } from "@/lib/cpic/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Matching without extraction.
 *
 * The raw-array path calls star alleles in the browser, so by the time it gets
 * here the genotypes are already structured and no model is involved. This
 * endpoint exists so that path never has to upload a genome: it receives a
 * handful of diplotypes, not 600,000 rows.
 */
export interface MatchResponse {
  result: AnalysisResult;
}

const MAX_GENOTYPES = 64;
const MAX_MEDICATIONS = 128;

export async function POST(request: Request) {
  let body: { genotypes?: unknown; medications?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.genotypes) || body.genotypes.length === 0) {
    return NextResponse.json(
      { error: "No gene calls were supplied." },
      { status: 400 },
    );
  }
  if (body.genotypes.length > MAX_GENOTYPES) {
    return NextResponse.json({ error: "Too many gene calls." }, { status: 413 });
  }

  const genotypes: Genotype[] = [];
  for (const g of body.genotypes) {
    if (!g || typeof g !== "object") continue;
    const gene = String((g as Record<string, unknown>).gene ?? "").trim().toUpperCase();
    const diplotype = String((g as Record<string, unknown>).diplotype ?? "").trim();
    if (gene && diplotype) genotypes.push({ gene, diplotype });
  }

  if (genotypes.length === 0) {
    return NextResponse.json(
      { error: "Gene calls were malformed." },
      { status: 400 },
    );
  }

  const medications = Array.isArray(body.medications)
    ? body.medications
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, MAX_MEDICATIONS)
    : [];

  const result = analyse({ genotypes, medications });
  return NextResponse.json({ result } satisfies MatchResponse);
}
