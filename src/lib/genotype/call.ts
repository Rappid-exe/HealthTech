/**
 * Star-allele calling from consumer SNP array files.
 *
 * Runs entirely in the browser. A raw 23andMe file is ~600,000 rows and about
 * 25 MB of a person's genome; there is no reason to upload it. We read the
 * handful of rows that pharmacogenomics actually keys on, derive diplotypes
 * locally, and send only those few calls to the server. The genome itself never
 * leaves the device.
 *
 * No CPIC data is imported here — this module must stay client-safe.
 */

import {
  GENE_DEFINITIONS,
  REQUIRED_RSIDS,
  type GeneDefinition,
} from "@/lib/genotype/alleles";

const BASES = new Set(["A", "C", "G", "T"]);

export interface SnpObservation {
  /** The two observed bases, uppercase. */
  alleles: [string, string];
}

export type CallStatus = "called" | "uncallable";

export interface GeneCall {
  gene: string;
  status: CallStatus;
  /** CPIC-formatted diplotype, e.g. "*1/*2". Null when uncallable. */
  diplotype: string | null;
  /** Why we could not call it, when status is uncallable. */
  reason?: string;
  /** Defining SNPs present in the file, over those the gene needs. */
  covered: number;
  required: number;
  /** Set when the call rests on incomplete marker coverage. */
  partial?: boolean;
  /** Inherent limits of array-based calling for this gene. */
  limitation?: string;
}

export interface RawFileResult {
  /** Rows parsed from the file. */
  totalRows: number;
  /** Of those, rows we actually needed. */
  matchedRows: number;
  format: "23andme" | "ancestrydna" | "unknown";
  calls: GeneCall[];
}

/**
 * Cheap check for whether pasted or uploaded text is a raw array export rather
 * than a lab report, so the UI can route it to the caller instead of the model.
 */
export function looksLikeRawDna(text: string): boolean {
  // Only the head of the file. These exports run to 25 MB, and `split` on the
  // whole thing would allocate 600,000 strings just to answer a yes/no.
  let checked = 0;
  let hits = 0;
  for (const line of text.slice(0, 20_000).split("\n")) {
    if (!line || line.startsWith("#")) continue;
    checked++;
    if (/^rs\d+[\t ,]/.test(line)) hits++;
    if (checked >= 60) break;
  }
  return checked > 0 && hits / checked > 0.5;
}

/**
 * Extracts the rows we care about.
 *
 * Handles both layouts: 23andMe writes a single `genotype` column ("AG"),
 * AncestryDNA splits it into `allele1` and `allele2`. Everything else — the
 * header comments, the other 600,000 rows — is discarded as we go, so we never
 * hold the whole genome in memory as structured data.
 */
export function parseRawDna(text: string): {
  snps: Map<string, SnpObservation>;
  totalRows: number;
  format: RawFileResult["format"];
} {
  const snps = new Map<string, SnpObservation>();
  let totalRows = 0;
  let format: RawFileResult["format"] = "unknown";

  // Walked with indexOf rather than split("\n"): a 25 MB export is ~600,000
  // lines, and materialising them all as an array costs far more memory than
  // the nine rows we keep.
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;
    const line = text.slice(pos, end).trim();
    pos = end + 1;

    if (!line || line.startsWith("#")) continue;

    const cols = line.split(/[\t,]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;

    const rsid = cols[0].toLowerCase();
    if (!rsid.startsWith("rs")) continue; // header row, or an internal "i" probe

    totalRows++;

    let a: string, b: string;
    if (cols.length >= 5) {
      format = format === "unknown" ? "ancestrydna" : format;
      a = cols[3].toUpperCase();
      b = cols[4].toUpperCase();
    } else {
      format = format === "unknown" ? "23andme" : format;
      const g = cols[3].toUpperCase();
      a = g[0] ?? "";
      b = g[1] ?? g[0] ?? "";
    }

    if (!REQUIRED_RSIDS.has(rsid)) continue;
    // No-calls ("--"), indels ("I"/"D") and blanks are treated as missing
    // rather than as data, so they downgrade coverage instead of miscalling.
    if (!BASES.has(a) || !BASES.has(b)) continue;
    // First occurrence wins. A well-formed export lists each marker once, but
    // letting a later duplicate overwrite an earlier one would make the call
    // depend on row order — silently, and only for the affected gene.
    if (snps.has(rsid)) continue;

    snps.set(rsid, { alleles: [a, b] });
  }

  return { snps, totalRows, format };
}

/**
 * Assembles a diplotype string in the order CPIC writes it.
 *
 * Star genes put the reference allele first ("*1/*2"); DPYD puts it last
 * ("c.1905+1G>A (*2A)/Reference"). The matching engine retries the reversed
 * form as a fallback, but emitting the conventional order keeps what we show
 * the user identical to what CPIC publishes.
 */
function formatDiplotype(def: GeneDefinition, called: string[]): string {
  const ref = def.referenceAllele;
  const variants = called.filter((a) => a !== ref);

  if (variants.length === 0) return `${ref}/${ref}`;

  // Two variant alleles: order by their position in the definition table so
  // the result is deterministic.
  if (variants.length === 2) {
    const order = def.alleles.map((a) => a.name);
    variants.sort((x, y) => order.indexOf(x) - order.indexOf(y));
    return `${variants[0]}/${variants[1]}`;
  }

  return ref === "Reference" ? `${variants[0]}/${ref}` : `${ref}/${variants[0]}`;
}

/** Counts copies of the variant base, or null if the genotype is off-definition. */
function countVariantCopies(
  observed: SnpObservation,
  refBase: string,
  varBase: string,
): number | null {
  let copies = 0;
  for (const allele of observed.alleles) {
    if (allele === varBase) copies++;
    else if (allele !== refBase) return null; // neither expected base
  }
  return copies;
}

export function callStarAlleles(text: string): RawFileResult {
  const { snps, totalRows, format } = parseRawDna(text);
  const calls: GeneCall[] = [];

  for (const def of GENE_DEFINITIONS) {
    const required = def.alleles.length;
    let covered = 0;
    let strandMismatch = false;

    // Which variant alleles are present, and in how many copies.
    const present: string[] = [];
    let totalCopies = 0;

    for (const allele of def.alleles) {
      const observed = snps.get(allele.rsid);
      if (!observed) continue;
      covered++;

      const copies = countVariantCopies(observed, allele.ref, allele.var);
      if (copies === null) {
        // Observed bases fall outside this definition — most likely the
        // definition is on the wrong strand. Refuse the gene rather than
        // guess; a wrong call here is worse than no call.
        strandMismatch = true;
        break;
      }
      for (let i = 0; i < copies; i++) present.push(allele.name);
      totalCopies += copies;
    }

    if (strandMismatch) {
      calls.push({
        gene: def.gene,
        status: "uncallable",
        diplotype: null,
        reason:
          "Observed bases do not match the expected variant definition for this marker.",
        covered,
        required,
        limitation: def.limitation,
      });
      continue;
    }

    if (covered === 0) {
      calls.push({
        gene: def.gene,
        status: "uncallable",
        diplotype: null,
        reason: "None of this gene's marker SNPs are on this chip.",
        covered,
        required,
        limitation: def.limitation,
      });
      continue;
    }

    // More than two variant copies implies a duplication, which an array
    // cannot resolve into a diplotype.
    if (totalCopies > 2) {
      calls.push({
        gene: def.gene,
        status: "uncallable",
        diplotype: null,
        reason:
          "More than two variant copies detected, which suggests a gene duplication an array cannot resolve.",
        covered,
        required,
        limitation: def.limitation,
      });
      continue;
    }

    const alleles =
      totalCopies === 0
        ? [def.referenceAllele, def.referenceAllele]
        : totalCopies === 1
          ? [def.referenceAllele, present[0]]
          : present;

    calls.push({
      gene: def.gene,
      status: "called",
      diplotype: formatDiplotype(def, alleles),
      covered,
      required,
      // A reference result with missing markers cannot exclude the untested
      // alleles, so it is flagged rather than presented as a clean normal.
      partial: covered < required,
      limitation: def.limitation,
    });
  }

  return {
    totalRows,
    matchedRows: snps.size,
    format,
    calls,
  };
}
