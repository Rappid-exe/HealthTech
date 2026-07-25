# Beacon — 60 second demo

**Target: 55 seconds spoken.** Leaves five seconds of headroom. ~145 words at
demo pace. Read it out loud with a timer before you trust it.

---

## Before you start

- Browser at the landing page, **already loaded**, scrolled to the top.
- Zoom at 110–125%. Judges are looking at a projector, not your laptop.
- Close the terminal. Nothing on screen but the product.

You no longer need a second tab: the physician brief is a toggle on the results
themselves, and it renders the data you just analysed rather than the worked
example.

---

## The script

| Time | You say | You do |
|---|---|---|
| **0:00** | "About a third of people carry a gene variant that changes how a common drug works in their body. Your doctor almost certainly doesn't know yours." | Landing page. Don't touch anything yet. |
| **0:12** | "This is a consumer DNA file — the kind more than forty million people already have sitting in a downloads folder. It's read in my browser. It never gets uploaded." | Click **See it work →** |
| **0:22** | "Alex is six weeks post-stent, on Plavix. But they're a CYP2C19 poor metaboliser — their body can't activate it. They have been taking a blood thinner that does close to nothing." | Results are already on screen. Point at the red card. |
| **0:36** | "That's not our opinion. It's the CPIC prescribing guideline, word for word, with its evidence grade and a link to the source." | Point at the quote block, then the **Strong evidence** badge. |
| **0:44** | "And it doesn't stop at what they're taking. Their genome affects forty medicines. **The next painkiller a doctor reaches for after codeine is tramadol — same enzyme, same failure.**" | Scroll to **Beyond the medicines you take now**. This is the beat that lands; don't rush it. |
| **0:54** | "No language model chose any of this. Every line is a published guideline, matched deterministically. You check once, and it holds for life." | Stop talking. |

If you have a spare ten seconds, click **Physician brief** — same findings, one
page, for a GP with an eight-minute appointment. Cut it first if you are long.

---

## What to cut if you overrun

In this order:

1. The 0:45 physician-brief line — just switch tabs silently and let it land.
2. "six weeks post-stent" → "on Plavix after a stent".
3. The whole 0:36 beat. It's the strongest line in the demo, so cut it last.

**Do not cut 0:52.** It is the differentiator, and it is the answer to the
question every judge is already forming.

---

## If something breaks

The one-click path needs the sample file and `/api/match`. If either fails:

- **Go to `/report`.** It is server-rendered from committed data — no API key,
  no network, no model. It cannot fail unless the whole app is down.
- Say: "here's one we prepared earlier" and carry on from 0:22. The findings
  are identical.

Do **not** try to debug on stage. Switch and keep talking.

---

## Questions you will get

**"How do you know the model isn't making it up?"**
It never touches the medicine. It does two jobs — reading a genotype out of a
messy file, and nothing else. The recommendation, the evidence grade and the
clinical indication are a verbatim row from CPIC's published dataset, matched
by a deterministic rules engine. 2,115 recommendations, committed to the repo.

**"Who is this for?"**
Anyone who has taken a consumer DNA test, which is tens of millions of people,
and anyone getting a pharmacogenomic panel — now routine before chemotherapy
and increasingly bundled into NHS and US insurer pathways.

**"Isn't this regulated?"**
We surface published prescribing guidelines matched to a genotype, with
citations. It is a lookup, not a diagnosis. Every screen says to speak to a
doctor before changing anything, and the physician brief is designed to be
handed to one.

**"What's hard about it?"**
Three things. Getting from a genotype to a CPIC phenotype correctly — CYP2D6
joins on an activity score, not a phenotype name, and two thirds of the
recommendations need calls for several genes at once. Calling star alleles off
a consumer array without getting strand orientation backwards. And knowing when
to refuse: the product declines to call a gene rather than guess, which is why
you can trust the calls it does make.

**"What would you build next?"**
Longitudinal. The moment a new prescription is written is when this matters,
not months later when someone thinks to check.

---

## Numbers you can quote

All verified, all in the repo:

| | |
|---|---|
| CPIC recommendations | 2,115 |
| Drugs / genes / guidelines | 324 / 15 / 29 |
| One-click path, end to end | 984 ms |
| Full 640k-row genome parsed | 406 ms |
| Automated checks passing | 52 |
| Client JS shipped | 907 KB |

Never quote a number you haven't seen pass. If asked something you don't know,
say you don't know — it costs you nothing and guessing costs you everything.
