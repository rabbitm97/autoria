"use client";

import { useState, useEffect } from "react";

export const FONT_CATALOG = [
  { id: "fraunces",   label: "Fraunces",           family: "Fraunces",          cssFamily: "Fraunces, serif",           category: "serif" },
  { id: "cormorant",  label: "Cormorant Garamond",  family: "Cormorant Garamond", cssFamily: "Cormorant Garamond, serif",  category: "serif" },
  { id: "playfair",   label: "Playfair Display",    family: "Playfair Display",  cssFamily: "Playfair Display, serif",   category: "serif" },
  { id: "syne",       label: "Syne",                family: "Syne",              cssFamily: "Syne, sans-serif",          category: "sans" },
  { id: "dm-sans",    label: "DM Sans",             family: "DM Sans",           cssFamily: "DM Sans, sans-serif",       category: "sans" },
  { id: "inter",      label: "Inter",               family: "Inter",             cssFamily: "Inter, sans-serif",         category: "sans" },
  { id: "bebas",      label: "Bebas Neue",          family: "Bebas Neue",        cssFamily: "Bebas Neue, sans-serif",    category: "display" },
  { id: "archivo",    label: "Archivo Black",       family: "Archivo Black",     cssFamily: "Archivo Black, sans-serif", category: "display" },
] as const;

export type FontId = (typeof FONT_CATALOG)[number]["id"];

export const FONT_CATALOG_BY_ID = Object.fromEntries(
  FONT_CATALOG.map((f) => [f.id, f]),
) as Record<FontId, (typeof FONT_CATALOG)[number]>;

export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);
  return ready;
}
