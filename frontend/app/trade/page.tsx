import type { Metadata } from "next";
import { Terminal } from "@/components/terminal/Terminal";

export const metadata: Metadata = { title: "Trade — ShadowTrade" };

export default function TradePage() {
  return <Terminal />;
}
