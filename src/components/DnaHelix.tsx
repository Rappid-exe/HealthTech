"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * An ASCII double helix, rotating.
 *
 * Each row is one step around the axis: the two backbones sit at sin(a) and
 * sin(a + PI), so they cross where the projection makes them meet. Depth is
 * conveyed by glyph weight rather than colour — the strand nearer the viewer
 * takes the heavier character — which keeps the whole frame a single string and
 * the animation to one state update per tick.
 */

const WIDTH = 34;
const ROWS = 21;
/** Radians of rotation per row. ~1.3 full turns over the height. */
const TWIST = 0.4;
const FPS = 14;

/** Complementary pairs, so each rung is chemically honest. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["A", "T"],
  ["T", "A"],
  ["G", "C"],
  ["C", "G"],
];

/** Fixed per-row bases. Deterministic so the sequence doesn't flicker. */
const SEQUENCE = Array.from({ length: ROWS }, (_, r) => PAIRS[(r * 7 + 3) % PAIRS.length]);

function renderFrame(phase: number): string {
  const amp = (WIDTH - 3) / 2;
  const centre = (WIDTH - 1) / 2;
  const lines: string[] = [];

  for (let r = 0; r < ROWS; r++) {
    const a = phase + r * TWIST;
    const x1 = Math.round(centre + amp * Math.sin(a));
    const x2 = Math.round(centre + amp * Math.sin(a + Math.PI));
    const line = new Array<string>(WIDTH).fill(" ");

    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    const span = hi - lo;

    // The rung fades as the helix turns edge-on and the pair foreshortens.
    if (span > 1) {
      const rung = span > amp ? "-" : ".";
      for (let x = lo + 1; x < hi; x++) line[x] = rung;
    }

    // cos tells us which backbone is currently in front.
    const firstInFront = Math.cos(a) > 0;
    const [b1, b2] = SEQUENCE[r];
    line[x1] = firstInFront ? b1 : b1.toLowerCase();
    line[x2] = firstInFront ? b2.toLowerCase() : b2;

    lines.push(line.join(""));
  }
  return lines.join("\n");
}

export function DnaHelix({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!media.matches);
    const onChange = () => setAnimate(!media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setPhase((p) => p + 0.09), 1000 / FPS);
    return () => clearInterval(id);
  }, [animate]);

  const frame = useMemo(() => renderFrame(phase), [phase]);

  return (
    <pre
      aria-hidden
      className={`notation select-none text-[10px] leading-[1.15] text-accent/45 sm:text-[11px] ${className}`}
      style={{
        // Fades the helix out at both ends so it reads as continuing past the
        // frame rather than being cut off.
        maskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
      }}
    >
      {frame}
    </pre>
  );
}
