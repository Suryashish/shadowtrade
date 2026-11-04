import Image from "next/image";
import Link from "next/link";
import { Arrow, btnOutline, container, Grey, section, SectionHead } from "./ui";
import { ShowcaseTilt } from "./ShowcaseTilt";
import { KURU_ENABLED } from "@/lib/config";

const ALT =
  "ShadowTrade trading terminal during a stealth session: ETH-PERP chart, order book, an open long position and the Stealth badge showing the burner wallet";
const SIZES = "(min-width: 1280px) 1200px, 100vw";

type Callout = {
  n: number;
  text: string;
  /** anchor, % of frame */
  x: number;
  y: number;
  /** y (% of frame) where the chip sits at the end of the leader line */
  to: number;
  align: "left" | "right" | "center";
};

const callouts: Callout[] = [
  { n: 1, text: "Fresh burner wallet, never linked to yours", x: 81.6, y: 2.8, to: -11, align: "right" },
  { n: 2, text: "Live Perpl order book", x: 70.4, y: 24.5, to: -11, align: "center" },
  { n: 3, text: "Your position, opened from the burner", x: 69, y: 94.3, to: 109, align: "center" },
];

const trade = [
  ["Perpetuals · Perpl", "BTC up to 15×, ETH up to 12×, SOL up to 10×, plus MON, ZEC, LIT, PUMP, NEAR"],
  ["Spot · Kuru", KURU_ENABLED ? "WETH/USDC and cbBTC/USDC swaps" : "Coming soon: WETH/USDC and cbBTC/USDC swaps"],
  ["Session sizes", "500, 1k, 5k or 10k per session. Gas is on us."],
] as const;

function Dot({ n }: { n: number }) {
  return (
    <span className="grid size-[18px] place-items-center rounded-full bg-l-accent font-mono text-[10px] font-semibold leading-none text-l-accent-fg ring-4 ring-l-accent/25">
      {n}
    </span>
  );
}

export function Showcase() {
  return (
    <section id="product" className={`${section} overflow-x-clip`}>
      <div className={container}>
        <SectionHead
          n="03"
          label="The product"
          title={
            <>
              A real terminal, <Grey>run from a wallet nobody knows.</Grey>
            </>
          }
          lead={`Live charts, a real order book and one-click positions on ${KURU_ENABLED ? "Perpl and Kuru" : "Perpl"}. The only difference: every order comes from a fresh wallet.`}
        />

        <div className="mx-auto mt-14 max-w-[1200px] sm:mt-20 lg:mt-24">
          <div className="relative">
            {/* faint accent glow under the frame */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[8%] -bottom-10 h-24 bg-l-accent/20 blur-3xl"
            />
            <ShowcaseTilt>
              <div className="relative">
                <div className="relative aspect-[1600/820] overflow-hidden border border-l-rule bg-l-panel shadow-[0_2px_4px_rgba(0,0,0,0.04),0_30px_60px_-20px_rgba(10,20,60,0.28),0_90px_140px_-40px_rgba(10,20,60,0.3)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.5),0_30px_60px_-20px_rgba(0,0,0,0.9),0_90px_140px_-40px_rgba(40,70,255,0.25)]">
                  <Image
                    src="/landing/terminal-perps-light.png"
                    alt={ALT}
                    width={3200}
                    height={1920}
                    sizes={SIZES}
                    quality={90}
                    priority={false}
                    className="size-full object-cover object-top dark:hidden"
                  />
                  <Image
                    src="/landing/terminal-perps-dark.png"
                    alt={ALT}
                    width={3200}
                    height={1920}
                    sizes={SIZES}
                    quality={90}
                    priority={false}
                    className="hidden size-full object-cover object-top dark:block"
                  />
                  {/* top sheen */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_28%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_26%)]"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.12)_48%,transparent_56%)] dark:opacity-40"
                  />
                </div>

                {callouts.map((c) => (
                  <div key={c.n}>
                    {/* leader line (lg+) */}
                    <span
                      aria-hidden
                      className="absolute hidden w-px bg-l-accent lg:block"
                      style={{
                        left: `${c.x}%`,
                        top: `${Math.min(c.y, c.to)}%`,
                        height: `${Math.abs(c.to - c.y)}%`,
                      }}
                    />
                    {/* numbered dot */}
                    <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${c.x}%`, top: `${c.y}%` }}>
                      <Dot n={c.n} />
                    </span>
                    {/* chip (lg+) */}
                    <span
                      className={`absolute hidden whitespace-nowrap border border-l-accent bg-l-bg px-3 py-1.5 font-mono text-[12px] font-medium text-l-fg lg:block ${
                        c.align === "right" ? "-translate-x-full" : "-translate-x-1/2"
                      } ${c.to < c.y ? "-translate-y-full" : ""}`}
                      style={{ left: `${c.x}%`, top: `${c.to}%` }}
                    >
                      {c.text}
                    </span>
                  </div>
                ))}
              </div>
            </ShowcaseTilt>
          </div>

          {/* < lg: numbered list */}
          <ol className="mt-10 grid gap-3 lg:hidden">
            {callouts.map((c) => (
              <li key={c.n} className="flex items-start gap-3 font-mono text-[14px] leading-[1.6] text-l-ink-2">
                <span className="mt-[3px]">
                  <Dot n={c.n} />
                </span>
                {c.text}
              </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto mt-16 max-w-[1200px] lg:mt-28">
          <p className="mb-4 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-l-muted">What you can trade</p>
          <dl className="grid border border-l-rule-soft md:grid-cols-3 md:divide-x md:divide-l-rule-soft max-md:divide-y max-md:divide-l-rule-soft">
            {trade.map(([t, d]) => (
              <div key={t} className="p-6 sm:p-7">
                <dt className="font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-l-fg">{t}</dt>
                <dd className="mt-3 font-mono text-[14px] font-medium leading-[1.7] text-l-muted">{d}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8">
            <Link href="/trade" className={btnOutline}>
              Open the terminal
              <Arrow />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
