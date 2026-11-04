import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Arrow, btnOutline, container, focusRing } from "./ui";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-l-rule-soft bg-l-bg/90 text-l-fg backdrop-blur-md">
      <div className={`${container} flex h-16 items-center justify-between`}>
        <Link href="/" aria-label="ShadowTrade home" className={focusRing}>
          <Logo />
        </Link>
        <div className="flex items-center gap-10">
          <nav aria-label="Primary" className="hidden items-center gap-10 md:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className={`font-mono text-[13px] font-medium uppercase tracking-[0.1em] text-l-ink-2 transition-colors hover:text-l-accent ${focusRing}`}>
                {l.label}
              </a>
            ))}
          </nav>
          <Link href="/trade" className={`${btnOutline} !px-5 !py-2.5 !text-[13px]`}>
            Launch app <Arrow />
          </Link>
        </div>
      </div>
    </header>
  );
}
