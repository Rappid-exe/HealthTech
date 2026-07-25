/** Prints the full engine output for the demo patient, to design the UI against. */
import { analyse } from "../src/lib/cpic/match";

const r = analyse({
  genotypes: [
    { gene: "CYP2C19", diplotype: "*2/*2" },
    { gene: "SLCO1B1", diplotype: "*5/*5" },
    { gene: "CYP2D6", diplotype: "*4/*4" },
    { gene: "TPMT", diplotype: "*1/*1" },
    { gene: "CYP2C9", diplotype: "*1/*2" },
  ],
  medications: [
    "Plavix 75mg",
    "simvastatin 40mg",
    "codeine 30mg",
    "lisinopril 10mg",
    "omeprazole 20mg",
  ],
});

console.log("SUMMARY", JSON.stringify(r.summary));
console.log("unmatched      :", r.unmatchedMedications);
console.log("no findings for:", r.medicationsWithoutFindings.map((m) => m.drugName));
console.log();

for (const f of r.findings) {
  console.log(`--- [${f.severity.toUpperCase()}] ${f.drugName} (${f.classification}) pop=${f.population ?? "-"}`);
  console.log("    gene:", f.genotypes.map((g) => `${g.gene} ${g.diplotype} = ${g.phenotype}`).join("; "));
  console.log("    rec :", f.recommendation);
}
