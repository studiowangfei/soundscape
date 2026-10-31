import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Next's dev-tools button (development only) sits bottom left, out of the way of the page's controls.
  devIndicators: { position: "bottom-left" },
  // Phones and tablets on the same Wi-Fi may open the dev server by this Mac's address (e.g. http://10.0.0.247:3000).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
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
