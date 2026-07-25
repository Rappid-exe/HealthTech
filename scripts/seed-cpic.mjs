/**
 * Seeds the local CPIC clinical dataset.
 *
 * Pulls the Clinical Pharmacogenetics Implementation Consortium (CPIC) tables
 * from their public PostgREST API and reshapes them into compact lookup files
 * under src/data/cpic/.
 *
 * We commit the output so the app never calls CPIC at runtime. Every clinical
 * claim the product makes is a verbatim row from these files.
 *
 * Run: node scripts/seed-cpic.mjs
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.cpicpgx.org/v1";
const OUT = join(process.cwd(), "src", "data", "cpic");
const PAGE = 1000;

/**
 * Genes we surface. CPIC publishes diplotype tables for 19 genes; we drop four
 * of them (RYR1, G6PD, CFTR, NAT2) because their diplotype spaces are
 * combinatorially enormous - RYR1 alone is 60k rows - and they concern
 * anaesthesia and metabolic screening rather than the everyday prescribing
 * decisions this product is about.
 */
const GENES = [
  "CYP2C19", // clopidogrel, SSRIs, PPIs
  "CYP2D6", // codeine, tamoxifen, many antidepressants
  "CYP2C9", // warfarin, NSAIDs, phenytoin
  "SLCO1B1", // simvastatin and other statins
  "TPMT", // thiopurines
  "NUDT15", // thiopurines
  "DPYD", // fluorouracil, capecitabine
  "CYP3A5", // tacrolimus
  "UGT1A1", // irinotecan, atazanavir
  "CYP2B6", // efavirenz
  "MT-RNR1", // aminoglycosides
  "ABCG2", // rosuvastatin
  "CACNA1S", // volatile anaesthetics
  "HLA-A", // carbamazepine
  "HLA-B", // abacavir, allopurinol, carbamazepine
];

/**
 * CPIC's ehrpriority field is their own severity triage, but the raw values are
 * inconsistent - "Priority/High Risk" vs "Priority/High-Risk", and
 * "Normal/Routine/Low Risk" vs "Normal/Routine/ Low Risk" with a stray space.
 * Note the ordering: "Abnormal/Priority/High Risk" contains the substring
 * "normal", so the high-risk test has to run first.
 */
function normalisePriority(raw) {
  if (!raw) return "unknown";
  const v = String(raw).trim();
  if (/high|priority|abnormal/i.test(v)) return "high";
  if (/normal|routine|low/i.test(v)) return "normal";
  return "unknown";
}

async function fetchAll(table, query = "") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${API}/${table}?select=*${query}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${table} -> HTTP ${res.status} ${res.statusText}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function dump(name, value) {
  const json = JSON.stringify(value);
  await writeFile(join(OUT, `${name}.json`), json, "utf8");
  const kb = Math.round(json.length / 1024);
  const n = Array.isArray(value) ? value.length : Object.keys(value).length;
  console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)} entries ${String(kb).padStart(5)} KB`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const geneFilter = `&genesymbol=in.(${GENES.join(",")})`;

  console.log(`Seeding CPIC dataset -> ${OUT}\n`);

  const [drugs, guidelines, recommendations, diplotypes] = await Promise.all([
    fetchAll("drug"),
    fetchAll("guideline"),
    fetchAll("recommendation"),
    fetchAll("diplotype", geneFilter),
  ]);

  // Diplotype -> { phenotype, joinKey }, as a nested map. This is the hot
  // lookup path: given "CYP2C19 *2/*2" we need its phenotype in one hop.
  //
  // phenotype and joinKey are deliberately separate. Most genes join to the
  // recommendation table on the phenotype name ("Poor Metabolizer"), but CYP2D6
  // joins on a total activity score ("0.25", ">=3.0"). Matching on generesult
  // alone would silently drop every CYP2D6 recommendation - which is a third of
  // the table, and covers codeine and the antidepressants.
  const diplotypeMap = {};
  // Phenotype-level clinical narrative, deduplicated. description and
  // consultationtext are functions of the phenotype, not the diplotype, so
  // storing them per-diplotype would repeat the same paragraph thousands of
  // times (17 MB vs the ~200 KB this produces).
  const phenotypes = {};

  for (const row of diplotypes) {
    const gene = row.genesymbol;
    const phenotype = row.generesult;
    if (!gene || !row.diplotype || !phenotype) continue;

    const joinKey = row.lookupkey?.[gene] ?? phenotype;
    (diplotypeMap[gene] ??= {})[row.diplotype] = { p: phenotype, k: joinKey };

    const key = `${gene}|${phenotype}`;
    if (!phenotypes[key]) {
      phenotypes[key] = {
        gene,
        phenotype,
        priority: normalisePriority(row.ehrpriority),
        description: row.description ?? null,
        consultationText: row.consultationtext ?? null,
      };
    }
  }

  // CPIC writes absent free-text fields as the literal string "n/a" rather than
  // null, which renders as a stray "n/a" in the UI if taken at face value.
  const clean = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === "" || /^n\/?a$/i.test(s) ? null : s;
  };

  // Trim recommendations to the fields the matching engine reads.
  const recs = recommendations.map((r) => ({
    id: r.id,
    guidelineId: r.guidelineid,
    drugId: r.drugid,
    phenotypes: r.phenotypes ?? {},
    lookupKey: r.lookupkey ?? {},
    implications: r.implications ?? {},
    recommendation: r.drugrecommendation,
    classification: clean(r.classification) ?? "Unclassified",
    population: clean(r.population),
    comments: clean(r.comments),
  }));

  const drugList = drugs.map((d) => ({
    drugId: d.drugid,
    name: d.name,
    guidelineId: d.guidelineid ?? null,
    rxNormId: d.rxnormid ?? null,
  }));

  const guidelineList = guidelines.map((g) => ({
    id: g.id,
    name: g.name,
    url: g.url,
    genes: g.genes ?? [],
  }));

  await dump("diplotype-phenotype", diplotypeMap);
  await dump("phenotypes", phenotypes);
  await dump("recommendations", recs);
  await dump("drugs", drugList);
  await dump("guidelines", guidelineList);

  await writeFile(
    join(OUT, "meta.json"),
    JSON.stringify(
      {
        source: "Clinical Pharmacogenetics Implementation Consortium (CPIC)",
        api: API,
        homepage: "https://cpicpgx.org",
        seededAt: new Date().toISOString(),
        curatedGenes: GENES,
        counts: {
          genes: Object.keys(diplotypeMap).length,
          diplotypes: Object.values(diplotypeMap).reduce(
            (n, m) => n + Object.keys(m).length,
            0,
          ),
          phenotypes: Object.keys(phenotypes).length,
          recommendations: recs.length,
          drugs: drugList.length,
          guidelines: guidelineList.length,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
