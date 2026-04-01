import type { Metadata } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: "800",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://autoria.app"),
  title: {
    default: "Autoria — Publique seu livro com IA, do manuscrito ao leitor",
    template: "%s | Autoria",
  },
  description:
    "A plataforma brasileira de publicação com IA. Revisão, capa, diagramação, audiolivro e distribuição em 15+ plataformas — em horas, não semanas. A partir de R$197.",
  keywords: [
    "publicar livro",
    "autopublicação",
    "self-publishing brasil",
    "plataforma de publicação",
    "capa de livro ia",
    "revisão textual ia",
    "audiolivro ia",
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
    url: "https://autoria.app",
    siteName: "Autoria",
    title: "Autoria — Publique seu livro com IA",
    description:
      "Do manuscrito ao leitor em horas. Revisão, capa, audiolivro e distribuição global — tudo com IA, em português, a partir de R$197.",
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
    description: "Do manuscrito ao leitor em horas, a partir de R$197.",
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
    canonical: "https://autoria.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${syne.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
