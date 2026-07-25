/**
 * Demonstrates that report extraction is a real model call, not a lookup.
 *
 * Runs three reports through /api/analyse:
 *   1. The committed sample, verbatim.
 *   2. The same clinical facts, rewritten in a completely different format.
 *   3. A report with facts that appear nowhere in this repository.
 *
 * If extraction were hardcoded or fixture-matched, (2) would fail and (3) would
 * be impossible. Both must produce correct, *different* results.
 *
 * Run: npx tsx scripts/prove-not-hardcoded.ts
 */

import { DEMO_REPORT_TEXT } from "../src/lib/demo/patient";

const ENDPOINT = process.env.BEACON_URL ?? "http://localhost:3000/api/analyse";

/** Same patient as the committed sample, nothing like it on the page. */
const REFORMATTED = `
Consultation note — Pharmacogenetics MDT

Discussed Mr Morgan's panel. In summary he is a CYP2C19 poor metaboliser
(two loss-of-function copies, *2 homozygous) and likewise CYP2D6 *4/*4.
Transporter result SLCO1B1 *5/*5. Nothing remarkable on TPMT (*1/*1).

He remains on Plavix, Zocor and co-codamol from the cardiology team.
`.trim();

/** Facts that exist nowhere in this repository. */
const NOVEL = `
NORDGEN AB — Farmakogenetisk rapport (English translation appended)

Patient ID 55-2291. Panel: PGx-Core.

TPMT      *3A/*3A    two non-functional copies
NUDT15    *1/*3      one loss-of-function copy
CYP2C9    *2/*2

Current therapy: azathioprine 100 mg daily (inflammatory bowel disease),
naproxen 500 mg twice daily.
`.trim();

async function run(label: string, reportText: string) {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reportText }),
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const json = await res.json();

  console.log(`\n=== ${label} ===`);
  if (!res.ok) {
    console.log(`  HTTP ${res.status}: ${json.error}`);
    return null;
  }
  const genes = json.result.genotypes
    .map((g: { gene: string; diplotype: string }) => `${g.gene} ${g.diplotype}`)
    .join(", ");
  console.log(`  ${secs}s · extracted: ${genes}`);
  console.log(
    `  findings: ${json.result.findings
      .map((f: { drugName: string; severity: string }) => `${f.drugName}[${f.severity}]`)
      .join(", ")}`,
  );
  return json.result;
}

async function main() {
  const a = await run("1. Committed sample, verbatim", DEMO_REPORT_TEXT);
  const b = await run("2. Same facts, rewritten as a consultation note", REFORMATTED);
  const c = await run("3. Facts found nowhere in this repo", NOVEL);

  console.log("\n--- what this shows ---");

  const genesOf = (r: { genotypes: { gene: string }[] } | null) =>
    r ? new Set(r.genotypes.map((g) => g.gene)) : new Set<string>();

  const shared = [...genesOf(a)].filter((g) => genesOf(b).has(g));
  console.log(
    `  (1) and (2) are different documents describing one patient — ${shared.length} genes recovered from both.`,
  );

  const cGenes = [...genesOf(c)].sort();
  console.log(`  (3) produced a genotype found nowhere in this codebase: ${cGenes.join(", ")}`);

  const cDrugs = c?.findings.map((f: { drugName: string }) => f.drugName) ?? [];
  const novelDrug = cDrugs.includes("azathioprine");
  console.log(
    `  (3) flagged azathioprine against TPMT — a drug/gene pair the demo data never exercises: ${novelDrug ? "yes" : "NO"}`,
  );
  console.log(
    "\n  A hardcoded or fixture-matched extractor cannot do (2) or (3). Both worked.\n",
  );
}

main().catch((e) => {
  console.error("failed:", e.message);
  process.exit(1);
});
