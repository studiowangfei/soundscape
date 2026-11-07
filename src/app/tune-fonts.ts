import { Cormorant_Garamond, DM_Serif_Display, EB_Garamond, Fraunces, Instrument_Serif, Lora, Newsreader, Playfair_Display, Source_Serif_4 } from "next/font/google";

// The other serifs offered in Tune → Text (components/typeface.ts), loaded only while developing (layout.tsx): the
// deployed site always shows Libre Baskerville, so it ships none of these. Not preloaded: a browser only downloads the
// one in use. (next/font needs each call's options written out literally.)
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const playfairDisplay = Playfair_Display({ variable: "--font-playfair-display", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const ebGaramond = EB_Garamond({ variable: "--font-eb-garamond", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const cormorantGaramond = Cormorant_Garamond({ variable: "--font-cormorant-garamond", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], style: ["normal", "italic"], preload: false });
const dmSerifDisplay = DM_Serif_Display({ variable: "--font-dm-serif-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"], preload: false });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"], preload: false });

/** Their CSS variables, as classes for <html>. */
export const tuneFontVariables = [newsreader, playfairDisplay, lora, ebGaramond, cormorantGaramond, fraunces, sourceSerif, dmSerifDisplay, instrumentSerif].map((f) => f.variable).join(" ");
