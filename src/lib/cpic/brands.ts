/**
 * Brand name -> CPIC generic name.
 *
 * CPIC's drug table only carries generic names ("clopidogrel"), but patients
 * read the brand off the box ("Plavix"). Without this map the product fails on
 * the most common real input. UK brands are included alongside US ones because
 * the same molecule is sold under different names either side of the Atlantic
 * (paroxetine is Paxil in the US, Seroxat in the UK).
 *
 * Keys are lowercase. Values must match a `name` in src/data/cpic/drugs.json.
 */
export const BRAND_TO_GENERIC: Record<string, string> = {
  // Antiplatelet / anticoagulant
  plavix: "clopidogrel",
  grepid: "clopidogrel",
  coumadin: "warfarin",
  jantoven: "warfarin",
  marevan: "warfarin",
  brilinta: "ticagrelor",
  brilique: "ticagrelor",
  effient: "prasugrel",
  efient: "prasugrel",

  // Statins
  zocor: "simvastatin",
  lipitor: "atorvastatin",
  crestor: "rosuvastatin",
  pravachol: "pravastatin",
  lescol: "fluvastatin",
  livalo: "pitavastatin",

  // Proton pump inhibitors
  prilosec: "omeprazole",
  losec: "omeprazole",
  nexium: "esomeprazole",
  protonix: "pantoprazole",
  pantoloc: "pantoprazole",
  prevacid: "lansoprazole",
  zoton: "lansoprazole",
  dexilant: "dexlansoprazole",
  aciphex: "rabeprazole",
  pariet: "rabeprazole",

  // SSRIs / SNRIs / antidepressants
  lexapro: "escitalopram",
  cipralex: "escitalopram",
  celexa: "citalopram",
  cipramil: "citalopram",
  zoloft: "sertraline",
  lustral: "sertraline",
  prozac: "fluoxetine",
  paxil: "paroxetine",
  seroxat: "paroxetine",
  effexor: "venlafaxine",
  venlalic: "venlafaxine",
  trintellix: "vortioxetine",
  brintellix: "vortioxetine",
  elavil: "amitriptyline",
  pamelor: "nortriptyline",
  allegron: "nortriptyline",
  norpramin: "desipramine",
  tofranil: "imipramine",
  anafranil: "clomipramine",
  surmontil: "trimipramine",
  silenor: "doxepin",

  // Opioids / analgesia
  ultram: "tramadol",
  zydol: "tramadol",
  vicodin: "hydrocodone",
  norco: "hydrocodone",
  oxycontin: "oxycodone",
  percocet: "oxycodone",
  codipar: "codeine",
  "co-codamol": "codeine",
  solpadeine: "codeine",

  // NSAIDs
  advil: "ibuprofen",
  nurofen: "ibuprofen",
  motrin: "ibuprofen",
  brufen: "ibuprofen",
  celebrex: "celecoxib",
  mobic: "meloxicam",
  feldene: "piroxicam",
  ansaid: "flurbiprofen",
  voltarol: "diclofenac",
  voltaren: "diclofenac",

  // Oncology / immunosuppression
  nolvadex: "tamoxifen",
  imuran: "azathioprine",
  azasan: "azathioprine",
  purinethol: "mercaptopurine",
  xeloda: "capecitabine",
  adrucil: "fluorouracil",
  "5-fu": "fluorouracil",
  camptosar: "irinotecan",
  prograf: "tacrolimus",
  gleevec: "imatinib",
  iressa: "gefitinib",

  // Anti-infectives
  ziagen: "abacavir",
  sustiva: "efavirenz",
  stocrin: "efavirenz",
  vfend: "voriconazole",
  mepron: "atovaquone",

  // Neurology / psychiatry
  tegretol: "carbamazepine",
  dilantin: "phenytoin",
  epanutin: "phenytoin",
  onfi: "clobazam",
  mayzent: "siponimod",
  abilify: "aripiprazole",
  risperdal: "risperidone",
  haldol: "haloperidol",
  zyprexa: "olanzapine",
  strattera: "atomoxetine",

  // Other
  zyloprim: "allopurinol",
  zyloric: "allopurinol",
  zofran: "ondansetron",
  lopressor: "metoprolol",
  "toprol-xl": "metoprolol",
  betaloc: "metoprolol",
  elitek: "rasburicase",
  fasturtec: "rasburicase",
};

/**
 * Strips dose, form and route noise from a medication string so it can be
 * matched against a drug name. "Plavix 75mg tablet PO daily" -> "plavix".
 */
export function normaliseMedicationName(raw: string): string {
  return raw
    .toLowerCase()
    // dose amounts with units
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?|%)\b/g, " ")
    // dose forms and routes
    .replace(
      /\b(tab(let)?s?|cap(sule)?s?|oral|po|iv|im|sc|solution|suspension|injection|cream|patch|er|xr|sr|la|cr|xl|mr|delayed[- ]release|extended[- ]release)\b/g,
      " ",
    )
    // frequency
    .replace(
      /\b(once|twice|thrice|daily|nightly|bd|bid|tid|qid|od|on|qd|qhs|prn|weekly|as needed|per day|a day)\b/g,
      " ",
    )
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
