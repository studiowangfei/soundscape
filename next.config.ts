import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is prerendered at build time (songs: generateStaticParams, dynamicParams = false); the one thing run on
  // the server is the visitor comment endpoint (app/api/visitor-comments), which is why this isn't a static export.
  // Next's dev-tools button (development only) sits top left, with the Tune button beside it (TunePanel), clear of the
  // page's own controls in the bottom corners.
  devIndicators: { position: "top-left" },
  // Phones and tablets on the same Wi-Fi may open the dev server by this Mac's address (e.g. http://10.0.0.247:3000).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  trailingSlash: true,
  // Covers, posters and icons (copied into public/ at build time) are cached by browsers for a day, instead of being
  // re-checked on every visit (Next's default for public/ is max-age=0). The cost: a replaced image can show the old
  // one to a returning visitor for up to a day. Not while developing: a cover replaced here shows on the next reload.
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return ["covers", "posters", "icons"].map((dir) => ({ source: `/${dir}/:file*`, headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] }));
  },
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
