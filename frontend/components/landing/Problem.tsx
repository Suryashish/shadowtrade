import { body, container, GlyphArt, Grey, section, SectionHead } from "./ui";

const items = [
  { m: "01", k: "Copy-traders follow you", t: "Bots mirror your trades and get in first, so you pay worse prices." },
  { m: "02", k: "Your stop-loss is visible", t: "Your position and liquidation price are public. Big players can push the price to hit it." },
  { m: "03", k: "Your whole history is exposed", t: "Balances, wins and losses are one explorer search away." },
];

export function Problem() {
  return (
    <section id="problem" className={`${section} overflow-hidden`}>
      <GlyphArt shape="ring" cols={70} rows={38} className="absolute -right-16 top-10 hidden lg:block" />
      <div className={`${container} relative`}>
        <SectionHead
          n="01"
          label="The problem"
          title={<>Your wallet is a <Grey>glass box.</Grey></>}
          lead="Every trade you make is public and tied to your address — so people watch it."
        />
        <ul className="mt-14 grid gap-4 md:grid-cols-3 md:gap-6">
          {items.map((i) => (
            <li key={i.k} className={`flex flex-col border border-l-rule bg-l-bg p-6 sm:p-8`}>
              <span className="font-mono text-[13px] font-medium text-l-accent">{i.m}</span>
              <h3 className="mt-6 font-sans text-[22px] font-extrabold leading-tight tracking-[-0.04em] text-l-fg">{i.k}</h3>
              <p className={`mt-3 ${body}`}>{i.t}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
