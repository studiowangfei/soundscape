import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  DM_Serif_Display,
  EB_Garamond,
  Fraunces,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Libre_Baskerville,
  Lora,
  Newsreader,
  Playfair_Display,
  Source_Serif_4,
} from "next/font/google";
import { glassBoot } from "@/components/glass/settings";
import { typefaceBoot } from "@/components/typeface";
import { SoundtrackProvider } from "@/components/player/Soundtrack";
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

// The other serifs offered in Tune → Text (components/typeface.ts). Not preloaded: a browser only downloads the one in
// use. (next/font needs each call's options written out literally.)
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const playfairDisplay = Playfair_Display({ variable: "--font-playfair-display", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const ebGaramond = EB_Garamond({ variable: "--font-eb-garamond", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const cormorantGaramond = Cormorant_Garamond({ variable: "--font-cormorant-garamond", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const dmSerifDisplay = DM_Serif_Display({ variable: "--font-dm-serif-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"], preload: false });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"], preload: false });
const serifs = [libreBaskerville, newsreader, playfairDisplay, lora, ebGaramond, cormorantGaramond, fraunces, sourceSerif, dmSerifDisplay, instrumentSerif];

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${serifs.map((f) => f.variable).join(" ")} h-full antialiased`}
      suppressHydrationWarning // the <head> script below may set --font-serif on <html> before React hydrates
    >
      <head>
        {/* The serif typeface chosen in Tune, applied before the first paint (components/typeface.ts). */}
        <script dangerouslySetInnerHTML={{ __html: legacyStorageBoot() + typefaceBoot() + glassBoot() }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Above the pages, so the music plays on from page to page (components/player/Soundtrack.tsx). */}
        <SoundtrackProvider>{children}</SoundtrackProvider>
      </body>
    </html>
  );
}
