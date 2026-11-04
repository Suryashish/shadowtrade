"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Perspective wrapper whose frame straightens as it scrolls to the viewport
 * centre. Writes a --p (0..1) CSS variable directly: no React state per frame.
 */
export function ShowcaseTilt({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const t = r.top + r.height / 2 - vh / 2;
      const lin = Math.min(1, Math.max(0, 1 - t / (vh * 0.5)));
      const eased = 1 - Math.pow(1 - lin, 2.2);
      el.style.setProperty("--p", eased.toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} className="relative [--p:1]" style={{ perspective: "2000px" }}>
      <div
        className="relative origin-[50%_100%] will-change-transform"
        style={{
          transform: "rotateX(calc((1 - var(--p)) * 18deg)) scale(calc(0.94 + var(--p) * 0.06))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
