"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * A double helix assembling itself, in ASCII, while the analysis runs.
 *
 * The backbones are always drawn and always turning; the base pairs zip
 * together down the strand and then repeat. That is the part that reads as
 * *work happening* rather than a spinner — and it is thematically honest, since
 * what the system is doing at that moment is pairing a genotype to guidance.
 *
 * Sized for the report path, which waits three to six seconds on a model call.
 * The raw-genome path finishes in about 400ms and barely shows this at all,
 * which is the correct proportion: the wait you can see is the one worth
 * decorating.
 */

const WIDTH = 46;
const ROWS = 15;
/** Radians of turn per row. */
const TWIST = 0.42;
const FPS = 20;
/** Rows the zip advances per frame. Slower than the rotation, so they beat. */
const ZIP_SPEED = 0.22;

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["A", "T"],
  ["T", "A"],
  ["G", "C"],
  ["C", "G"],
];
const SEQUENCE = Array.from({ length: ROWS }, (_, r) => PAIRS[(r * 5 + 2) % PAIRS.length]);

function frame(phase: number, zip: number): string {
  const amp = (WIDTH - 4) / 2;
  const centre = (WIDTH - 1) / 2;
  const lines: string[] = [];

  for (let r = 0; r < ROWS; r++) {
    const a = phase + r * TWIST;
    const x1 = Math.round(centre + amp * Math.sin(a));
    const x2 = Math.round(centre + amp * Math.sin(a + Math.PI));
    const line = new Array<string>(WIDTH).fill(" ");

    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);

    // The zip front sweeps down the helix; rows behind it are paired.
    const paired = r <= zip;
    if (paired && hi - lo > 1) {
      // Foreshortened pairs get the lighter glyph, so depth still reads.
      const glyph = hi - lo > amp ? "-" : ".";
      for (let x = lo + 1; x < hi; x++) line[x] = glyph;
    }

    const [b1, b2] = SEQUENCE[r];
    const firstInFront = Math.cos(a) > 0;
    // Unpaired bases sit as lowercase until the zip reaches them.
    line[x1] = paired ? (firstInFront ? b1 : b1.toLowerCase()) : b1.toLowerCase();
    line[x2] = paired ? (firstInFront ? b2.toLowerCase() : b2) : b2.toLowerCase();

    lines.push(line.join(""));
  }
  return lines.join("\n");
}

export function HelixLoader({ label }: { label: string }) {
  const [tick, setTick] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!media.matches);
    const onChange = () => setAnimate(!media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000 / FPS);
    return () => clearInterval(id);
  }, [animate]);

  const art = useMemo(() => {
    const phase = tick * 0.13;
    // +3 so the strand sits fully paired for a beat before starting over.
    const zip = (tick * ZIP_SPEED) % (ROWS + 3);
    return frame(phase, zip);
  }, [tick]);

  return (
    <div className="flex flex-col items-center py-8">
      <pre
        aria-hidden
        className="notation select-none text-[13px] leading-[1.25] text-accent"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
        }}
      >
        {art}
      </pre>
      <p className="mt-4 text-sm font-medium text-muted" aria-live="polite">
        {label}…
      </p>
    </div>
  );
}
