/**
 * How many people does this actually affect?
 *
 * Answered by simulation rather than assertion. Draws genotypes from CPIC's own
 * published allele frequencies, runs each simulated person through the same
 * engine the product uses, and reports what fraction receive at least one
 * actionable finding.
 *
 * Nothing here is estimated by hand: the frequencies are CPIC's, the
 * phenotype calls are CPIC's lookup tables, and the recommendations are CPIC's
 * — the simulation only decides which alleles a person is dealt.
 *
 * Run: npx tsx scripts/population-impact.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveGenotype } from "../src/lib/cpic/match";
import { buildProfile } from "../src/lib/cpic/profile";
import { diplotypeMap } from "../src/lib/cpic/data";
import type { ResolvedGenotype } from "../src/lib/cpic/types";

const N = 20_000;

interface FreqFile {
  populations: string[];
  frequencies: Record<string, Record<string, Record<string, number>>>;
}

const freq = JSON.parse(
  readFileSync(join(process.cwd(), "src", "data", "cpic", "frequencies.json"), "utf8"),
) as FreqFile;

/** Deterministic PRNG so the published figure is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a sampler for one gene in one population.
 *
 * Published frequencies never sum to 1 — rare and uncharacterised alleles are
 * missing. The remainder is assigned to the reference allele, which is the
 * conservative choice: it can only ever *understate* how many people carry
 * something actionable.
 */
function sampler(gene: string, population: string, rand: () => number) {
  const table = freq.frequencies[gene]?.[population];
  const reference = gene === "DPYD" ? "Reference" : "*1";
  if (!table) return () => reference;

  const entries = Object.entries(table).filter(([name]) => name !== reference);
  const total = entries.reduce((s, [, f]) => s + f, 0);
  const refShare = Math.max(0, 1 - total);

  return () => {
    let r = rand();
    if (r < refShare) return reference;
    r -= refShare;
    for (const [name, f] of entries) {
      if (r < f) return name;
      r -= f;
    }
    return reference;
  };
}

function run(population: string) {
  const rand = mulberry32(0xbeac07);
  const genes = Object.keys(diplotypeMap);
  const samplers = new Map(genes.map((g) => [g, sampler(g, population, rand)]));

  // Headline metric is CPIC's own ehrpriority flag on the resulting phenotype,
  // not our severity triage. Counting any avoid-or-adjust across 324 drugs
  // saturates at 100% — "use standard dose but monitor" bins as caution, so
  // even a genetically unremarkable person qualifies, and a metric everyone
  // meets measures nothing.
  let anyHighPriority = 0;
  let anyAvoid = 0;
  let unresolved = 0;
  const perGene = new Map<string, number>();
  let totalAffectedDrugs = 0;
  let peopleWithDrugs = 0;

  for (let i = 0; i < N; i++) {
    const resolved: ResolvedGenotype[] = [];
    for (const gene of genes) {
      const draw = samplers.get(gene)!;
      const a = draw();
      const b = draw();
      const r =
        resolveGenotype({ gene, diplotype: `${a}/${b}` }) ??
        resolveGenotype({ gene, diplotype: `${b}/${a}` });
      if (r) resolved.push(r);
      else unresolved++;
    }

    const flagged = resolved.filter((g) => g.priority === "high");
    if (flagged.length > 0) anyHighPriority++;
    for (const g of flagged) perGene.set(g.gene, (perGene.get(g.gene) ?? 0) + 1);

    const profile = buildProfile(resolved);
    if (profile.avoid.length > 0) {
      anyAvoid++;
      totalAffectedDrugs += profile.avoid.length;
      peopleWithDrugs++;
    }
  }

  return {
    population,
    anyHighPriorityPct: (100 * anyHighPriority) / N,
    anyAvoidPct: (100 * anyAvoid) / N,
    meanAvoidDrugs: totalAffectedDrugs / Math.max(1, peopleWithDrugs),
    unresolvedRate: unresolved / (N * genes.length),
    perGene: [...perGene.entries()]
      .map(([g, n]) => [g, (100 * n) / N] as const)
      .sort((a, b) => b[1] - a[1]),
  };
}

console.log(`Simulating ${N.toLocaleString()} people per population group.`);
console.log("Alleles drawn from CPIC published frequencies; every clinical call is CPIC's.\n");

const results = freq.populations.map(run);

console.log("Population group                 ≥1 CPIC high-priority   ≥1 drug to avoid   mean");
console.log("-".repeat(84));
for (const r of results.sort((a, b) => b.anyHighPriorityPct - a.anyHighPriorityPct)) {
  console.log(
    `  ${r.population.padEnd(30)} ${r.anyHighPriorityPct.toFixed(1).padStart(6)}%          ${r.anyAvoidPct
      .toFixed(1)
      .padStart(6)}%      ${r.meanAvoidDrugs.toFixed(1).padStart(5)}`,
  );
}

const lo = Math.min(...results.map((r) => r.anyHighPriorityPct));
const hi = Math.max(...results.map((r) => r.anyHighPriorityPct));
console.log("-".repeat(84));
console.log(
  `\n  ${lo.toFixed(0)}–${hi.toFixed(0)}% of people carry at least one gene result CPIC itself flags`,
);
console.log("  as high priority, depending on population group.\n");

const global = results.find((r) => r.population === "European") ?? results[0];
console.log(`  Most common atypical results (${global.population}):`);
for (const [gene, pct] of global.perGene.slice(0, 6)) {
  console.log(`    ${gene.padEnd(9)} ${pct.toFixed(1)}%`);
}
console.log(
  `\n  Unresolved diplotype draws: ${(100 * results[0].unresolvedRate).toFixed(1)}% (excluded).`,
);
