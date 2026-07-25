"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * A full-bleed ASCII backdrop: several double helices rotating on a diagonal
 * axis, over a sparse character field.
 *
 * Two stacked <pre> layers rather than per-character spans. The static field
 * sits underneath at very low opacity, the helices ride on top slightly
 * stronger, and each frame is a single string — so a ~200x80 grid animates
 * without touching the DOM more than twice per tick.
 *
 * Geometry runs in pixels, not grid cells. Monospace cells are roughly twice as
 * tall as they are wide, so a "45 degree" line in cell coordinates is nothing
 * like 45 degrees on screen; positions are computed in pixel space and divided
 * back down into cells at the end.
 */

const CHAR_W = 6;
const CHAR_H = 12;
const FONT_PX = 10;

/** Axis tilt from vertical, in radians. */
const TILT = (32 * Math.PI) / 180;
/** Half the distance between the two backbones, in pixels. */
const AMPLITUDE = 70;
/** Pixels along the axis for one full turn. */
const PERIOD = 260;
/** Perpendicular distance between neighbouring helices, in pixels. */
const SPACING = 520;
/**
 * Sampling step along the axis, in pixels. This has to clear roughly one cell
 * diagonal or the backbone is oversampled: several consecutive samples round
 * into the same row and the helix degenerates into horizontal runs of letters
 * that read as text rather than a curve. At a 32-degree tilt, 12px advances
 * about 1.1 cells across and 0.9 down — one glyph per cell, no smearing.
 */
const STEP = 12;
/** Draw a rung every Nth step, so it reads as a ladder rather than a ribbon. */
const RUNG_EVERY = 3;

const FPS = 12;
const FIELD_CHARS = ".·:'`,";
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["A", "T"],
  ["T", "A"],
  ["G", "C"],
  ["C", "G"],
];

/** Deterministic PRNG so the field is stable across re-renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildField(cols: number, rows: number): string {
  const rand = mulberry32(0x8badf00d);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      // Sparse on purpose: this is texture behind body copy, not a wall.
      line += rand() < 0.08 ? FIELD_CHARS[(rand() * FIELD_CHARS.length) | 0] : " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function buildHelices(cols: number, rows: number, phase: number): string {
  const grid: string[][] = Array.from({ length: rows }, () =>
    new Array<string>(cols).fill(" "),
  );

  const plot = (xPx: number, yPx: number, ch: string) => {
    const c = Math.round(xPx / CHAR_W);
    const r = Math.round(yPx / CHAR_H);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    grid[r][c] = ch;
  };

  const wPx = cols * CHAR_W;
  const hPx = rows * CHAR_H;

  // Axis direction and its perpendicular.
  const dx = Math.sin(TILT);
  const dy = Math.cos(TILT);
  const px = Math.cos(TILT);
  const py = -Math.sin(TILT);

  // March far enough to cover the viewport corners whatever the tilt.
  const reach = Math.hypot(wPx, hPx);
  const cx = wPx / 2;
  const cy = hPx / 2;
  const lanes = Math.ceil(reach / SPACING) + 1;

  for (let lane = -lanes; lane <= lanes; lane++) {
    const offset = lane * SPACING;
    const ox = cx + px * offset;
    const oy = cy + py * offset;

    for (let i = 0, t = -reach; t <= reach; t += STEP, i++) {
      const a = phase + (t / PERIOD) * Math.PI * 2;
      const s1 = AMPLITUDE * Math.sin(a);
      const s2 = AMPLITUDE * Math.sin(a + Math.PI);

      const bx = ox + dx * t;
      const by = oy + dy * t;

      const x1 = bx + px * s1;
      const y1 = by + py * s1;
      const x2 = bx + px * s2;
      const y2 = by + py * s2;

      // Rungs first, so backbones draw over their ends.
      if (i % RUNG_EVERY === 0) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        // Every other cell, so rungs read as dotted lines rather than solid bars.
        const samples = Math.max(1, Math.round(dist / (CHAR_W * 2)));
        // Foreshortened rungs get a lighter glyph, which reads as depth.
        const glyph = dist > AMPLITUDE ? "-" : ".";
        for (let s = 1; s < samples; s++) {
          const k = s / samples;
          plot(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, glyph);
        }
      }

      const [b1, b2] = PAIRS[((i % PAIRS.length) + PAIRS.length) % PAIRS.length];
      const firstInFront = Math.cos(a) > 0;
      plot(x1, y1, firstInFront ? b1 : b1.toLowerCase());
      plot(x2, y2, firstInFront ? b2.toLowerCase() : b2);
    }
  }

  return grid.map((r) => r.join("")).join("\n");
}

export function DnaBackdrop() {
  const [grid, setGrid] = useState({ cols: 0, rows: 0 });
  const [phase, setPhase] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const measure = () => {
      // Overshoot by a cell so no seam shows at the right or bottom edge.
      setGrid({
        cols: Math.ceil(window.innerWidth / CHAR_W) + 1,
        rows: Math.ceil(window.innerHeight / CHAR_H) + 1,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!media.matches);
    const onChange = () => setAnimate(!media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setPhase((p) => p + 0.055), 1000 / FPS);
    return () => clearInterval(id);
  }, [animate]);

  const field = useMemo(
    () => (grid.cols ? buildField(grid.cols, grid.rows) : ""),
    [grid.cols, grid.rows],
  );
  const helices = useMemo(
    () => (grid.cols ? buildHelices(grid.cols, grid.rows, phase) : ""),
    [grid.cols, grid.rows, phase],
  );

  if (!grid.cols) return null;

  const layer =
    "notation absolute inset-0 m-0 overflow-hidden whitespace-pre text-foreground";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden"
      style={{
        // Lifts the texture away from the headline on the left, where body copy
        // sits, and lets it build towards the empty right edge.
        maskImage:
          "radial-gradient(120% 90% at 12% 22%, transparent 0%, transparent 26%, black 78%)",
        WebkitMaskImage:
          "radial-gradient(120% 90% at 12% 22%, transparent 0%, transparent 26%, black 78%)",
      }}
    >
      <pre
        className={layer}
        style={{ fontSize: FONT_PX, lineHeight: `${CHAR_H}px`, opacity: 0.07 }}
      >
        {field}
      </pre>
      <pre
        className={layer}
        style={{ fontSize: FONT_PX, lineHeight: `${CHAR_H}px`, opacity: 0.2 }}
      >
        {helices}
      </pre>
    </div>
  );
}
