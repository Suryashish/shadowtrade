import { body, container, focusRing, Grey, section, SectionHead } from "./ui";
import { KURU_ENABLED } from "@/lib/config";

const faqs = [
  ["Do you ever hold my funds?", "No. Keys are created in your browser and never sent to us, so we can't move your funds. Exit always returns them to your private balance, and you withdraw to any address you choose."],
  ["What do I need to start?", `A wallet with a little MON for gas on Monad testnet, plus AUSD for perps${KURU_ENABLED ? " or USDC for spot" : ""}.`],
  ["What happens if I close the tab?", "Nothing is lost. Your session is saved encrypted on this device, so just sign again to resume. It is erased when you exit."],
  ["Is it fully anonymous?", "It breaks the link between your wallet and your trades, but not everything. The testnet pool is a development pool, not zero-knowledge yet, so its deposit and withdraw records are public, and your trading style can still be fingerprinted."],
  ["Which markets can I trade?", `Perpl perps: BTC up to 15×, ETH 12×, SOL 10×, plus MON, ZEC, LIT, PUMP and NEAR. ${KURU_ENABLED ? "Kuru spot: WETH/USDC and cbBTC/USDC." : "Spot on Kuru (WETH/USDC, cbBTC/USDC) is coming soon."}`],
  ["Is this legal?", "ShadowTrade is non-custodial software for commercial privacy, like not publishing your positions to everyone. Rules differ by jurisdiction and this is not legal advice."],
] as const;

export function Faq() {
  return (
    <section id="faq" className={section}>
      <div className={`${container} grid gap-14 lg:grid-cols-[1fr_1.6fr]`}>
        <SectionHead n="05" label="FAQ" title={<>Straight <Grey>answers.</Grey></>} />
        <div className="border border-l-rule bg-l-bg">
          {faqs.map(([q, a], i) => (
            <details key={q} className="group border-b border-l-rule last:border-b-0">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-6 p-6 font-sans text-[18px] font-bold tracking-[-0.02em] [&::-webkit-details-marker]:hidden ${focusRing} focus-visible:-outline-offset-2`}>
                <span className="flex gap-5"><span className="font-mono text-[13px] font-medium text-l-muted">{String(i + 1).padStart(2, "0")}</span>{q}</span>
                <span aria-hidden className="relative size-4 shrink-0 font-mono text-[20px] leading-none">
                  <span className="absolute inset-0 grid place-items-center group-open:hidden">+</span>
                  <span className="absolute inset-0 hidden place-items-center group-open:grid">−</span>
                </span>
              </summary>
              <p className={`max-w-2xl px-6 pb-7 sm:pl-[4.5rem] ${body}`}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
