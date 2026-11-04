import type { Metadata } from "next";
import { CtaFooter } from "@/components/landing/CtaFooter";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Nav } from "@/components/landing/Nav";
import { Problem } from "@/components/landing/Problem";
import { Safety } from "@/components/landing/Safety";
import { Showcase } from "@/components/landing/Showcase";
import { Ticker } from "@/components/landing/Ticker";

export const metadata: Metadata = {
  title: "ShadowTrade — Private trading on Monad",
  description:
    "Trade perps on Perpl and spot on Kuru from a fresh wallet with no on-chain link to yours. In and out in seconds.",
};

export default function Landing() {
  return (
    <div className="landing min-h-screen bg-l-bg text-l-fg">
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <Problem />
        <HowItWorks />
        <Showcase />
        <Safety />
        <Faq />
      </main>
      <CtaFooter />
    </div>
  );
}
