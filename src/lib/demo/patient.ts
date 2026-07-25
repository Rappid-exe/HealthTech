/**
 * Synthetic demo patient.
 *
 * Entirely fabricated - no real person, no real report. The hackathon rules
 * require synthetic or authorised data only, and a pharmacogenomics product
 * should never ship a real genotype as a fixture regardless.
 *
 * The case is clinically coherent rather than arbitrary: someone six weeks past
 * a coronary stent is exactly who ends up on clopidogrel, and the CYP2C19,
 * SLCO1B1 and CYP2D6 calls below are the three most consequential
 * pharmacogenomic results a person in that situation can carry.
 */

import type { Genotype } from "@/lib/cpic/types";

export interface DemoPatient {
  id: string;
  name: string;
  age: number;
  sex: string;
  /** Why they are on these drugs. Drives the indication CPIC scopes guidance to. */
  clinicalContext: string;
  reportVendor: string;
  reportDate: string;
  genotypes: Genotype[];
  medications: string[];
}

export const DEMO_PATIENT: DemoPatient = {
  id: "demo-alex-morgan",
  name: "Alex Morgan",
  age: 58,
  sex: "Not specified",
  clinicalContext:
    "Drug-eluting stent placed following acute coronary syndrome, six weeks ago. Ongoing dual antiplatelet therapy.",
  reportVendor: "Synthetic consumer pharmacogenomic panel",
  reportDate: "2026-06-12",
  genotypes: [
    { gene: "CYP2C19", diplotype: "*2/*2" },
    { gene: "CYP2D6", diplotype: "*4/*4" },
    { gene: "SLCO1B1", diplotype: "*5/*5" },
    { gene: "CYP2C9", diplotype: "*1/*2" },
    { gene: "TPMT", diplotype: "*1/*1" },
    { gene: "DPYD", diplotype: "Reference/Reference" },
    { gene: "NUDT15", diplotype: "*1/*1" },
    { gene: "UGT1A1", diplotype: "*1/*28" },
  ],
  medications: [
    "Plavix 75mg once daily",
    "simvastatin 40mg nightly",
    "codeine 30mg as needed",
    "omeprazole 20mg once daily",
    "lisinopril 10mg once daily",
  ],
};

/**
 * A synthetic upload, written the way consumer labs actually format these -
 * headed tables, footnotes, marketing copy, and the genotype buried among it.
 * Used by the demo path and as a fixture for the extraction layer.
 */
export const DEMO_REPORT_TEXT = `
GENOMIC INSIGHT LABORATORIES
Pharmacogenomic Profile - Comprehensive Panel (PGx-120)

Patient: MORGAN, ALEX
Date of birth: 04 Mar 1968
Accession: GIL-2026-0847712
Specimen: Buccal swab, collected 02 Jun 2026
Reported: 12 Jun 2026

------------------------------------------------------------------
SECTION 3 - DRUG METABOLISM GENOTYPES
------------------------------------------------------------------

Gene        Result          Alleles Tested            Interpretation
CYP2C19     *2/*2           *2,*3,*4,*8,*17           Poor metaboliser
CYP2D6      *4/*4           *3,*4,*5,*6,*9,*10,*41    Poor metaboliser
SLCO1B1     *5/*5           rs4149056                 Decreased function
CYP2C9      *1/*2           *2,*3,*5,*6,*8,*11        Intermediate
TPMT        *1/*1           *2,*3A,*3B,*3C            Normal activity
DPYD        Reference/Reference  c.1905+1G>A, c.2846A>T   Normal activity
NUDT15      *1/*1           *2,*3,*4,*5,*6            Normal activity
UGT1A1      *1/*28          *28,*36,*37               Intermediate

------------------------------------------------------------------
SECTION 4 - CURRENT MEDICATIONS (patient reported)
------------------------------------------------------------------
  Plavix 75mg once daily
  simvastatin 40mg nightly
  codeine 30mg as needed for back pain
  omeprazole 20mg once daily
  lisinopril 10mg once daily

------------------------------------------------------------------
This report is for informational purposes. Genotyping was performed
using a targeted array. Absence of a detected variant does not
exclude the presence of rare variants not covered by this panel.
Discuss all results with a qualified healthcare professional before
making any change to prescribed therapy.
`.trim();
