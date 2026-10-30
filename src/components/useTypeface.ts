"use client";

import { useEffect, useState } from "react";
import type { TuneSection } from "./backdrops/Backdrop";
import { TYPEFACE_PARAM, TYPEFACE_STORE, TYPEFACES, typefaceAt, typefaceIndex, typefaceStack } from "./typeface";

/** The app's serif typeface: what's chosen (the saved one, already applied by the <head> script) and how to change it. */
export function useTypeface() {
  const [key, setKey] = useState<string>(TYPEFACES[0].key);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TYPEFACE_STORE);
    } catch {
      // Blocked storage: the default it is.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    if (saved && TYPEFACES.some((t) => t.key === saved)) setKey(saved);
  }, []);
  const choose = (next: string) => {
    setKey(next);
    document.documentElement.style.setProperty("--font-serif", typefaceStack(next));
    try {
      localStorage.setItem(TYPEFACE_STORE, next);
    } catch {
      // Not remembered; fine.
    }
  };
  /** The Tune panel's "Text" group. */
  const section: TuneSection = { title: "Text", specs: [TYPEFACE_PARAM], values: { typeface: typefaceIndex(key) }, onParam: (_, v) => choose(typefaceAt(v)) };
  return { key, choose, section };
}
