"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useArtwork, type Song } from "./art";
import { defaults, PARAMS, type Param, type Params } from "./params";
import { Blur, Echo, Fog, Glass, Halftone, Mosaic, PixelGlass, Zoom } from "./variants";
import { TUNING } from "../tuning";

export const VARIANTS = [
  { key: "mosaic", label: "Mosaic", C: Mosaic },
  { key: "halftone", label: "Halftone", C: Halftone },
  { key: "blur", label: "Blur", C: Blur },
  { key: "zoom", label: "Zoom", C: Zoom },
  { key: "glass", label: "Glass", C: Glass },
  { key: "pixelglass", label: "Pixel glass", C: PixelGlass },
  { key: "fog", label: "Fog", C: Fog },
  { key: "echo", label: "Echo", C: Echo },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];
export type AllParams = Record<VariantKey, Params>;

const STORE = "soundscape.backdrop";
const PARAM_STORE = "soundscape.backdrop.params";

const initialParams = () => Object.fromEntries(VARIANTS.map((v) => [v.key, defaults(PARAMS[v.key])])) as AllParams;

/** The song pages' background style in the deployed site (and the starting one while developing). */
export const SHIPPED_VARIANT: VariantKey = "fog";

/** The backdrop style: the shipped one; while developing, the one chosen and remembered, with the number keys as shortcuts. */
export function useBackdropVariant(): [VariantKey, (v: VariantKey) => void] {
  const [v, setV] = useState<VariantKey>(SHIPPED_VARIANT);
  useEffect(() => {
    if (!TUNING) return;
    const saved = localStorage.getItem(STORE) as VariantKey | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    if (saved && VARIANTS.some((x) => x.key === saved)) setV(saved);
  }, []);
  const set = (next: VariantKey) => {
    setV(next);
    localStorage.setItem(STORE, next);
  };
  useEffect(() => {
    if (!TUNING) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VARIANTS.length) {
        setV(VARIANTS[n - 1].key);
        localStorage.setItem(STORE, VARIANTS[n - 1].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [v, set];
}

/** Persisted per-style settings from the Tune panel; saved values are merged over the defaults (new keys appear). */
export function useBackdropParams() {
  const [all, setAll] = useState<AllParams>(initialParams);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PARAM_STORE) ?? "{}") as Partial<AllParams>;
      const base = initialParams();
      for (const v of VARIANTS) base[v.key] = { ...base[v.key], ...saved[v.key] };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setAll(base);
    } catch {
      // Unreadable settings: keep the defaults.
    }
  }, []);
  const save = (next: AllParams) => {
    setAll(next);
    localStorage.setItem(PARAM_STORE, JSON.stringify(next));
  };
  const setParam = (variant: VariantKey, key: string, value: number) => save({ ...all, [variant]: { ...all[variant], [key]: value } });
  const reset = (variant: VariantKey) => save({ ...all, [variant]: defaults(PARAMS[variant]) });
  return { params: all, setParam, reset };
}

/**
 * Full-screen backdrop for the current song in the chosen style, cross-fading between styles. As tall as the window
 * with the browser's toolbars away (h-lvh): on phones it doesn't resize (and rebuild) as they come and go on scroll.
 */
export function Backdrop({ song, variant, params }: { song: Song; variant: VariantKey; params: Params }) {
  const art = useArtwork(song.cover, song.coverKind);
  const V = VARIANTS.find((x) => x.key === variant)!;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh bg-[#0d0b0a]">
      <AnimatePresence>
        {art && (
          <motion.div key={variant} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <V.C art={art} p={params} song={song} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Keep the content side calm whatever the style. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_35%,rgba(13,11,10,0.55))] wide:bg-[linear-gradient(to_right,rgba(13,11,10,0.5),transparent_55%)]" />
    </div>
  );
}

type SwitcherProps = {
  value: VariantKey;
  onChange: (v: VariantKey) => void;
  params: Params;
  onParam: (key: string, value: number) => void;
  onReset: () => void;
  /** More Tune groups after the style's own (e.g. the app's typeface). */
  extra?: TuneSection[];
  /** Where the Tune button sits (fixed-position classes). */
  className?: string;
};

/** The Tune button and its panel: the background style picker, then sliders for the selected style's settings. */
export function BackdropSwitcher({ value, onChange, params, onParam, onReset, extra = [], className }: SwitcherProps) {
  const current = VARIANTS.find((x) => x.key === value)!;
  return (
    <TunePanel sections={[{ title: current.label, specs: PARAMS[value], values: params, onParam }, ...extra]} onReset={onReset} className={className}>
      <p className="mb-3 font-medium text-white">Background</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Background style">
        {VARIANTS.map((x, i) => (
          <button
            key={x.key}
            role="radio"
            aria-checked={value === x.key}
            title={`${x.label} (press ${i + 1})`}
            onClick={() => onChange(x.key)}
            className="relative rounded-full px-3 py-1.5 font-medium text-white/60 transition-colors hover:text-white aria-checked:text-black"
          >
            {value === x.key && <motion.span layoutId="backdrop-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{x.label}</span>
          </button>
        ))}
      </div>
    </TunePanel>
  );
}

/** A headed group in the Tune panel. The first group's Reset is the panel's; a later group shows one if it has its own. */
export type TuneSection = { title: string; specs: Param[]; values: Params; onParam: (key: string, value: number) => void; onReset?: () => void };

/**
 * The Tune button, small and round (top left unless `className` places it elsewhere), and the panel it opens below
 * it: the page's own picker first if it has one (`children`, e.g. the background styles), then headed groups of
 * settings (a slider, dropdown or switch each; see params.ts), a setting hidden while the switch it depends on is off.
 */
export function TunePanel({ sections, onReset, children, className = "top-5 left-5" }: { sections: TuneSection[]; onReset: () => void; children?: React.ReactNode; className?: string }) {
  const [tuning, setTuning] = useState(false);
  return (
    <div data-backdrop-ui className={`fixed z-30 flex flex-col items-start gap-2 text-[12px] ${className}`}>
      <button
        onClick={() => setTuning(!tuning)}
        aria-expanded={tuning}
        aria-controls="backdrop-tune"
        aria-label="Tune"
        title="Tune"
        className="grid size-9 place-items-center rounded-full bg-black/45 text-white/70 outline outline-1 outline-white/10 backdrop-blur-xl transition-colors hover:text-white aria-expanded:bg-white/15 aria-expanded:text-white"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
          <rect x="2" y="4.25" width="12" height="1.5" rx="0.75" />
          <rect x="2" y="10.25" width="12" height="1.5" rx="0.75" />
          <circle cx="10.5" cy="5" r="2.25" />
          <circle cx="5.5" cy="11" r="2.25" />
        </svg>
      </button>
      <AnimatePresence>
        {tuning && (
          <motion.div
            id="backdrop-tune"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="max-h-[calc(100vh-8rem)] w-72 overflow-y-auto rounded-2xl bg-black/60 p-4 outline outline-1 outline-white/10 backdrop-blur-xl"
          >
            {children && <div className="mb-5 border-b border-white/10 pb-4">{children}</div>}
            {sections.map((section, i) => (
              <section key={section.title} className={i > 0 ? "mt-5 border-t border-white/10 pt-4" : ""}>
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="font-medium text-white">{section.title}</p>
                  {(i === 0 || section.onReset) && (
                    <button onClick={i === 0 ? onReset : section.onReset} className="text-white/45 hover:text-white">
                      Reset
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {section.specs
                    .filter((spec: Param) => !spec.when || section.values[spec.when])
                    .map((spec: Param) => (
                      <Slider key={spec.key} spec={spec} value={section.values[spec.key] ?? spec.value} onChange={(v) => section.onParam(spec.key, v)} />
                    ))}
                </div>
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Slider({ spec, value, onChange }: { spec: Param; value: number; onChange: (v: number) => void }) {
  if (spec.color) {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-white/60">{spec.label}</span>
        <input
          type="color"
          value={`#${Math.round(value).toString(16).padStart(6, "0")}`}
          onChange={(e) => onChange(parseInt(e.target.value.slice(1), 16))}
          className="h-6 w-9 shrink-0 cursor-pointer rounded-md bg-transparent"
        />
      </label>
    );
  }
  if (spec.options) {
    return (
      <label className="block">
        <span className="mb-1 block text-white/60">{spec.label}</span>
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-white outline outline-1 outline-white/10"
        >
          {spec.options.map((o, i) => (
            <option key={o} value={i} className="bg-[#1a1714]">
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (spec.min === 0 && spec.max === 1 && spec.step === 1) {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-white/60">{spec.label}</span>
        <button
          role="switch"
          aria-checked={value === 1}
          onClick={() => onChange(value === 1 ? 0 : 1)}
          className="relative h-5 w-9 shrink-0 rounded-full bg-white/15 outline outline-1 outline-white/10 transition-colors aria-checked:bg-white"
        >
          <span className={`absolute top-0.5 left-0.5 size-4 rounded-full shadow transition-transform ${value === 1 ? "translate-x-4 bg-black" : "bg-white/80"}`} />
        </button>
      </label>
    );
  }
  const decimals = spec.step < 1 ? Math.max(0, -Math.floor(Math.log10(spec.step))) : 0;
  const shown = `${value.toFixed(decimals)}${spec.unit ? ` ${spec.unit}` : ""}`;
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-white/60">
        {spec.label}
        <span className="text-white/85 tabular-nums">{shown}</span>
      </span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}
