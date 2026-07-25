/**
 * Seeds CPIC's published allele frequencies.
 *
 * Used to answer "how many people does this actually affect" by simulation
 * rather than assertion — see scripts/population-impact.ts.
 *
 * Run: node scripts/seed-frequencies.mjs
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const API = "https://api.cpicpgx.org/v1";
const OUT = join(process.cwd(), "src", "data", "cpic", "frequencies.json");

async function main() {
  const genes = Object.keys(
    JSON.parse(
      await readFile(
        join(process.cwd(), "src", "data", "cpic", "diplotype-phenotype.json"),
        "utf8",
      ),
    ),
  );

  const url =
    `${API}/population_frequency_view` +
    `?select=genesymbol,name,population_group,freq_weighted_avg` +
    `&freq_weighted_avg=not.is.null` +
    `&genesymbol=in.(${genes.join(",")})&limit=20000`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();

  // gene -> population -> { allele: frequency }
  const out = {};
  for (const r of rows) {
    const f = Number(r.freq_weighted_avg);
    if (!Number.isFinite(f) || f <= 0) continue;
    ((out[r.genesymbol] ??= {})[r.population_group] ??= {})[r.name] = f;
  }

  const populations = [...new Set(rows.map((r) => r.population_group))].sort();

  await writeFile(
    OUT,
    JSON.stringify(
      {
        source: "CPIC population_frequency_view (weighted averages)",
        retrievedAt: new Date().toISOString(),
        populations,
        genes: Object.keys(out).sort(),
        frequencies: out,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${OUT}`);
  console.log(`  ${Object.keys(out).length} genes · ${populations.length} populations`);
  for (const g of Object.keys(out).sort()) {
    const pops = Object.keys(out[g]).length;
    const alleles = new Set(Object.values(out[g]).flatMap((p) => Object.keys(p))).size;
    console.log(`    ${g.padEnd(9)} ${String(alleles).padStart(3)} alleles across ${pops} populations`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
