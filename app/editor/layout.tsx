import {
  Fraunces,
  Cormorant_Garamond,
  Playfair_Display,
  Syne,
  DM_Sans,
  Inter,
  Bebas_Neue,
  Archivo_Black,
} from "next/font/google";

export const metadata = {
  title: "Editor de Capa · Autoria",
};

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
});

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-bebas-neue",
});

const archivBlack = Archivo_Black({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-archivo-black",
});

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  const fontVars = [
    fraunces.variable,
    cormorant.variable,
    playfair.variable,
    syne.variable,
    dmSans.variable,
    inter.variable,
    bebasNeue.variable,
    archivBlack.variable,
  ].join(" ");

  return (
    <div
      className={`h-screen w-screen overflow-hidden bg-[#f5f3ed] text-[#1a1a2e] ${fontVars}`}
    >
      {children}
    </div>
  );
}
