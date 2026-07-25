/**
 * Everyday groupings for the drugs CPIC covers.
 *
 * A list of forty drug names in alphabetical order is technically complete and
 * practically unreadable. Grouped by what they are *for*, the same list becomes
 * something a person can act on — "both of the painkillers you'd normally be
 * offered are on here" is a thought you can have; "clomipramine, codeine,
 * desipramine" is not.
 *
 * CPIC does not publish drug classes, so this is curated. Anything absent falls
 * back to "Other medicines", which is a display concern only — it never affects
 * which recommendation is shown.
 */

export const DRUG_CLASSES: Record<string, string> = {};

const GROUPS: Record<string, string[]> = {
  "Pain relief": [
    "codeine",
    "tramadol",
    "hydrocodone",
    "oxycodone",
    "methadone",
    "ibuprofen",
    "celecoxib",
    "meloxicam",
    "piroxicam",
    "tenoxicam",
    "lornoxicam",
    "flurbiprofen",
    "diclofenac",
    "naproxen",
  ],
  "Mental health": [
    "amitriptyline",
    "clomipramine",
    "desipramine",
    "doxepin",
    "imipramine",
    "nortriptyline",
    "trimipramine",
    "citalopram",
    "escitalopram",
    "fluvoxamine",
    "paroxetine",
    "sertraline",
    "fluoxetine",
    "venlafaxine",
    "vortioxetine",
    "aripiprazole",
    "risperidone",
    "haloperidol",
    "pimozide",
    "brexpiprazole",
  ],
  "Cholesterol": [
    "simvastatin",
    "lovastatin",
    "fluvastatin",
    "pitavastatin",
    "pravastatin",
    "atorvastatin",
    "rosuvastatin",
  ],
  "Heart and blood": ["clopidogrel", "warfarin", "metoprolol", "carvedilol", "propafenone", "flecainide"],
  "Stomach and reflux": [
    "omeprazole",
    "esomeprazole",
    "lansoprazole",
    "dexlansoprazole",
    "pantoprazole",
    "rabeprazole",
  ],
  "Cancer treatment": [
    "tamoxifen",
    "capecitabine",
    "fluorouracil",
    "irinotecan",
    "mercaptopurine",
    "thioguanine",
    "azathioprine",
    "gefitinib",
    "imatinib",
  ],
  "Infection": [
    "voriconazole",
    "efavirenz",
    "abacavir",
    "atazanavir",
    "peginterferon alfa-2a",
    "peginterferon alfa-2b",
    "isoniazid",
    "rifampin",
  ],
  "Immune and transplant": ["tacrolimus", "sirolimus", "cyclosporine"],
  "Brain and nerves": [
    "carbamazepine",
    "oxcarbazepine",
    "phenytoin",
    "clobazam",
    "atomoxetine",
    "amphetamine",
    "siponimod",
    "ondansetron",
    "tropisetron",
  ],
  "Gout": ["allopurinol", "rasburicase"],
};

for (const [group, drugs] of Object.entries(GROUPS)) {
  for (const drug of drugs) DRUG_CLASSES[drug] = group;
}

export const OTHER_CLASS = "Other medicines";

export function classFor(drugName: string): string {
  return DRUG_CLASSES[drugName.toLowerCase()] ?? OTHER_CLASS;
}

/** Every drug curated into a class. Empty for OTHER_CLASS, which is a bucket. */
export function membersOf(className: string): string[] {
  return GROUPS[className] ?? [];
}

/** Display order — the groups people are most likely to meet come first. */
export const CLASS_ORDER = [
  "Pain relief",
  "Mental health",
  "Heart and blood",
  "Cholesterol",
  "Stomach and reflux",
  "Brain and nerves",
  "Infection",
  "Cancer treatment",
  "Immune and transplant",
  "Gout",
  OTHER_CLASS,
];
