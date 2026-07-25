"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/cpic/types";
import { ReportView } from "@/components/ReportView";
import { ProvenanceFooter, type DatasetMeta } from "@/components/ProvenanceFooter";
import { GeneCallPanel } from "@/components/GeneCallPanel";
import { ClinicalBrief } from "@/components/ClinicalBrief";
import { PrintButton } from "@/components/PrintButton";
import { HelixLoader } from "@/components/HelixLoader";
import { callStarAlleles, looksLikeRawDna, type RawFileResult } from "@/lib/genotype/call";

interface AnalyseResponse {
  result: AnalysisResult;
  /** Present only on the report path — /api/match does no extraction. */
  extraction?: { genotypes: number; medications: number; notes: string[] };
}

type Status = "idle" | "running" | "done" | "error";

/**
 * The two input paths differ enough to warrant separate copy. A lab report goes
 * through the model; a raw array file is decoded in the browser and never
 * uploaded, so claiming to "read the report" there would be untrue.
 */
const STAGES_REPORT = [
  "Reading the report",
  "Extracting gene calls",
  "Matching against CPIC guidelines",
  "Building your report",
];
const STAGES_RAW = ["Matching against CPIC guidelines", "Building your report"];

/**
 * The medication list paired with the sample genome for the one-click path.
 * Chosen to exercise the full range of outcomes rather than only alarms: three
 * high-severity conflicts, one dose caution, and one drug with no
 * pharmacogenomic guideline at all.
 */
const SAMPLE_MEDICATIONS = [
  "Plavix 75mg once daily",
  "simvastatin 40mg nightly",
  "codeine 30mg as needed",
  "omeprazole 20mg once daily",
  "lisinopril 10mg once daily",
];

export function UploadFlow({
  demoReportText,
  meta,
}: {
  demoReportText: string;
  meta: DatasetMeta;
}) {
  const [reportText, setReportText] = useState("");
  const [medicationText, setMedicationText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyseResponse | null>(null);
  const [raw, setRaw] = useState<RawFileResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  /** Same findings, two audiences. The contrast is the product. */
  const [view, setView] = useState<"patient" | "clinical">("patient");
  const resultRef = useRef<HTMLDivElement>(null);

  const stages = raw ? STAGES_RAW : STAGES_REPORT;

  function reset() {
    setError(null);
    setData(null);
    setStatus("idle");
  }

  async function run() {
    setStatus("running");
    setError(null);
    setData(null);
    setStage(0);

    const ticker = setInterval(
      () => setStage((s) => Math.min(s + 1, stages.length - 1)),
      raw ? 700 : 1400,
    );

    const medications = medicationText
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      // The raw-array path already holds structured calls, so it skips
      // extraction entirely and posts only the diplotypes.
      const res = raw
        ? await fetch("/api/match", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              genotypes: raw.calls
                .filter((c) => c.status === "called" && c.diplotype)
                .map((c) => ({ gene: c.gene, diplotype: c.diplotype })),
              medications,
            }),
          })
        : await fetch("/api/analyse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reportText, medicationText }),
          });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Analysis failed.");
        setStatus("error");
        return;
      }
      setData(json as AnalyseResponse);
      setStatus("done");
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setStatus("error");
    } finally {
      clearInterval(ticker);
    }
  }

  /**
   * The one-click path: fetch the sample genome, call it locally, and match —
   * all without a file picker or a model call. Runs in well under a second,
   * which matters when the whole demo is sixty seconds long.
   */
  async function runSample() {
    setStatus("running");
    setError(null);
    setData(null);
    setStage(0);
    setFileName("sample-23andme.txt");
    setMedicationText(SAMPLE_MEDICATIONS.join("\n"));

    try {
      const res = await fetch("/sample-23andme.txt");
      if (!res.ok) throw new Error("sample unavailable");
      const called = callStarAlleles(await res.text());
      setRaw(called);

      const matched = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          genotypes: called.calls
            .filter((c) => c.status === "called" && c.diplotype)
            .map((c) => ({ gene: c.gene, diplotype: c.diplotype })),
          medications: SAMPLE_MEDICATIONS,
        }),
      });
      const json = await matched.json();
      if (!matched.ok) {
        setError(json.error ?? "Analysis failed.");
        setStatus("error");
        return;
      }
      setData(json as AnalyseResponse);
      setStatus("done");
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch {
      setError("Could not load the sample genome.");
      setStatus("error");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);

    const text = await file.text();

    // A raw export runs to tens of megabytes. Putting it in the textarea would
    // lock the browser, and uploading it would be a genome the server has no
    // business holding — so it is decoded here and discarded.
    if (looksLikeRawDna(text)) {
      const called = callStarAlleles(text);
      if (called.calls.every((c) => c.status !== "called")) {
        setError(
          "This file was read, but none of the pharmacogenomic markers we need are on this chip.",
        );
        setStatus("error");
        setRaw(null);
        return;
      }
      setRaw(called);
      setReportText("");
      return;
    }

    setRaw(null);
    setReportText(text);
  }

  function clearFile() {
    setRaw(null);
    setFileName(null);
    reset();
  }

  const busy = status === "running";

  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-5 pt-14">
        <div>
          <div>
            <h1 className="display text-balance text-[2.6rem] leading-[1.08] sm:text-[3.4rem]">
              Your prescriptions,
              <br />
              checked against your genome.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
              Around a third of people carry a gene variant that changes how a common drug
              works in their body. The guidelines already exist — they just never reach the
              person taking the pills. Beacon closes that gap.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runSample}
                disabled={busy}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(11,94,91,0.25)] transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {busy ? "Reading genome…" : "See it work →"}
              </button>
              <span className="text-sm text-muted">
                Runs on a sample genome. Nothing to upload.
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-faint">
              <span>
                <span className="font-medium text-foreground/70">
                  {meta.recommendations.toLocaleString()}
                </span>{" "}
                prescribing recommendations
              </span>
              <span>
                <span className="font-medium text-foreground/70">{meta.genes}</span> genes
              </span>
              <span>
                <span className="font-medium text-foreground/70">{meta.drugs}</span> drugs
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Input */}
      <section className="mx-auto mt-10 w-full max-w-3xl px-5">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">
              {raw ? "Raw DNA file" : "Genetic report"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {raw ? (
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={busy}
                  className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
                >
                  Use a different file
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReportText(demoReportText);
                      setMedicationText("");
                      reset();
                    }}
                    disabled={busy}
                    className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
                  >
                    Load sample report
                  </button>
                  <label className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:border-foreground/30">
                    Upload file
                    <input
                      type="file"
                      accept=".txt,.csv,.md,text/plain,text/csv"
                      onChange={onFile}
                      disabled={busy}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {raw ? (
            <div className="px-4 py-3">
              {fileName && (
                <p className="notation mb-2 text-xs text-muted">{fileName}</p>
              )}
              <GeneCallPanel data={raw} />
            </div>
          ) : (
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              disabled={busy}
              spellCheck={false}
              placeholder="Paste your pharmacogenomic report here — any format. Beacon reads the gene calls out of it.&#10;&#10;Or upload your 23andMe or AncestryDNA raw data file: it is decoded on your device, and only the gene calls are sent."
              className="notation h-56 w-full resize-y bg-transparent px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:font-sans placeholder:text-faint disabled:opacity-60"
            />
          )}

          <div className="border-t border-border px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">
              Medications{" "}
              <span className="font-normal normal-case tracking-normal">
                — optional, if not already in the report
              </span>
            </span>
          </div>
          <textarea
            value={medicationText}
            onChange={(e) => setMedicationText(e.target.value)}
            disabled={busy}
            placeholder="Plavix 75mg&#10;simvastatin 40mg&#10;codeine 30mg as needed"
            className="h-24 w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-faint disabled:opacity-60"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={busy || (!raw && !reportText.trim())}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(11,94,91,0.25)] transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Analysing…" : "Check my medications"}
          </button>
          <Link
            href="/report"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent hover:decoration-accent"
          >
            Or view a worked example
          </Link>
          {!raw && (
            <a
              href="/sample-23andme.txt"
              download
              className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent hover:decoration-accent"
            >
              Download a sample DNA file
            </a>
          )}
        </div>

        {busy && (
          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-surface">
            <HelixLoader label={stages[stage]} />
            <ol className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-border bg-accent-tint px-5 py-2.5 text-xs">
              {stages.map((s, i) => (
                <li
                  key={s}
                  className={
                    i < stage
                      ? "text-muted"
                      : i === stage
                        ? "font-medium text-accent"
                        : "text-faint"
                  }
                >
                  {i < stage ? "✓ " : ""}
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}

        {status === "error" && error && (
          <div className="mt-5 rounded-xl border border-[var(--high-border)] bg-[var(--high-surface)] px-5 py-4">
            <p className="text-sm font-medium text-[var(--high)]">{error}</p>
            <p className="mt-1 text-sm text-muted">
              The{" "}
              <Link href="/report" className="underline underline-offset-2">
                worked example
              </Link>{" "}
              runs entirely on committed data and needs no API access.
            </p>
          </div>
        )}
      </section>

      {/* Result */}
      {status === "done" && data && (
        <section ref={resultRef} className="mx-auto mt-12 w-full max-w-3xl px-5 pb-8">
          <div className="mb-6 border-t border-border pt-6">
            {raw ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                  Called from your DNA file
                </p>
                <p className="mt-1 text-sm text-muted">
                  {raw.calls.filter((c) => c.status === "called").length} genes called from{" "}
                  {raw.matchedRows} markers, on your device. No model was involved in
                  reading this file.
                </p>
              </>
            ) : data.extraction ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                  Read from your report
                </p>
                <p className="mt-1 text-sm text-muted">
                  {data.extraction.genotypes} gene
                  {data.extraction.genotypes === 1 ? "" : "s"} and{" "}
                  {data.extraction.medications} medication
                  {data.extraction.medications === 1 ? "" : "s"} extracted.
                </p>
                {data.extraction.notes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {data.extraction.notes.map((n, i) => (
                      <li key={i}>· {n}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>

          {/* Both artifacts come off the same findings, so they cannot drift.
              Reachable from the primary flow rather than only from the worked
              example — and rendered from what was actually analysed, not from
              the demo patient. */}
          <div className="no-print mb-6 flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border-strong">
              {(["patient", "clinical"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    view === v
                      ? "bg-accent text-white"
                      : "bg-surface text-muted hover:bg-accent-tint hover:text-accent"
                  }`}
                >
                  {v === "patient" ? "Patient view" : "Physician brief"}
                </button>
              ))}
            </div>
            {view === "clinical" && <PrintButton />}
            {view === "clinical" && (
              <span className="ml-auto text-xs text-faint">
                Formatted for A4 · one page
              </span>
            )}
          </div>

          {view === "patient" ? (
            <>
              <ReportView
                result={data.result}
                header={{ name: "Your medication review" }}
                recommendationCount={meta.recommendations}
              />
              <ProvenanceFooter meta={meta} />
            </>
          ) : (
            <div className="text-[13px] leading-snug">
              <ClinicalBrief
                result={data.result}
                subject={{
                  source: raw
                    ? `${fileName ?? "raw array file"} — genotypes called on device`
                    : "Uploaded pharmacogenomic report",
                }}
                meta={meta}
                generatedOn={new Date().toISOString().slice(0, 10)}
              />
            </div>
          )}
        </section>
      )}
    </>
  );
}
