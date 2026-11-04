import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The landing product shot is served at 90 for crisp UI text.
  images: { qualities: [75, 90] },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
