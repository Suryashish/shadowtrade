import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Arrow, container, focusRing, Grey, h2 } from "./ui";

const out = [
  { href: "https://perpl.xyz", label: "Perpl" },
  { href: "https://kuru.io", label: "Kuru" },
  { href: "https://testnet.monadscan.com", label: "Monadscan" },
];

const linkCls = `uppercase tracking-[0.1em] text-l-ink-2 transition-colors hover:text-l-accent ${focusRing}`;

export function CtaFooter() {
  return (
    <>
      <section className="border-t border-l-rule-soft py-24 sm:py-36">
        <div className={container}>
          <h2 className={`max-w-4xl text-balance ${h2} !text-[clamp(2.75rem,7.5vw,5.625rem)]`}>
            Trade like nobody <Grey>is watching.</Grey>
          </h2>
          <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-6">
            <Link
              href="/trade"
              className={`group inline-flex items-center justify-center gap-3 border border-l-fg bg-l-fg px-8 py-4 font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-l-bg transition-opacity hover:opacity-85 ${focusRing}`}
            >
              Launch app <Arrow />
            </Link>
            <a href="#how" className={`font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-l-fg underline decoration-l-rule underline-offset-[6px] transition-colors hover:text-l-accent hover:decoration-l-accent ${focusRing}`}>
              Read how it works
            </a>
          </div>
        </div>
      </section>
      <footer className="border-t border-l-rule bg-l-bg py-10 text-l-fg">
        <div className={`${container} flex flex-col gap-8 font-mono text-[12px] font-medium md:flex-row md:items-center md:justify-between`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Logo />
            <span className="uppercase tracking-[0.1em] text-l-muted">Built on Monad · Testnet</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
            {out.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className={linkCls}>{l.label}</a>
            ))}
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className={linkCls}>
              Charts by TradingView Lightweight Charts™
            </a>
          </nav>
        </div>
        <p className={`${container} mt-8 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-l-soft`}>
          Testnet software. Not financial or legal advice.
        </p>
      </footer>
    </>
  );
}
