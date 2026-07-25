/**
 * Validates the matching engine against the real CPIC dataset.
 *
 * Run: npx tsx scripts/verify-engine.ts
 */

import { analyse, triage, resolveMedication, resolveGenotype } from "../src/lib/cpic/match";
import { recommendations, cpicMeta, supportedGenes, drugsByName } from "../src/lib/cpic/data";
import { lookupPlainEnglish, plainEnglishMeta } from "../src/lib/plain-english";
import type { Severity } from "../src/lib/cpic/types";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("CPIC dataset:", JSON.stringify(cpicMeta.counts));
console.log("Genes:", supportedGenes.join(", "));

/* ---------------------------------------------------------------- */
console.log("\n=== 1. Genotype resolution ===");
const cyp2c19 = resolveGenotype({ gene: "CYP2C19", diplotype: "*2/*2" });
check("CYP2C19 *2/*2 resolves", cyp2c19 !== null);
check("  -> Poor Metabolizer", cyp2c19?.phenotype === "Poor Metabolizer", cyp2c19?.phenotype);
check("  -> flagged high priority by CPIC", cyp2c19?.priority === "high", cyp2c19?.priority);

const swapped = resolveGenotype({ gene: "CYP2C19", diplotype: "*17/*1" });
check("reversed diplotype *17/*1 resolves", swapped !== null, swapped?.phenotype ?? "null");

const d6 = resolveGenotype({ gene: "CYP2D6", diplotype: "*1/*1" });
check("CYP2D6 joins on activity score", d6?.joinKey === "2.0", `joinKey=${d6?.joinKey}`);

/* ---------------------------------------------------------------- */
console.log("\n=== 2. Medication resolution ===");
const medCases: Array<[string, string | null]> = [
  ["Plavix 75mg", "clopidogrel"],
  ["clopidogrel", "clopidogrel"],
  ["PLAVIX 75 mg tablet PO daily", "clopidogrel"],
  ["Zocor 40mg nightly", "simvastatin"],
  ["Seroxat 20mg", "paroxetine"],
  ["co-codamol", "codeine"],
  ["Nurofen 200mg", "ibuprofen"],
  ["lisinopril 10mg", null], // no CPIC guideline - must not false-positive
  ["vitamin D", null],
];
for (const [input, expected] of medCases) {
  const got = resolveMedication(input)?.drugName ?? null;
  check(`"${input}" -> ${expected ?? "no match"}`, got === expected, `got ${got ?? "null"}`);
}

/* ---------------------------------------------------------------- */
console.log("\n=== 3. The headline case: CYP2C19 poor metaboliser on clopidogrel ===");
const result = analyse({
  genotypes: [
    { gene: "CYP2C19", diplotype: "*2/*2" },
    { gene: "SLCO1B1", diplotype: "*5/*5" },
    { gene: "CYP2D6", diplotype: "*4/*4" },
  ],
  medications: ["Plavix 75mg", "simvastatin 40mg", "codeine 30mg", "lisinopril 10mg"],
});

check("produces findings", result.findings.length > 0, `${result.findings.length} findings`);
check("has at least one high-severity finding", result.summary.high > 0, `high=${result.summary.high}`);
check(
  "lisinopril reported as unmatched, not silently dropped",
  result.unmatchedMedications.includes("lisinopril 10mg"),
);

const top = result.findings[0];
console.log("\n  --- top finding as the UI will render it ---");
console.log("  severity      :", top.severity);
console.log("  drug          :", top.drugName, `(written as "${top.medicationAsWritten}")`);
console.log("  genotype      :", top.genotypes.map((g) => `${g.gene} ${g.diplotype} = ${g.phenotype}`).join("; "));
console.log("  classification:", top.classification);
console.log("  population    :", top.population);
console.log("  recommendation:", top.recommendation);
console.log("  implication   :", Object.values(top.implications)[0]);
console.log("  guideline     :", top.guideline?.url);

check("top finding is high severity", top.severity === "high");
check("top finding is a Strong recommendation", top.classification === "Strong");
check("top finding cites a guideline URL", Boolean(top.guideline?.url));

console.log("\n  --- severity spread across all findings ---");
const spread: Record<string, number> = {};
for (const f of result.findings) {
  const k = `${f.severity}/${f.classification}`;
  spread[k] = (spread[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(spread).sort()) console.log(`   ${String(v).padStart(3)}  ${k}`);

/* ---------------------------------------------------------------- */
console.log("\n=== 4. Triage sanity across all 2,115 CPIC recommendations ===");
const buckets: Record<Severity, string[]> = { high: [], caution: [], standard: [], unknown: [] };
for (const rec of recommendations) {
  buckets[triage(rec)].push(rec.recommendation ?? "");
}
for (const [sev, list] of Object.entries(buckets) as Array<[Severity, string[]]>) {
  const pct = ((list.length / recommendations.length) * 100).toFixed(1);
  console.log(`\n  ${sev.toUpperCase()} - ${list.length} (${pct}%)`);
  const uniq = [...new Set(list)].slice(0, 3);
  for (const t of uniq) console.log(`     "${t.slice(0, 88)}"`);
}

console.log("\n  --- guarding against known traps ---");
const reassuring = recommendations.find((r) =>
  /^no reason to avoid/i.test(r.recommendation ?? ""),
);
check(
  '"No reason to avoid..." is NOT high severity',
  reassuring ? triage(reassuring) !== "high" : false,
  reassuring ? triage(reassuring) : "not found",
);

const avoidWithAlternative = recommendations.find((r) =>
  /^avoid .*standard dose/i.test(r.recommendation ?? ""),
);
check(
  '"Avoid X... use Y at standard dose" IS high severity',
  avoidWithAlternative ? triage(avoidWithAlternative) === "high" : false,
  avoidWithAlternative ? triage(avoidWithAlternative) : "not found",
);

const unknownPct = (buckets.unknown.length / recommendations.length) * 100;
check("unknown bucket stays small (<15%)", unknownPct < 15, `${unknownPct.toFixed(1)}%`);

/* ---------------------------------------------------------------- */
/* ---------------------------------------------------------------- */
console.log("\n=== 5. Plain-English layer ===");

// The lookup key is derived independently in the generator script and in the
// app. If those ever drift apart nothing throws — every lookup simply misses
// and the patient view silently reverts to prescriber language, which is the
// exact problem this layer was added to fix.
const translatable = recommendations.filter((r) => (r.recommendation ?? "").trim());
let covered = 0;
for (const rec of translatable) {
  if (lookupPlainEnglish(rec.recommendation, rec.implications ?? {})) covered++;
}
const pct = (100 * covered) / translatable.length;
check(
  "every CPIC recommendation has a plain-English restatement",
  pct === 100,
  `${covered}/${translatable.length} (${pct.toFixed(1)}%)`,
);

check(
  "translations are committed, not generated per request",
  plainEnglishMeta.count > 0,
  `${plainEnglishMeta.count} entries, generated ${plainEnglishMeta.generatedAt.slice(0, 10)}`,
);

// Every finding shown to a user must carry both registers: ours and CPIC's.
const withBoth = result.findings.filter(
  (f) => f.plainEnglish && f.recommendation.trim(),
);
check(
  "findings carry plain English AND the verbatim guideline",
  withBoth.length === result.findings.length,
  `${withBoth.length}/${result.findings.length}`,
);

/* ---------------------------------------------------------------- */
console.log("\n=== 6. Full drug-response profile ===");

const profile = result.profile;
console.log(
  `  ${profile.total} drugs affected · ${profile.avoid.length} avoid · ${profile.adjust.length} adjust`,
);

check(
  "profile covers far more drugs than were submitted",
  profile.total > result.summary.medicationsReviewed * 3,
  `${profile.total} vs ${result.summary.medicationsReviewed} submitted`,
);

// The reason this feature exists. A CYP2D6 poor metaboliser told only that
// codeine fails will be offered tramadol next; it fails identically. If this
// check breaks, the section has lost the insight and is just a longer list.
const traps = profile.avoid.filter(
  (e) => !e.currentlyTaking && e.sameMechanismAs.length > 0,
);
const tramadol = traps.find((e) => e.drugName === "tramadol");
check("detects shared-mechanism substitutes", traps.length > 0, `${traps.length} found`);
check(
  "flags tramadol as failing for the same reason as codeine",
  Boolean(tramadol && tramadol.sameMechanismAs.includes("codeine")),
  tramadol ? `via ${tramadol.genes.join(",")}` : "tramadol not flagged",
);

check(
  "drugs already taken are marked, not double-reported as new risks",
  profile.avoid.some((e) => e.currentlyTaking),
);

// Every profile entry must be traceable, exactly like a finding.
const untraceable = [...profile.avoid, ...profile.adjust].filter(
  (e) => !e.recommendation?.trim(),
);
check(
  "every profile entry carries its verbatim CPIC recommendation",
  untraceable.length === 0,
  `${untraceable.length} without text`,
);

const ungrouped = profile.grouped.reduce((n, g) => n + g.entries.length, 0);
check(
  "grouping loses nothing",
  ungrouped === profile.avoid.length + profile.adjust.length,
  `${ungrouped} grouped vs ${profile.avoid.length + profile.adjust.length} actionable`,
);

// "What can I take instead" — the unaffected side of each class.
const statins = profile.grouped.find((g) => g.className === "Cholesterol");
check(
  "statin class offers the clinically correct unaffected options",
  Boolean(
    statins?.unaffected.includes("rosuvastatin") &&
      statins.unaffected.includes("atorvastatin"),
  ),
  statins ? statins.unaffected.join(", ") : "no cholesterol group",
);

// A drug cannot be both flagged and unaffected — that would be a direct
// contradiction on screen, in the same panel.
const flaggedNames = new Set(
  [...profile.avoid, ...profile.adjust].map((e) => e.drugName.toLowerCase()),
);
const contradictions = profile.grouped.flatMap((g) =>
  g.unaffected.filter((d) => flaggedNames.has(d.toLowerCase())),
);
check(
  "no drug appears as both affected and unaffected",
  contradictions.length === 0,
  contradictions.join(", "),
);

// Claiming "your genotype doesn't change the advice" for a drug CPIC has never
// assessed would be asserting a check we never ran.
const uncovered = profile.grouped.flatMap((g) =>
  g.unaffected.filter((d) => !drugsByName.has(d.toLowerCase())),
);
check(
  "unaffected lists only drugs CPIC actually covers",
  uncovered.length === 0,
  uncovered.join(", "),
);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
