import type { Metadata, Viewport } from "next";
import { Geist, Libre_Baskerville } from "next/font/google";
import { glassBoot } from "@/components/glass/settings";
import { typefaceBoot } from "@/components/typeface";
import { SoundtrackProvider } from "@/components/player/Soundtrack";
import { StageProvider } from "@/components/backdrops/Stage";
import "./globals.css";
import { legacyStorageBoot } from "@/components/legacy-storage";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The design's serif (song titles, card headlines, quotes), and the default in Tune → Text.
const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Soundscape",
  description: "Discover something meaningful through the song that's playing.",
};

// Edge to edge on notched phones (the backdrop runs under the notch and home indicator; controls keep clear of them
// with env(safe-area-inset-*)), the browser's toolbars in the page's own dark, and dark form controls.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0b0a",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // While developing only: the other serifs Tune → Text offers, and the saved choice applied before the first paint (the
  // condition is written out so the deployed build leaves both out; it always shows Libre Baskerville).
  const developing = process.env.NODE_ENV === "development";
  const tuneFonts = developing ? (await import("./tune-fonts")).tuneFontVariables : "";
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${libreBaskerville.variable} ${tuneFonts} h-full antialiased`}
      suppressHydrationWarning // the <head> script below may set --font-serif on <html> before React hydrates
    >
      <head>
        {/* While developing, the serif typeface chosen in Tune, applied before the first paint (components/typeface.ts). */}
        <script dangerouslySetInnerHTML={{ __html: legacyStorageBoot() + (developing ? typefaceBoot() : "") + glassBoot() }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Above the pages, so the music plays on from page to page (components/player/Soundtrack.tsx), and the backdrop
            stays as one window behind them all (components/backdrops/Stage.tsx). */}
        <SoundtrackProvider>
          <StageProvider>{children}</StageProvider>
        </SoundtrackProvider>
      </body>
    </html>
  );
}
