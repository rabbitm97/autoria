import type { Metadata } from "next";
import { Fraunces, DM_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const switzer = localFont({
  src: "./fonts/Switzer-Variable.woff2",
  variable: "--font-switzer",
  display: "swap",
  weight: "100 900",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
  weight: "variable",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://useautoria.com"),
  title: {
    default: "Autoria — Publique seu livro com IA, do manuscrito ao leitor",
    template: "%s | Autoria",
  },
  description:
    "A plataforma brasileira de publicação com IA. Revisão, capa e diagramação para eBook e livro impresso — a partir de R$197 por obra, sem tiragem mínima.",
  keywords: [
    "publicar livro",
    "autopublicação",
    "self-publishing brasil",
    "plataforma de publicação",
    "capa de livro ia",
    "revisão textual ia",
    "publicar no kindle",
    "amazon kdp",
    "epub",
    "diagramação de livro",
    "isbn",
  ],
  authors: [{ name: "Autoria" }],
  creator: "Autoria",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://useautoria.com",
    siteName: "Autoria",
    title: "Autoria — Publique seu livro com IA",
    description:
      "Do manuscrito ao livro pronto. Revisão, capa e diagramação com IA, em português — a partir de R$197.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Autoria — Plataforma de publicação com IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Autoria — Publique seu livro com IA",
    description: "Do manuscrito ao livro pronto, a partir de R$197.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/avatar-amarelo.png", type: "image/png" },
    ],
    apple: [
      { url: "/avatar-amarelo.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/avatar-amarelo.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: "https://useautoria.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${switzer.variable} ${fraunces.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
