export interface ColorPalette {
  id: string;
  label: string;
  colors: string[];
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "literario",
    label: "Literário",
    colors: ["#1a1a2e", "#2d2d44", "#f5f0e8", "#c9a84c", "#8b7355", "#e8e2d4"],
  },
  {
    id: "negocios",
    label: "Negócios",
    colors: ["#0a0a0a", "#1e3a5f", "#ffffff", "#2563eb", "#64748b", "#f1f5f9"],
  },
  {
    id: "romance",
    label: "Romance",
    colors: ["#2d1b3d", "#8b3a52", "#f7e8f0", "#c97b8e", "#e8c5d0", "#fdf4f7"],
  },
  {
    id: "thriller",
    label: "Thriller",
    colors: ["#0d0d0d", "#1a0a00", "#c0392b", "#e74c3c", "#2c2c2c", "#f5f5f5"],
  },
  {
    id: "infantil",
    label: "Infantil",
    colors: ["#ff6b35", "#ffd700", "#4ecdc4", "#45b7d1", "#96e6a1", "#fff9c4"],
  },
  {
    id: "religioso",
    label: "Religioso",
    colors: ["#2c1810", "#8b6914", "#f5e6c8", "#c9a84c", "#6b4423", "#fdf8ef"],
  },
];
