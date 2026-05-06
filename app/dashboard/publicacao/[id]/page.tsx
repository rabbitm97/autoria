"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { PdfResult } from "@/app/api/agentes/gerar-pdf/route";
import type { EpubResult } from "@/app/api/agentes/gerar-epub/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectData {
  titulo: string;
  autor: string;
  paginas: number;
  lombadaMm: number;
  capaUrl: string | null;
  pdf: PdfResult | null;
  epub: EpubResult | null;
  mioloPreviewUrl: string | null;
}

// ─── Platform guide cards ─────────────────────────────────────────────────────

const PLATAFORMAS = [
  {
    nome: "Amazon KDP",
    icon: "A",
    formatos: "PDF + EPUB + Capa",
    prazo: "24–72h",
    comissao: "35–70% royalties",
    url: "https://kdp.amazon.com",
    cor: "bg-amber-50 border-amber-200",
    corIcon: "bg-amber-100 text-amber-700",
  },
  {
    nome: "Kobo Writing Life",
    icon: "K",
    formatos: "EPUB + Capa",
    prazo: "24–48h",
    comissao: "70% royalties",
    url: "https://kobowritinglife.com",
    cor: "bg-blue-50 border-blue-200",
    corIcon: "bg-blue-100 text-blue-700",
  },
  {
    nome: "Draft2Digital",
    icon: "D",
    formatos: "EPUB (distribui para 30+ lojas)",
    prazo: "48–96h",
    comissao: "90% para o autor",
    url: "https://draft2digital.com",
    cor: "bg-violet-50 border-violet-200",
    corIcon: "bg-violet-100 text-violet-700",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicacaoPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectData | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, pdfRes, epubRes, mioloRes] = await Promise.all([
        supabase
          .from("projects")
          .select("dados_elementos, dados_capa, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
          .eq("id", id)
          .single(),
        fetch(`/api/agentes/gerar-pdf?project_id=${id}`),
        fetch(`/api/agentes/gerar-epub?project_id=${id}`),
        fetch(`/api/agentes/miolo?project_id=${id}`),
      ]);

      const proj = projRes.data;
      const pdf: PdfResult | null = pdfRes.ok ? await pdfRes.json() : null;
      const epub: EpubResult | null = epubRes.ok ? await epubRes.json() : null;
      const mioloData = mioloRes.ok ? await mioloRes.json() : null;

      const ms = proj?.manuscripts as unknown as {
        titulo?: string;
        autor_primeiro_nome?: string;
        autor_sobrenome?: string;
      } | null;
      const el = proj?.dados_elementos as Record<string, unknown> | null;
      const capa = proj?.dados_capa as { url_escolhida?: string; url?: string } | null;
      const miolo = proj?.dados_miolo as { lombada_mm?: number; paginas_reais?: number; paginas_estimadas?: number } | null;

      setProject({
        titulo: (el?.titulo_escolhido as string) ?? ms?.titulo ?? "Sem título",
        autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor",
        paginas: miolo?.paginas_reais ?? miolo?.paginas_estimadas ?? 0,
        lombadaMm: miolo?.lombada_mm ?? 0,
        capaUrl: capa?.url_escolhida ?? capa?.url ?? null,
        pdf,
        epub,
        mioloPreviewUrl: mioloData?.preview_url ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  return (
    <div>
      <EtapasProgress currentStep={7} projectId={id} />

      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 8 — Publicação
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Seu livro está pronto
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            Baixe os arquivos finais e publique nas plataformas de sua escolha.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : project ? (
          <div className="space-y-6">

            {/* Book summary card */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex gap-5 items-start">
              {project.capaUrl ? (
                <img
                  src={project.capaUrl}
                  alt="Capa"
                  className="w-20 h-28 object-cover rounded-lg shadow-md shrink-0"
                />
              ) : (
                <div className="w-20 h-28 bg-brand-primary rounded-lg shadow-md shrink-0 flex items-center justify-center">
                  <span className="text-brand-gold text-xs font-bold text-center px-2 leading-tight">
                    {project.titulo}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    Aprovado pelo QA
                  </span>
                </div>
                <h2 className="font-heading text-xl text-brand-primary leading-tight mb-1">
                  {project.titulo}
                </h2>
                <p className="text-sm text-zinc-500">{project.autor}</p>
                {project.paginas > 0 && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {project.paginas} páginas
                    {project.lombadaMm > 0 && ` · Lombada ${project.lombadaMm}mm`}
                  </p>
                )}
              </div>
            </div>

            {/* Downloads */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">
                Arquivos para download
              </p>
              <div className="space-y-3">
                {project.pdf && (
                  <DownloadRow
                    icon={<PdfIcon />}
                    label="Miolo diagramado (PDF)"
                    meta={`Formato: ${project.pdf.formato} · gerado em ${new Date(project.pdf.gerado_em).toLocaleDateString("pt-BR")}`}
                    href={project.pdf.url_download}
                    color="emerald"
                  />
                )}
                {project.epub && (
                  <DownloadRow
                    icon={<EpubIcon />}
                    label="eBook (EPUB)"
                    meta={`${project.epub.capitulos} capítulo${project.epub.capitulos !== 1 ? "s" : ""} · gerado em ${new Date(project.epub.gerado_em).toLocaleDateString("pt-BR")}`}
                    href={project.epub.url_download}
                    color="violet"
                  />
                )}
                {project.mioloPreviewUrl && (
                  <DownloadRow
                    icon={<HtmlIcon />}
                    label="Interior — prova de revisão (HTML)"
                    meta="Versão formatada para leitura e revisão"
                    href={project.mioloPreviewUrl}
                    color="blue"
                    newTab
                  />
                )}
                {!project.pdf && !project.epub && (
                  <div className="text-sm text-zinc-400 py-2">
                    Nenhum arquivo gerado ainda.{" "}
                    <Link href={`/dashboard/miolo/${id}`} className="text-brand-gold hover:underline">
                      Vá para Diagramação
                    </Link>{" "}
                    para gerar PDF e EPUB.
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-4">
                Os links do PDF expiram em 1 hora. Regenere na etapa de Diagramação se necessário.
              </p>
            </div>

            {/* Publication wizard CTA */}
            <div className="bg-brand-primary rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="flex-1">
                <p className="font-heading text-xl text-brand-gold mb-1">
                  Publicar nas plataformas
                </p>
                <p className="text-white/60 text-sm leading-relaxed">
                  Selecione onde quer distribuir, faça o QA específico por plataforma e envie. Disponível para Amazon KDP, Kobo, Apple Books, Spotify e mais.
                </p>
              </div>
              <Link
                href={`/dashboard/publicacao-direta/${id}`}
                className="shrink-0 inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold px-6 py-3 rounded-xl hover:bg-brand-gold/90 transition-colors text-sm"
              >
                Iniciar publicação
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>

            {/* Platform guide */}
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
                Principais plataformas
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {PLATAFORMAS.map(p => (
                  <a
                    key={p.nome}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-xl border p-4 hover:shadow-sm transition-shadow ${p.cor}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${p.corIcon}`}>
                        {p.icon}
                      </span>
                      <span className="font-semibold text-sm text-zinc-800">{p.nome}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">{p.formatos}</p>
                      <p className="text-xs text-zinc-400">Prazo: {p.prazo}</p>
                      <p className="text-xs font-medium text-zinc-600">{p.comissao}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Back to dashboard */}
            <div className="pt-2 text-center">
              <Link
                href="/dashboard"
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                ← Voltar ao dashboard
              </Link>
            </div>

          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            Projeto não encontrado.
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DownloadRow({
  icon, label, meta, href, color, newTab,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  href: string;
  color: "emerald" | "violet" | "blue";
  newTab?: boolean;
}) {
  const bg = { emerald: "bg-emerald-50", violet: "bg-violet-50", blue: "bg-blue-50" }[color];
  const btnCls = {
    emerald: "bg-brand-primary text-brand-gold hover:bg-brand-primary/90",
    violet:  "bg-violet-600 text-white hover:bg-violet-700",
    blue:    "bg-blue-600 text-white hover:bg-blue-700",
  }[color];

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl border border-zinc-100 bg-zinc-50">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 truncate">{label}</p>
        <p className="text-xs text-zinc-400 truncate">{meta}</p>
      </div>
      <a
        href={href}
        download={!newTab}
        target={newTab ? "_blank" : undefined}
        rel="noreferrer"
        className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${btnCls}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          {newTab
            ? <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>
            : <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>
          }
        </svg>
        {newTab ? "Abrir" : "Baixar"}
      </a>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
    </svg>
  );
}

function HtmlIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  );
}
