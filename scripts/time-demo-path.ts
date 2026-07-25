/**
 * Times the one-click demo path exactly as the browser runs it.
 *
 * The whole demo is sixty seconds. This path is the opening beat, so it needs
 * to be perceptibly instant — anything over about a second reads as a wait on
 * stage and costs a disproportionate share of the budget.
 *
 * Run: npx tsx scripts/time-demo-path.ts
 */

import { callStarAlleles } from "../src/lib/genotype/call";

const BASE = process.env.BEACON_URL ?? "http://localhost:3000";

const SAMPLE_MEDICATIONS = [
  "Plavix 75mg once daily",
  "simvastatin 40mg nightly",
  "codeine 30mg as needed",
  "omeprazole 20mg once daily",
  "lisinopril 10mg once daily",
];

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/sample-23andme.txt`);
  if (!res.ok) throw new Error(`sample fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const fetchMs = Date.now() - t0;

  const t1 = Date.now();
  const called = callStarAlleles(text);
  const callMs = Date.now() - t1;

  const t2 = Date.now();
  const matched = await fetch(`${BASE}/api/match`, {
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
  const matchMs = Date.now() - t2;
  const total = Date.now() - t0;

  console.log(`  fetch sample   ${String(fetchMs).padStart(5)} ms  (${(text.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  call alleles   ${String(callMs).padStart(5)} ms  (in-browser, ${called.matchedRows} markers)`);
  console.log(`  match + render ${String(matchMs).padStart(5)} ms  (server, no model)`);
  console.log(`  ------------------------`);
  console.log(`  TOTAL          ${String(total).padStart(5)} ms\n`);

  const r = json.result;
  console.log(`  ${r.summary.high} high · ${r.summary.caution} caution · ${r.summary.standard} standard`);
  console.log(`  lead finding: ${r.findings[0]?.drugName} — ${r.findings[0]?.severity}`);
  for (const f of r.findings) {
    console.log(`    [${f.severity.toUpperCase().padEnd(8)}] ${f.drugName}`);
  }

  const budget = 1500;
  const ok = total < budget && r.summary.high === 3;
  console.log(
    `\n  ${ok ? "PASS" : "FAIL"} — ${total} ms against a ${budget} ms budget, ${r.summary.high} high-severity findings (want 3)`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("failed:", e.message);
  process.exit(1);
});
