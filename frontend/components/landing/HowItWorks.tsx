import type { ReactNode } from "react";
import { body, container, GlyphArt, section, SectionHead, Grey } from "./ui";
import { KURU_ENABLED } from "@/lib/config";

const VENUE_LABEL = KURU_ENABLED ? "Perpl / Kuru" : "Perpl";
const VENUE_SUB = KURU_ENABLED ? "perps · spot" : "perps";

const icons: Record<string, ReactNode> = {
  deposit: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  stealth: (
    <>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
    </>
  ),
  trade: <path d="M8 5v14M6 8h4v7H6zM16 3v17M14 6h4v9h-4z" />,
  exit: <path d="M5 12h13M14 8l4 4-4 4M5 5v14" />,
};

const steps = [
  ["deposit", "Deposit", KURU_ENABLED ? "Move AUSD or USDC into your private balance." : "Move AUSD into your private balance."],
  ["stealth", "Go stealth", "We create a fresh wallet in your browser, fund it with a fixed amount from the pool, and cover the gas."],
  ["trade", "Trade", KURU_ENABLED ? "Long, short or swap on Perpl and Kuru, like any other wallet." : "Go long or short on Perpl, like any other wallet."],
  ["exit", "Exit", "Positions close, funds return to your private balance, the key is erased."],
] as const;

const seen = [
  ["Pool", "0x8F2…a19c", "1,000 AUSD · new wallet"],
  ["Relayer", "0x8F2…a19c", "0.5 MON gas"],
  ["0x8F2…a19c", "Perpl", "open & close ETH long"],
  ["0x8F2…a19c", "Pool", "1,042 AUSD"],
] as const;

function Node({ x, y, w = 168, label, sub, accent = false }: { x: number; y: number; w?: number; label: string; sub: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="64" className={accent ? "fill-l-accent/10 stroke-l-accent" : "fill-l-bg stroke-l-rule"} strokeWidth="1" />
      <text x={x + 16} y={y + 28} className={`font-mono text-[12px] font-medium uppercase tracking-[0.06em] ${accent ? "fill-l-accent" : "fill-l-fg"}`}>{label}</text>
      <text x={x + 16} y={y + 47} className="fill-l-soft font-mono text-[10px]">{sub}</text>
    </g>
  );
}

const ariaLabel =
  `Your wallet deposits to a private balance, which funds a fresh burner wallet that trades on ${KURU_ENABLED ? "Perpl or Kuru" : "Perpl"}, then returns to the private balance. There is no on-chain link between your wallet and the burner.`;

function Wide() {
  return (
    <svg viewBox="0 0 900 260" className="hidden h-auto w-full md:block" role="img" aria-label={ariaLabel}>
      <style>{`@keyframes st-dash{to{stroke-dashoffset:-22}}@media (prefers-reduced-motion:no-preference){.flow-dash{animation:st-dash 1.6s linear infinite}}`}</style>
      <defs>
        <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 8 4 0 8z" className="fill-l-muted" />
        </marker>
        <marker id="ahA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 8 4 0 8z" className="fill-l-accent" />
        </marker>
      </defs>
      <path d="M84 84 V38 H572 V84" fill="none" className="stroke-l-soft" strokeDasharray="4 4" />
      <rect x="236" y="26" width="184" height="24" className="fill-l-bg stroke-l-soft" />
      <text x="328" y="42" textAnchor="middle" className="fill-l-muted font-mono text-[10px] uppercase tracking-[0.08em]">No on-chain link</text>
      <Node x={0} y={84} label="Your wallet" sub="public" />
      <Node x={244} y={84} label="Private balance" sub="shared pool" accent />
      <Node x={488} y={84} label="Fresh wallet" sub="burner · 0x8F2…a19c" />
      <Node x={732} y={84} label={VENUE_LABEL} sub={VENUE_SUB} />
      {[168, 412, 656].map((x) => (
        <line key={x} x1={x + 4} x2={x + 74} y1="116" y2="116" className="stroke-l-muted" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#ah)" />
      ))}
      <path d="M816 148 V212 H328 V152" fill="none" strokeWidth="1" strokeDasharray="6 5" markerEnd="url(#ahA)" className="stroke-l-accent flow-dash" />
      <text x="572" y="238" textAnchor="middle" className="fill-l-accent font-mono text-[10px] uppercase tracking-[0.08em]">Exit: everything returns</text>
    </svg>
  );
}

function Narrow() {
  return (
    <svg viewBox="0 0 320 470" className="mx-auto h-auto w-full max-w-sm md:hidden" role="img" aria-label={ariaLabel}>
      <defs>
        <marker id="ahv" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 8 4 0 8z" className="fill-l-muted" />
        </marker>
        <marker id="ahvA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 8 4 0 8z" className="fill-l-accent" />
        </marker>
      </defs>
      <path d="M26 30 H12 V272 H26" fill="none" className="stroke-l-soft" strokeDasharray="4 4" />
      <text transform="translate(8 150) rotate(-90)" textAnchor="middle" className="fill-l-muted font-mono text-[9px] uppercase tracking-[0.08em]">No on-chain link</text>
      <Node x={32} y={0} w={216} label="Your wallet" sub="public" />
      <Node x={32} y={110} w={216} label="Private balance" sub="shared pool" accent />
      <Node x={32} y={220} w={216} label="Fresh wallet" sub="burner · 0x8F2…a19c" />
      <Node x={32} y={330} w={216} label={VENUE_LABEL} sub={VENUE_SUB} />
      {[64, 174, 284].map((y) => (
        <line key={y} x1="140" x2="140" y1={y + 4} y2={y + 42} className="stroke-l-muted" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#ahv)" />
      ))}
      <path d="M248 362 H296 V142 H254" fill="none" className="stroke-l-accent" strokeWidth="1" strokeDasharray="6 5" markerEnd="url(#ahvA)" />
      <text x="160" y="436" textAnchor="middle" className="fill-l-accent font-mono text-[9px] uppercase tracking-[0.08em]">Exit: everything returns</text>
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className={`${section} overflow-hidden`}>
      <div className={`${container} relative`}>
        <SectionHead n="02" label="How it works" title={<>One fresh wallet <Grey>per trade session.</Grey></>} lead="You trade from a brand-new wallet that has never touched yours. When you're done, everything goes back." />
        <div className="relative mt-16 border border-l-rule bg-l-bg p-6 sm:p-10">
          <GlyphArt shape="grid" cols={230} rows={34} className="absolute inset-0 hidden opacity-60 md:block" />
          <div className="relative">
            <Wide />
            <Narrow />
          </div>
        </div>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([ic, t, d], i) => (
            <li key={t} className={`flex flex-col border border-l-rule bg-l-bg p-6 `}>
              <div className="flex items-start justify-between">
                <span className="font-mono text-[13px] font-medium text-l-muted">0{i + 1}</span>
                <span className="grid size-12 place-items-center rounded-full border border-l-rule text-l-fg">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>{icons[ic]}</svg>
                </span>
              </div>
              <div className="pt-8">
                <h3 className="font-sans text-[24px] font-extrabold leading-tight tracking-[-0.04em]">{t}</h3>
                <p className={`mt-3 ${body}`}>{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 border border-l-rule bg-l-bg">
          <div className="grid lg:grid-cols-[1.5fr_1fr]">
            <div className="p-6 sm:p-8">
              <p className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-l-muted">What the world sees</p>
              <ul className="mt-5 border border-l-rule-soft font-mono text-[13px] font-medium">
                {seen.map(([f, t, w]) => (
                  <li key={f + t + w} className="flex flex-col gap-1 border-b border-l-rule-soft px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-l-fg">{f} <span className="text-l-soft">→</span> {t}</span>
                    <span className="text-l-ink-2">{w}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] font-medium text-l-faint">Illustrative</p>
            </div>
            <div className="border-t border-l-rule p-6 sm:p-8 lg:border-l lg:border-t-0">
              <p className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-l-muted">What actually happened</p>
              <p className="mt-5 font-sans text-[clamp(2.25rem,4.5vw,3.25rem)] font-extrabold leading-none tracking-[-0.05em] text-l-fg">You <span className="text-l-accent">traded.</span></p>
              <p className={`mt-4 ${body}`}>A new wallet, funded by a pool everyone uses. Nothing in the trail points to you.</p>
              <p className="mt-4 font-mono text-[11px] font-medium leading-relaxed text-l-faint">Testnet. The pool today is a development pool, not zero-knowledge.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
