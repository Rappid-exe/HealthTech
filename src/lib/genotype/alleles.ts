/**
 * Star-allele definitions for calling from consumer SNP arrays.
 *
 * ---------------------------------------------------------------------------
 * Orientation
 * ---------------------------------------------------------------------------
 * Star alleles are defined against the *gene's* coding sequence, but 23andMe
 * and AncestryDNA report against the *reference plus strand*. For genes that
 * sit on the minus strand — CYP2D6, DPYD, NUDT15 — the two disagree, and
 * transcribing a definition straight out of a pharmacogenomics paper without
 * complementing it produces a call that is confidently backwards.
 *
 * So `ref` and `var` below are written as the array actually prints them, in
 * plus-strand orientation, not as the coding change is conventionally cited.
 * The `codingChange` field keeps the conventional notation for traceability.
 *
 * `callStarAlleles` additionally refuses to call any gene where an observed
 * genotype contains an allele outside {ref, var}. If a definition here is
 * wrong-stranded, the observed pair (say G/A against an expected C/T) fails
 * that check and the gene is reported as uncallable rather than miscalled.
 * A visible refusal is a survivable bug; a silent wrong answer is not.
 */

export interface AlleleDefinition {
  /** Star allele name as CPIC writes it, e.g. "*2". */
  name: string;
  rsid: string;
  /** Reference base, plus-strand, as the array reports it. */
  ref: string;
  /** Variant base that defines this allele, plus-strand. */
  var: string;
  /** Conventional coding notation, for traceability. */
  codingChange: string;
}

export interface GeneDefinition {
  gene: string;
  /** Strand the gene sits on, relative to the reference. */
  strand: "+" | "-";
  /**
   * What CPIC calls the normal-function allele for this gene. Star genes use
   * "*1"; DPYD uses "Reference". Emitting the wrong one produces a diplotype
   * string that matches no row and silently yields no findings.
   */
  referenceAllele: string;
  alleles: AlleleDefinition[];
  /**
   * Set when array data cannot fully characterise the gene, with the reason.
   * Surfaced to the user rather than hidden — an array cannot see copy-number
   * variation, and CYP2D6 in particular is defined largely by it.
   */
  limitation?: string;
}

export const GENE_DEFINITIONS: GeneDefinition[] = [
  {
    gene: "CYP2C19",
    strand: "+",
    referenceAllele: "*1",
    alleles: [
      { name: "*2", rsid: "rs4244285", ref: "G", var: "A", codingChange: "c.681G>A" },
      { name: "*3", rsid: "rs4986893", ref: "G", var: "A", codingChange: "c.636G>A" },
      { name: "*17", rsid: "rs12248560", ref: "C", var: "T", codingChange: "c.-806C>T" },
    ],
  },
  {
    gene: "CYP2C9",
    strand: "+",
    referenceAllele: "*1",
    alleles: [
      { name: "*2", rsid: "rs1799853", ref: "C", var: "T", codingChange: "c.430C>T" },
      { name: "*3", rsid: "rs1057910", ref: "A", var: "C", codingChange: "c.1075A>C" },
    ],
  },
  {
    gene: "SLCO1B1",
    strand: "+",
    referenceAllele: "*1",
    alleles: [
      { name: "*5", rsid: "rs4149056", ref: "T", var: "C", codingChange: "c.521T>C" },
    ],
  },
  {
    gene: "NUDT15",
    // Minus-strand gene: the coding c.415C>T prints as G>A on the array.
    strand: "-",
    referenceAllele: "*1",
    alleles: [
      { name: "*3", rsid: "rs116855232", ref: "G", var: "A", codingChange: "c.415C>T" },
    ],
  },
  {
    gene: "DPYD",
    // Minus-strand gene: coding c.1905+1G>A prints as C>T.
    strand: "-",
    referenceAllele: "Reference",
    alleles: [
      {
        name: "c.1905+1G>A (*2A)",
        rsid: "rs3918290",
        ref: "C",
        var: "T",
        codingChange: "c.1905+1G>A (*2A)",
      },
    ],
    limitation:
      "Only the most common no-function variant is on consumer arrays. A normal result here does not exclude rarer DPYD variants.",
  },
  {
    gene: "CYP2D6",
    // Minus-strand gene: coding c.1846G>A prints as C>T.
    strand: "-",
    referenceAllele: "*1",
    alleles: [
      { name: "*4", rsid: "rs3892097", ref: "C", var: "T", codingChange: "c.1846G>A" },
    ],
    limitation:
      "CYP2D6 is largely defined by gene deletions and duplications, which SNP arrays cannot see. Only the *4 no-function allele is called here, so a normal result is not conclusive.",
  },
];

/** Every rsID we need, for a single pass over the file. */
export const REQUIRED_RSIDS: ReadonlySet<string> = new Set(
  GENE_DEFINITIONS.flatMap((g) => g.alleles.map((a) => a.rsid)),
);
