/**
 * End-to-end check of the live extraction path.
 *
 * Posts a report to the running dev server and prints what came back. Uses a
 * report deliberately unlike the committed sample — different vendor layout,
 * prose instead of a table, brand names, and a decoy gene we hold no table for —
 * so a pass means the model actually read it rather than pattern-matched the
 * fixture it was written against.
 *
 * Run: npx tsx scripts/test-extraction.ts
 */

const ENDPOINT = process.env.BEACON_URL ?? "http://localhost:3000/api/analyse";

const AWKWARD_REPORT = `
HelixPath Diagnostics — Pharmacogenetic Summary
Ref 8823-B  |  Collected 11 Apr 2026  |  Reported 19 Apr 2026

Dear Dr Whitfield,

Please find below the pharmacogenetic findings for your patient.

Findings by gene
----------------
Cytochrome P450 2C19 was genotyped as *2/*2. This is consistent with absent
enzyme activity.

CYP2D6: the patient carries *4/*4.

SLCO1B1 — result *5/*5 (rs4149056 homozygous).

cyp2c9 returned *1/*3.

APOE was also assessed and returned e3/e4. (Reported for completeness.)

VKORC1 -1639G>A: not assessed on this panel.

Current therapy (per referral letter): Plavix 75 mg od; Zocor 40 mg nocte;
co-codamol 30/500 prn for lower back pain; omeprazole 20 mg od; ramipril 5 mg od.

Kind regards,
HelixPath Clinical Team
`.trim();

async function main() {
  console.log(`POST ${ENDPOINT}\n`);
  const started = Date.now();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reportText: AWKWARD_REPORT }),
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const json = await res.json();

  console.log(`HTTP ${res.status} in ${elapsed}s\n`);

  if (!res.ok) {
    console.log("ERROR:", json.error);
    if (json.notes?.length) console.log("notes:", json.notes);
    process.exit(1);
  }

  const { result, extraction } = json;
  console.log(
    `Extracted ${extraction.genotypes} genotypes, ${extraction.medications} medications`,
  );
  if (extraction.notes.length) {
    console.log("Notes:");
    for (const n of extraction.notes) console.log("  ·", n);
  }

  console.log("\nGenotypes resolved:");
  for (const g of result.genotypes) {
    console.log(`  ${g.gene.padEnd(9)} ${g.diplotype.padEnd(8)} ${g.phenotype}`);
  }

  console.log(`\nFindings (${result.summary.high} high, ${result.summary.caution} caution):`);
  for (const f of result.findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.drugName} (${f.classification})`);
    console.log(`     from "${f.medicationAsWritten}"`);
    console.log(`     ${f.recommendation}`);
  }

  if (result.unmatchedMedications.length) {
    console.log("\nNo CPIC guideline:", result.unmatchedMedications.join(", "));
  }

  /* ---- assertions: what this report must produce ---- */
  console.log("\n--- checks ---");
  let failed = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failed++;
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  };

  const genes = result.genotypes.map((g: { gene: string }) => g.gene);
  check("read CYP2C19 from prose, not a table", genes.includes("CYP2C19"));
  check("normalised lowercase 'cyp2c9'", genes.includes("CYP2C9"));
  check("read SLCO1B1", genes.includes("SLCO1B1"));
  check(
    "dropped APOE (no CPIC table)",
    !genes.includes("APOE"),
    genes.includes("APOE") ? "APOE leaked through" : "",
  );
  check(
    "did not invent VKORC1 (explicitly not assessed)",
    !genes.includes("VKORC1"),
    genes.includes("VKORC1") ? "hallucinated a result" : "",
  );

  const drugs = result.findings.map((f: { drugName: string }) => f.drugName);
  check("resolved Plavix -> clopidogrel", drugs.includes("clopidogrel"));
  check("resolved Zocor -> simvastatin", drugs.includes("simvastatin"));
  check("resolved co-codamol -> codeine", drugs.includes("codeine"));
  check("flagged at least one high-severity finding", result.summary.high > 0);

  console.log(failed === 0 ? "\nAll checks passed.\n" : `\n${failed} check(s) FAILED.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nRequest failed:", e.message);
  console.error("Is the dev server running on port 3000?");
  process.exit(1);
});
