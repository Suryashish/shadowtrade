import { IBM_Plex_Mono, Manrope } from "next/font/google";

/** Product typography: Manrope for UI and display, IBM Plex Mono for numbers, labels and body copy. */
export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-display" });
export const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
