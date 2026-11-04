import type { ReactNode } from "react";

export const container = "mx-auto w-full max-w-[1280px] px-5 sm:px-10";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-l-accent";

/** Body copy: Plex Mono 14px / 500. */
export const body = "font-mono text-[14px] font-medium leading-[1.75] text-l-ink-2";

/** Section heading scale: Manrope 800, tight tracking. */
export const h2 =
  "font-sans text-[clamp(2.25rem,5.2vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.05em] text-l-fg";

export const section = "relative scroll-mt-16 border-t border-l-rule-soft py-20 sm:py-28";

/** Outlined rectangular button with a trailing arrow. */
export const btnOutline = `group inline-flex items-center justify-center gap-3 border border-l-rule bg-l-bg px-8 py-4 font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-l-fg transition-colors hover:bg-l-fg hover:text-l-bg ${focusRing}`;
/** Kept for the hero: same language, filled. */

export function Arrow({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`${className} shrink-0 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px motion-reduce:transition-none`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.1">
      <path d="M2 10 10 2M3.5 2H10v6.5" />
    </svg>
  );
}

export function Grey({ children }: { children: ReactNode }) {
  return <span className="text-l-soft">{children}</span>;
}

function Label({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-l-muted">
      {n ? <span className="mr-3 text-l-fg">{n}</span> : null}
      {children}
    </p>
  );
}

export function SectionHead({ n, label, title, lead }: { n: string; label: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <Label n={n}>{label}</Label>
      <h2 className={`mt-6 text-balance ${h2}`}>{title}</h2>
      {lead ? <p className={`mt-6 max-w-xl ${body}`}>{lead}</p> : null}
    </div>
  );
}

/* ---------- Glyph art: deterministic "0" dot-matrix shapes (server-rendered) ---------- */

type Shape = "mark" | "ring" | "flow" | "grid";

function inRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function filled(shape: Shape, x: number, y: number, cols: number, rows: number): boolean {
  // normalise to a square-ish space: cell is ~0.6 wide, 1 tall
  const u = x / (cols - 1);
  const v = y / (rows - 1);
  switch (shape) {
    case "ring": {
      const dx = (u - 0.5) * cols * 0.6;
      const dy = (v - 0.5) * rows;
      const r = Math.hypot(dx, dy);
      const R = Math.min(cols * 0.6, rows) * 0.46;
      return Math.abs(r - R) < 1.1 || Math.abs(r - R * 0.62) < 0.6;
    }
    case "mark": {
      // shadow candle (left) + lit candle (right)
      const wick = (cx: number, t: number, b: number) => Math.abs(u - cx) < 0.012 && v > t && v < b;
      return (
        wick(0.33, 0.22, 0.88) || inRect(u, v, 0.24, 0.38, 0.42, 0.7) ||
        wick(0.64, 0.08, 0.96) || inRect(u, v, 0.55, 0.2, 0.73, 0.66)
      );
    }
    case "flow": {
      const node = (cx: number) => inRect(u, v, cx - 0.07, 0.38, cx + 0.07, 0.62);
      const line = (a: number, b: number) => v > 0.49 && v < 0.51 && u > a && u < b;
      const ret = (v > 0.78 && v < 0.8 && u > 0.5 && u < 0.88) || (u > 0.49 && u < 0.51 && v > 0.62 && v < 0.8) || (u > 0.87 && u < 0.89 && v > 0.62 && v < 0.8);
      return node(0.12) || node(0.5) || node(0.88) || line(0.19, 0.43) || line(0.57, 0.81) || ret;
    }
    case "grid":
      return x % 6 === 0 || y % 4 === 0;
  }
}

/** Faint glyph art made of repeated "0" characters. Decorative only. */
export function GlyphArt({ shape, cols = 64, rows = 32, className = "" }: { shape: Shape; cols?: number; rows?: number; className?: string }) {
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let s = "";
    for (let x = 0; x < cols; x++) s += filled(shape, x, y, cols, rows) ? "0" : " ";
    lines.push(s.trimEnd());
  }
  return (
    <pre aria-hidden className={`pointer-events-none select-none overflow-hidden font-mono text-[10px] leading-[10px] text-l-art ${className}`}>
      {lines.join("\n")}
    </pre>
  );
}
