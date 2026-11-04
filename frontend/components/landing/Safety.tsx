import { container, Grey, section, SectionHead } from "./ui";

const items = [
  { t: "Your keys, your device", d: "Keys are made in your browser and never leave it. We can't move your funds.", m: "Non-custodial" },
  { t: "A refresh can't lose funds", d: "Your session is saved encrypted on this device. Sign with your wallet to resume.", m: "AES-GCM · erased on exit" },
  { t: "Nothing that fingerprints you", d: "Sessions use fixed sizes, and gas is paid by a shared relayer, never your wallet.", m: "500 · 1k · 5k · 10k" },
  { t: "In and out in seconds", d: "About 12 seconds to enter on Monad, and exit is just as quick.", m: "~400ms blocks · ~800ms finality" },
] as const;

export function Safety() {
  return (
    <section id="safety" className={section}>
      <div className={container}>
        <SectionHead
          n="04"
          label="Built to be safe"
          title={<>Private by default. <Grey>Yours the whole time.</Grey></>}
          lead="Your wallet never touches your trades, and you stay in control from deposit to exit."
        />
        <div className="mt-14 grid border border-l-rule bg-l-bg sm:grid-cols-2">
          {items.map((it, i) => (
            <div
              key={it.t}
              className={`flex flex-col gap-4 p-7 sm:p-9 ${i % 2 === 0 ? "sm:border-r" : ""} ${i < 2 ? "border-b" : i === 2 ? "border-b sm:border-b-0" : ""} border-l-rule`}
            >
              <span className="font-mono text-[12px] font-medium text-l-muted">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-sans text-[22px] font-bold tracking-[-0.03em] text-l-fg">{it.t}</h3>
              <p className="max-w-sm font-mono text-[14px] font-medium leading-[1.7] text-l-ink-2">{it.d}</p>
              <p className="mt-auto pt-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-l-soft">{it.m}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-5 border border-l-rule bg-l-panel p-6 sm:flex-row sm:items-center sm:gap-8 sm:px-9">
          <div className="flex shrink-0 items-center gap-4" role="img" aria-label="Example privacy score: 85 out of 100, strong">
            <div className="h-2 w-40 border border-l-rule bg-l-bg">
              <div className="h-full w-[85%] bg-l-accent" />
            </div>
            <span className="font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-l-fg">85/100 Strong</span>
          </div>
          <p className="font-mono text-[13px] font-medium leading-[1.7] text-l-ink-2">
            A live privacy score warns you before you go stealth: if your amount stands out, you moved too fast, or the pool is quiet.
          </p>
        </div>
      </div>
    </section>
  );
}
