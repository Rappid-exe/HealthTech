"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/cpic/types";
import { ReportView } from "@/components/ReportView";
import { ProvenanceFooter, type DatasetMeta } from "@/components/ProvenanceFooter";

interface AnalyseResponse {
  result: AnalysisResult;
  extraction: { genotypes: number; medications: number; notes: string[] };
}

type Status = "idle" | "running" | "done" | "error";

/** Stages the request actually passes through, shown while it is in flight. */
const STAGES = [
  "Reading the report",
  "Extracting gene calls",
  "Matching against CPIC guidelines",
  "Building your report",
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
  const resultRef = useRef<HTMLDivElement>(null);

  async function run() {
    setStatus("running");
    setError(null);
    setData(null);
    setStage(0);

    const ticker = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      1400,
    );

    try {
      const res = await fetch("/api/analyse", {
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportText(await file.text());
  }

  const busy = status === "running";

  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-5 pt-14">
        <div>
          <div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Your prescriptions,
              <br />
              checked against your genome.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
              Around a third of people carry a gene variant that changes how a common drug
              works in their body. The guidelines already exist — they just never reach the
              person taking the pills. Beacon closes that gap.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-faint">
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
              Genetic report
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReportText(demoReportText);
                  setMedicationText("");
                  setError(null);
                }}
                disabled={busy}
                className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
              >
                Load sample report
              </button>
              <label className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:border-foreground/30">
                Upload .txt
                <input
                  type="file"
                  accept=".txt,.md,text/plain"
                  onChange={onFile}
                  disabled={busy}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            disabled={busy}
            spellCheck={false}
            placeholder="Paste your pharmacogenomic report here — any format. Beacon reads the gene calls out of it."
            className="notation h-56 w-full resize-y bg-transparent px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:font-sans placeholder:text-faint disabled:opacity-60"
          />

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
            disabled={busy || !reportText.trim()}
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Analysing…" : "Check my medications"}
          </button>
          <Link
            href="/report"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent hover:decoration-accent"
          >
            Or view a worked example
          </Link>
        </div>

        {busy && (
          <div className="mt-5 rounded-xl border border-border bg-surface px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
              <span className="text-sm font-medium">{STAGES[stage]}…</span>
            </div>
            <ol className="mt-3 space-y-1 text-xs text-faint">
              {STAGES.map((s, i) => (
                <li key={s} className={i <= stage ? "text-muted" : undefined}>
                  {i < stage ? "· " : i === stage ? "› " : "  "}
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
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              Read from your report
            </p>
            <p className="mt-1 text-sm text-muted">
              {data.extraction.genotypes} gene{data.extraction.genotypes === 1 ? "" : "s"} and{" "}
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
          </div>

          <ReportView
            result={data.result}
            header={{ name: "Your medication review" }}
            recommendationCount={meta.recommendations}
          />
          <ProvenanceFooter meta={meta} />
        </section>
      )}
    </>
  );
}
