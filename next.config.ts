import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Next's dev-tools button (development only) sits bottom left, out of the way of the page's controls.
  devIndicators: { position: "bottom-left" },
  trailingSlash: true,
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
