/**
 * Pre-translates CPIC guidance into plain English.
 *
 * The patient dashboard was showing clinical text written for prescribers —
 * "significantly reduced clopidogrel active metabolite formation; increased
 * on-treatment platelet reactivity" — to the person taking the drug. Correct,
 * citable, and useless to them.
 *
 * This runs once and commits its output, rather than translating at request
 * time, for three reasons: the one-click path is under a second and a model
 * call would end that; the same demo must produce the same words every time;
 * and a committed file can be read and corrected by a human, which text
 * improvised per-request cannot.
 *
 * The 2,115 recommendations collapse to 368 unique (recommendation,
 * implication) pairs, because the same guidance repeats across genes and
 * clinical populations.
 *
 * Run: node scripts/translate-plain-english.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const IN = join(process.cwd(), "src", "data", "cpic", "recommendations.json");
const OUT = join(process.cwd(), "src", "data", "plain-english.json");
const BATCH = 12;
const CONCURRENCY = 4;

const SYSTEM = `You rewrite clinical pharmacogenomic guidance into plain English for the patient taking the medicine.

The reader has just been told which drug this concerns and what their genetic
result is. Your job is to explain what that means for their body. The original
guideline text is displayed directly beneath your words and carries the actual
instruction, so you never need to tell the reader what to do.

Hard rules:

1. Never change clinical meaning. Do not soften a serious warning, and do not
   make a mild one sound serious. If the source says "avoid", the seriousness
   of that must survive.
2. Never add information that is not in the source. No new drug names, no
   numbers, no risks, no reassurance the source does not give.
3. Never instruct the reader. Do not write "talk to your doctor", "stop taking",
   or "ask about" — the guideline beneath your text does that.
4. Address the reader as "you". Write about their body, not about patients.
5. Plain words. A capable twelve-year-old should follow it. Say "your body
   breaks this down too quickly", not "increased metabolic clearance".

For each item produce:
- headline: one sentence, at most twelve words, the single most important thing.
- detail: one or two sentences explaining why, in everyday language.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The id given in the input." },
          headline: { type: "string" },
          detail: { type: "string" },
        },
        required: ["id", "headline", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

function keyFor(recommendation, implication) {
  return createHash("sha1")
    .update(`${recommendation}||${implication}`)
    .digest("hex")
    .slice(0, 16);
}

async function translateBatch(client, batch, attempt = 1) {
  const payload = batch
    .map(
      (b) =>
        `<item id="${b.key}">\n<what_happens>${b.implication || "(none given)"}</what_happens>\n<guideline>${b.recommendation}</guideline>\n</item>`,
    )
    .join("\n\n");

  try {
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: SYSTEM,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Rewrite each item. Return one translation per item, using the same id.\n\n${payload}`,
        },
      ],
    });

    if (res.stop_reason === "refusal") throw new Error("model refused");
    const text = res.content.find((b) => b.type === "text");
    if (!text) throw new Error("no text block");
    return JSON.parse(text.text).translations ?? [];
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return translateBatch(client, batch, attempt + 1);
    }
    console.warn(`  batch failed after 3 attempts: ${err.message}`);
    return [];
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.split(/[\r\n]+/)
    .map((l) => l.replace(/\s/g, ""))
    .find(Boolean);
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Load it from .env.local first.");
    process.exit(1);
  }

  const recs = JSON.parse(await readFile(IN, "utf8"));

  // Collapse to unique (recommendation, implication) pairs.
  const unique = new Map();
  for (const r of recs) {
    const recommendation = (r.recommendation ?? "").trim();
    if (!recommendation) continue;
    const implication = Object.values(r.implications ?? {})
      .join(" ")
      .trim();
    const key = keyFor(recommendation, implication);
    if (!unique.has(key)) unique.set(key, { key, recommendation, implication });
  }

  let items = [...unique.values()];

  // PE_LIMIT=12 runs a single batch, for checking prompt quality before
  // committing to a full pass.
  const limit = Number(process.env.PE_LIMIT ?? 0);
  if (limit > 0) {
    items = items.slice(0, limit);
    console.log(`PE_LIMIT set — translating only ${items.length} pairs (dry run)\n`);
  }

  console.log(`${recs.length} recommendations -> ${items.length} unique pairs to translate\n`);

  const batches = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

  const client = new Anthropic({ apiKey });
  const out = {};
  let done = 0;

  // Bounded concurrency: enough to finish in a few minutes, not enough to
  // trip rate limits.
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((b) => translateBatch(client, b)));
    for (const list of results) {
      for (const t of list) {
        if (!t?.id || !t.headline || !t.detail) continue;
        out[t.id] = { headline: t.headline.trim(), detail: t.detail.trim() };
      }
    }
    done += slice.length;
    process.stdout.write(
      `\r  ${Math.min(done * BATCH, items.length)}/${items.length} translated`,
    );
  }
  console.log("\n");

  const missing = items.filter((it) => !out[it.key]);
  if (missing.length) {
    console.warn(`${missing.length} pair(s) have no translation; the UI falls back to CPIC text.`);
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: "claude-opus-5",
        sourcePairs: items.length,
        translated: Object.keys(out).length,
        note: "Generated once and committed so it can be reviewed. Explanatory only — the verbatim CPIC recommendation is always displayed alongside and carries the instruction.",
        translations: out,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${OUT}`);
  console.log(`  ${Object.keys(out).length}/${items.length} translated`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
