import Link from "next/link";
import { CoinRing } from "./CoinRing";
import { KURU_ENABLED } from "@/lib/config";

export function Hero() {
  return (
    <section className="landing relative isolate flex min-h-[min(100svh,960px)] flex-col items-center justify-center overflow-hidden bg-l-bg px-4 pb-16 pt-16 text-l-fg sm:px-6">
      <CoinRing />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: "radial-gradient(ellipse 44% 36% at 50% 52%, var(--l-bg) 42%, color-mix(in srgb, var(--l-bg) 70%, transparent) 70%, transparent 100%)" }}
      />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-l-muted">
          Private trading on Monad · Testnet
        </p>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(48px,9vw,128px)] font-extrabold leading-[0.95] tracking-[-0.045em]">
          Trade without
          <br />
          being <span className="text-l-accent">watched.</span>
        </h1>
        <p className="mt-7 max-w-xl text-pretty font-[family-name:var(--font-display)] text-lg font-medium text-l-muted sm:text-xl">
          {KURU_ENABLED ? "Perps on Perpl and spot on Kuru" : "Leveraged perps on Perpl"}, from a fresh wallet with no on-chain link to yours. In and out in seconds.
        </p>
        <Link
          href="/trade"
          className="mt-9 inline-flex h-14 items-center justify-center rounded-full bg-l-fg px-8 font-[family-name:var(--font-display)] text-base font-semibold text-l-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-l-accent"
        >
          Launch app
        </Link>
        <a href="#how" className="mt-4 font-mono text-xs tracking-[0.04em] text-l-muted underline-offset-4 hover:text-l-fg hover:underline">
          How it works ↓
        </a>
      </div>
    </section>
  );
}
