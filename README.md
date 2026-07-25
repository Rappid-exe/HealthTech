# Beacon

**Checks the medicines you already take against the genome you already have.**

Built for the Consumer Health Hackathon, London, 25–26 July 2026.

---

## The problem

Around a third of people carry a genetic variant that changes how a common drug
behaves in their body. Clopidogrel does not activate properly in a CYP2C19 poor
metaboliser. Codeine gives no pain relief to a CYP2D6 poor metaboliser.
Simvastatin carries a much higher myopathy risk with an SLCO1B1 poor-function
result.

This is not speculative. It is published, peer-reviewed, guideline-level
medicine — the Clinical Pharmacogenetics Implementation Consortium (CPIC) has
issued prescribing recommendations for hundreds of drug–gene pairs.

Almost none of it reaches the patient. Consumer genetic reports bury the
genotype in fifty pages of PDF, and a GP with eight minutes has neither the time
to read it nor a reason to expect it.

Beacon closes that gap.

## The architectural claim

> The language model does **extraction** and **translation**.
> A deterministic rules engine grounded in CPIC produces every clinical claim.

This inversion is the point of the project. Ask any health-AI demo "how do you
know the model didn't invent that?" and the answer is usually a shrug and a
disclaimer. Here, every recommendation shown to a user is a verbatim row from
CPIC's published dataset, carried through with its evidence grade, its clinical
indication, and a link to the source guideline. **The model does not decide
anything clinical** — it does not choose the recommendation, grade the evidence,
rank the findings, or judge severity. All of that is a table lookup.

The model does exactly two jobs:

**Extraction.** Reading a genotype out of whatever chaotic format a consumer lab
decided to use this quarter. This is genuinely hard and genuinely worth a model.
Its output is validated against the genes we hold tables for before it reaches
the engine, so an invented gene symbol is dropped rather than carried forward.

**Translation.** Restating CPIC's guidance in language the patient can use. The
source text is written for prescribers — *"significantly reduced clopidogrel
active metabolite formation; increased on-treatment platelet reactivity"* — and
a product whose entire premise is reaching the person taking the drug cannot
hand them that and call it done.

Three constraints keep the translation honest:

- It is **generated once and committed** (`src/data/plain-english.json`, 368
  entries), not written per request. So it can be read, reviewed and corrected
  by a human, and the same input always produces the same words.
- It is **never shown alone**. The verbatim CPIC recommendation sits directly
  beneath it, and carries the instruction.
- It is **forbidden from instructing**. The prompt bars it from telling the
  reader to do anything, from adding facts the source does not contain, and from
  softening or amplifying severity. It explains; the guideline directs.

If a translation is ever missing, the UI falls back to the source text — the
failure mode is clinical language, not silence or invention.

```mermaid
flowchart LR
    A["Genetic report<br/>(PDF / text)"] --> B["Claude<br/>extraction"]
    M["Medication list"] --> B
    B --> C["Structured genotype<br/>CYP2C19 *2/*2"]
    C --> D["CPIC diplotype table<br/>→ phenotype"]
    D --> E["CPIC recommendation join<br/>deterministic"]
    E --> F["Patient dashboard"]
    E --> G["Physician brief"]

    style B fill:#eef2fb,stroke:#1a4fa0
    style E fill:#f2f8f5,stroke:#1f6b4a
```

## How many people does this affect?

Answered by simulation rather than assertion. `scripts/population-impact.ts`
draws genotypes from CPIC's own published allele frequencies and runs each
simulated person through the same engine the product uses — 20,000 people per
population group, across all nine groups CPIC publishes.

| | |
|---|---|
| Carry ≥1 gene result CPIC flags **high priority** | **97–100%** |
| Carry ≥1 drug with an **avoid** recommendation | 97–100% |
| Mean number of drugs to avoid, among those | 2.6 – 6.9 |
| CYP2C19 atypical (European) | 60% |
| CYP2D6 atypical (European) | 47% |

Nothing in that table is estimated by hand. The frequencies are CPIC's, the
phenotype calls are CPIC's lookup tables, and the recommendations are CPIC's —
the simulation only decides which alleles a person is dealt.

Two choices make it conservative rather than flattering. Published frequencies
never sum to 1, and the remainder is assigned to the *reference* allele, which
can only understate how many people carry something actionable. And 26.7% of
draws produce a diplotype CPIC does not list — mostly rare CYP2D6 and DPYD
combinations — which are excluded rather than guessed at.

An earlier version of this measurement returned exactly 100% for every
population. That was a broken metric, not a finding: counting any avoid *or*
adjust across 324 drugs means "use standard dose but monitor" qualifies, so
everyone passes and the number measures nothing. The headline now uses CPIC's
own `ehrpriority` flag instead of our severity triage.

## Two artifacts, one pipeline

| | Patient dashboard | Physician brief |
|---|---|---|
| Route | `/report` | `/report/clinical` |
| Reader | The person taking the drugs | A clinician with eight minutes |
| Register | Plain language, severity-triaged cards | One page, A4, medical notation |
| Shared | Identical underlying findings — no divergent second source of truth | |

## Two ways in

**A raw consumer DNA file.** 23andMe and AncestryDNA exports contain the exact
SNPs CPIC keys on, and tens of millions of people already have one. Beacon
parses the file and calls star alleles **in the browser** — a 640,000-row export
in 406 ms — and sends only the resulting handful of diplotypes. The genome never
leaves the device. No model is involved in this path at all.

Star-allele calling refuses rather than guesses. If an observed genotype
contains a base outside the definition — the signature of a wrong-strand
definition — the gene is reported uncallable instead of miscalled. Same for
no-calls, absent markers, and more than two variant copies (which implies a
duplication an array cannot resolve). CYP2D6 and DPYD carry explicit notes that
a chip cannot see copy-number variation.

**A typed report.** Any format. This is where the model earns its place: every
vendor lays a report out differently, and getting from fifty pages of PDF to
`CYP2C19 *2/*2` is genuinely hard. `scripts/prove-not-hardcoded.ts` demonstrates
it is real extraction rather than fixture-matching — it feeds in a report whose
facts appear nowhere in this repository and checks the result.

## Beyond the drugs you already take

The findings answer "are these five safe". The profile answers the question that
makes the result worth keeping: what happens the next time someone writes you a
prescription.

For the sample genome, CPIC has guidance on 40 drugs, of which 17 should be
avoided. The user listed five.

That larger view surfaces a trap the findings cannot. A CYP2D6 poor metaboliser
told only that codeine will not work for them is likely to be offered **tramadol**
next — which fails for exactly the same reason, on the same enzyme. Beacon says
so, and orders those callouts so that same-class substitutes lead: sharing an
enzyme makes tramadol and nortriptyline identical cases, but only one is a drug
someone reaches for *instead of* codeine.

Each class also shows the other side — the drugs where nothing matched this
genotype. For an SLCO1B1 poor-function patient that surfaces atorvastatin and
rosuvastatin, which is the clinically correct answer. The wording is as narrow as
the data allows: *"your genotype does not change the usual advice"* is not *"this
is safe for you"*.

## Data provenance

Everything clinical comes from [CPIC](https://cpicpgx.org)'s public API
(`api.cpicpgx.org`), pulled at build time by `scripts/seed-cpic.mjs` and
committed to `src/data/cpic/`. The app makes no network call to CPIC at runtime,
so the demo is deterministic and works offline.

| Table | Rows |
|---|---|
| Prescribing recommendations | 2,115 |
| Diplotype → phenotype mappings | 27,381 |
| Drugs | 324 |
| Published guidelines | 29 |
| Genes | 15 |

Three details in that dataset shaped the engine:

- **CYP2D6 joins on activity score, not phenotype name.** Most genes match
  recommendations on a phenotype string like `Poor Metabolizer`; CYP2D6 uses a
  numeric activity score. Matching on phenotype alone silently drops every
  CYP2D6 recommendation — a third of the table, covering codeine and the
  antidepressants.
- **Two thirds of recommendations are multi-gene.** A recommendation is only
  applied when the patient has a call for *every* gene it depends on. Partial
  matches would assert guidance the data does not support.
- **CPIC ships its own severity triage** in the `ehrpriority` field, so even the
  red/amber/green banding is guideline-sourced rather than invented here.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Re-pull the clinical dataset (only needed when CPIC publishes an update):

```bash
node scripts/seed-cpic.mjs
```

Verify the engine against the real dataset:

```bash
npx tsx scripts/verify-engine.ts
```

Verify star-allele calling, including the committed sample genome:

```bash
npx tsx scripts/verify-genotype-calling.ts
```

Demonstrate that report extraction is a real model call, not a lookup:

```bash
npx tsx scripts/prove-not-hardcoded.ts
```

Reproduce the population figures:

```bash
npx tsx scripts/population-impact.ts
```

The verification script checks genotype resolution, brand-name handling,
multi-gene matching, and severity triage across all 2,115 recommendations —
including the two traps that break naive implementations: `"No reason to avoid…"`
must not read as high risk, and `"Avoid X… use Y at standard dose"` must not read
as routine.

## Safety and scope

Beacon is a **demonstration prototype**. It is not a medical device and not
medical advice, diagnosis or treatment.

All patient data in this repository is **synthetic**. No real genotype, report,
or person is represented anywhere in the codebase.

The product deliberately does not: chat, diagnose, infer disease risk, or
recommend anything CPIC has not already published. Its entire job is to carry
existing guideline knowledge the last mile to the person it concerns — and to
their doctor.
