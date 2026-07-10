"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import JSZip from "jszip";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { PropositoPublicacao } from "@/app/api/agentes/creditos/route";
import type { PublicacaoDownloadsResponse } from "@/app/api/publicacao/[id]/downloads/route";

interface ProjectMeta {
  titulo: string;
  autor: string;
  paginas: number;
  lombadaMm: number;
  capaThumbUrl: string | null;
  proposito: PropositoPublicacao;
  hasCreditos: boolean;
}

const ACEITE_STORAGE_KEY = "autoria:contrato-aceito:v0.1";

export default function PublicacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [downloads, setDownloads] = useState<PublicacaoDownloadsResponse | null>(null);
  const [contratoAceito, setContratoAceito] = useState(false);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ACEITE_STORAGE_KEY);
    setContratoAceito(stored === "true");
  }, []);

  const toggleAceite = useCallback(() => {
    setContratoAceito(prev => {
      const next = !prev;
      if (typeof window !== "undefined") {
        if (next) window.localStorage.setItem(ACEITE_STORAGE_KEY, "true");
        else window.localStorage.removeItem(ACEITE_STORAGE_KEY);
      }
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, downloadsRes] = await Promise.all([
        supabase
          .from("projects")
          .select("dados_elementos, dados_capa, dados_miolo, dados_creditos, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
          .eq("id", id)
          .single(),
        fetch(`/api/publicacao/${id}/downloads`),
      ]);

      const proj = projRes.data;
      const ms = proj?.manuscripts as unknown as {
        titulo?: string;
        autor_primeiro_nome?: string;
        autor_sobrenome?: string;
      } | null;
      const el = proj?.dados_elementos as Record<string, unknown> | null;
      const capa = proj?.dados_capa as { url_escolhida?: string; url?: string } | null;
      const miolo = proj?.dados_miolo as { lombada_mm?: number; paginas_reais?: number; paginas_estimadas?: number } | null;
      const creditos = proj?.dados_creditos as {
        config?: { proposito?: string };
        html_storage_path?: string | null;
      } | null;

      const propRaw = creditos?.config?.proposito;
      const proposito: PropositoPublicacao =
        propRaw === "livrarias" || propRaw === "completa" ? "completa" : "digital";
      const hasCreditos = proposito === "completa"
        ? true
        : creditos?.html_storage_path != null;

      setMeta({
        titulo: (el?.titulo_escolhido as string) ?? ms?.titulo ?? "Sem título",
        autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor",
        paginas: miolo?.paginas_reais ?? miolo?.paginas_estimadas ?? 0,
        lombadaMm: miolo?.lombada_mm ?? 0,
        capaThumbUrl: capa?.url_escolhida ?? capa?.url ?? null,
        proposito,
        hasCreditos,
      });

      if (downloadsRes.ok) {
        const d: PublicacaoDownloadsResponse = await downloadsRes.json();
        setDownloads(d);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const baixarZip = useCallback(async () => {
    if (!downloads || zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const mioloFolder = zip.folder("miolo");
      const capaFolder = zip.folder("capa");
      const audioFolder = zip.folder("audiolivro");

      const jobs: Array<Promise<void>> = [];
      const addFile = (folder: JSZip | null, item: { url: string; filename: string } | null) => {
        if (!folder || !item) return;
        jobs.push(
          fetch(item.url)
            .then(r => r.blob())
            .then(blob => { folder.file(item.filename, blob); })
            .catch(err => { console.warn(`[zip] falha em ${item.filename}:`, err); }),
        );
      };

      addFile(mioloFolder, downloads.miolo.pdf_impressao);
      addFile(mioloFolder, downloads.miolo.pdf_digital);
      addFile(zip, downloads.ebook.epub);
      addFile(capaFolder, downloads.capa.jpeg_ebook);
      addFile(capaFolder, downloads.capa.jpeg_completa);
      addFile(capaFolder, downloads.capa.pdf_cmyk);
      addFile(capaFolder, downloads.capa.pdf_rgb);
      addFile(capaFolder, downloads.capa.capa_original);
      downloads.audiolivro.capitulos.forEach(cap => addFile(audioFolder, cap));

      await Promise.all(jobs);

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const safeTitle = (meta?.titulo ?? "livro").replace(/[^a-z0-9\-_]/gi, "-").toLowerCase();
      link.download = `${safeTitle}-completo.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setZipping(false);
    }
  }, [downloads, zipping, meta]);

  const iniciarPublicacao = useCallback(() => {
    if (!contratoAceito) return;
    router.push(`/dashboard/publicacao-direta/${id}`);
  }, [contratoAceito, router, id]);

  const irParaImpressao = useCallback(() => {
    router.push(`/dashboard/publicacao/${id}/impressao`);
  }, [router, id]);

  const mostrarGrupoCapa = useMemo(() => {
    if (!downloads) return false;
    const { origem, jpeg_ebook, jpeg_completa, pdf_cmyk, pdf_rgb, capa_original } = downloads.capa;
    if (origem === "upload") return !!(capa_original || jpeg_ebook);
    return !!(jpeg_ebook || jpeg_completa || pdf_cmyk || pdf_rgb);
  }, [downloads]);

  const alertaGrafica = useMemo(() => {
    if (!downloads?.qa_grafica) return null;
    if (downloads.qa_grafica.aprovado) return null;
    if (!downloads.qa_grafica.pendencias.length) return null;
    return downloads.qa_grafica.pendencias.slice(0, 3).map(p => p.mensagem);
  }, [downloads]);

  return (
    <div>
      <EtapasProgress currentStep={7} projectId={id} />

      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 8 — Publicação
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Seu livro está pronto
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            Baixe os arquivos finais e escolha por onde publicar.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : meta ? (
          <div className="space-y-6">

            <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex gap-5 items-start">
              {(downloads?.capa.jpeg_ebook || meta.capaThumbUrl) ? (
                <img
                  src={downloads?.capa.jpeg_ebook?.url ?? meta.capaThumbUrl!}
                  alt="Capa eBook"
                  className="h-28 w-auto object-contain rounded-lg shadow-md shrink-0"
                />
              ) : (
                <div className="w-20 h-28 bg-brand-primary rounded-lg shadow-md shrink-0 flex items-center justify-center">
                  <span className="text-brand-gold text-xs font-bold text-center px-2 leading-tight">{meta.titulo}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    Aprovado pelo QA
                  </span>
                </div>
                <h2 className="font-heading text-xl text-brand-primary leading-tight mb-1">{meta.titulo}</h2>
                <p className="text-sm text-zinc-500">{meta.autor}</p>
                {meta.paginas > 0 && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {meta.paginas} páginas{meta.lombadaMm > 0 && ` · Lombada ${meta.lombadaMm}mm`}
                  </p>
                )}
              </div>
            </div>

            {downloads && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Arquivos para download
                  </p>
                  <button
                    onClick={baixarZip}
                    disabled={zipping}
                    className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-semibold px-4 py-2 rounded-lg hover:bg-brand-gold/90 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {zipping ? (
                      <>
                        <div className="w-3 h-3 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                        Preparando ZIP…
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Baixar tudo em ZIP
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-6">

                  <DownloadGroup
                    title="Miolo do livro"
                    subtitle="Interior formatado do livro"
                    iconType="pdf"
                    items={[
                      downloads.miolo.pdf_impressao && { ...downloads.miolo.pdf_impressao, label: "PDF Impressão", desc: "Com sangria e marcas de corte — para gráficas" },
                      downloads.miolo.pdf_digital && { ...downloads.miolo.pdf_digital, label: "PDF Digital", desc: "Sem marcas — para Amazon KDP, Apple Books, Kobo" },
                    ].filter(Boolean) as DownloadEntry[]}
                    fallbackHref={`/dashboard/miolo/${id}`}
                    fallbackLabel="Gerar arquivos do miolo"
                  />

                  {mostrarGrupoCapa ? (
                    <DownloadGroup
                      title="Capa"
                      iconType="capa"
                      subtitle={
                        downloads.capa.origem === "upload"
                          ? "Arquivo que você enviou"
                          : "Formatos para cada uso — plataformas digitais, gráfica offset e gráfica digital"
                      }
                      items={
                        downloads.capa.origem === "upload"
                          ? ([
                              downloads.capa.capa_original && {
                                ...downloads.capa.capa_original,
                                label: "Capa original",
                                desc: "O arquivo que você enviou",
                              },
                              downloads.capa.jpeg_ebook && {
                                ...downloads.capa.jpeg_ebook,
                                label: "Capa Ebook",
                                desc: "Só a frente — Amazon KDP, Apple Books, Kobo pedem separada",
                              },
                            ].filter(Boolean) as DownloadEntry[])
                          : ([
                              downloads.capa.jpeg_ebook && {
                                ...downloads.capa.jpeg_ebook,
                                label: "Capa Ebook",
                                desc: "Só a frente — Amazon KDP, Apple Books, Kobo pedem separada",
                              },
                              downloads.capa.jpeg_completa && {
                                ...downloads.capa.jpeg_completa,
                                label: "JPEG capa completa 300dpi",
                                desc: "Panorâmica — marketing, redes sociais, referência visual",
                              },
                              downloads.capa.pdf_cmyk && {
                                ...downloads.capa.pdf_cmyk,
                                label: "PDF gráfica CMYK",
                                desc: "Com marcas de corte, para gráfica offset (FOGRA39)",
                              },
                              downloads.capa.pdf_rgb && {
                                ...downloads.capa.pdf_rgb,
                                label: "PDF gráfica RGB",
                                desc: "Sem conversão CMYK — ideal para gráfica digital",
                              },
                            ].filter(Boolean) as DownloadEntry[])
                      }
                    />
                  ) : (
                    <div>
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-brand-primary">Capa</p>
                        <p className="text-xs text-zinc-400">Ainda não disponível</p>
                      </div>
                      <Link href={`/dashboard/capa/${id}`} className="text-xs text-brand-gold hover:underline">
                        Vá para a etapa Capa →
                      </Link>
                    </div>
                  )}

                  <DownloadGroup
                    title="eBook"
                    subtitle="Formato para leitores digitais"
                    iconType="epub"
                    items={[
                      downloads.ebook.epub && { ...downloads.ebook.epub, label: "EPUB", desc: "Padrão para todas as plataformas de eBook" },
                    ].filter(Boolean) as DownloadEntry[]}
                    fallbackHref={`/dashboard/miolo/${id}`}
                    fallbackLabel="Gerar EPUB"
                  />

                  {downloads.audiolivro.capitulos.length > 0 ? (
                    <div>
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-brand-primary">Audiolivro</p>
                        <p className="text-xs text-zinc-400">
                          {downloads.audiolivro.total_gerados} capítulo{downloads.audiolivro.total_gerados !== 1 ? "s" : ""} gerado{downloads.audiolivro.total_gerados !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {downloads.audiolivro.capitulos.map(cap => (
                          <div key={cap.index} className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-100 bg-zinc-50">
                            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
                                <path d="M3 12a9 9 0 019-9v0a9 9 0 019 9v7a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3M3 19v-7a9 9 0 019-9M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-800 truncate">{cap.titulo}</p>
                            </div>
                            <a
                              href={cap.url}
                              download={cap.filename}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              MP3
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-brand-primary">Audiolivro</p>
                        <p className="text-xs text-zinc-400">Ainda não gerado</p>
                      </div>
                      <Link href={`/dashboard/audiolivro/${id}`} className="text-xs text-brand-gold hover:underline">
                        Gerar audiolivro →
                      </Link>
                    </div>
                  )}
                </div>

                <p className="text-xs text-zinc-300 mt-6">
                  Os links expiram em 1 hora. Recarregue a página para renovar.
                </p>
              </div>
            )}

            {meta.proposito === "digital" && !meta.hasCreditos && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <path d="M14 2v6h6"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wide mb-1">Sem página de créditos</p>
                    <p className="text-sm text-zinc-700 leading-relaxed mb-3">
                      Conforme sua escolha, o livro foi gerado <strong>sem a página de créditos</strong>. O verso da folha de rosto ficou em branco.
                    </p>
                    <p className="text-sm text-zinc-700 leading-relaxed mb-3">
                      Isso funciona para <strong>plataformas digitais</strong> (Amazon KDP, Apple Books, Kobo, Kiwify) e para <strong>uso pessoal ou distribuição gratuita</strong>.
                    </p>
                    <p className="text-sm text-zinc-700 leading-relaxed mb-3">
                      Para publicar em livrarias, bibliotecas ou concursos, você pode voltar aos Créditos, ativar a página de créditos e escolher <em>Publicação completa</em> com ficha CRB oficial. Dá para solicitar a ficha pela CBL em{" "}
                      <a href="https://www.cblservicos.org.br/catalogacao/" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-900">cblservicos.org.br</a>
                      {" "}ou pelo nosso serviço em{" "}
                      <a href="mailto:contato@useautoria.com?subject=Serviço de catalogação — ficha CRB" className="underline hover:text-zinc-900">contato@useautoria.com</a>.
                    </p>
                    <Link href={`/dashboard/creditos/${id}`} className="inline-flex items-center gap-1.5 bg-zinc-800 text-white font-medium px-4 py-2 rounded-lg hover:bg-zinc-900 transition-colors text-xs">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                      Voltar aos Créditos
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {meta.proposito === "digital" && meta.hasCreditos && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide mb-1">Modo digital — antes de publicar</p>
                    <p className="text-sm text-amber-900 leading-relaxed mb-3">
                      Seu livro está pronto para publicação em <strong>plataformas digitais</strong> e para <strong>uso pessoal ou distribuição gratuita</strong>:
                    </p>
                    <ul className="text-sm text-amber-900 leading-relaxed mb-3 space-y-1 pl-1">
                      <li>✓ Amazon KDP, Apple Books, Kobo, Kiwify e similares</li>
                      <li>✓ Uso pessoal ou distribuição gratuita</li>
                    </ul>
                    <p className="text-sm text-amber-900 leading-relaxed mb-3">
                      A ficha catalográfica CRB não foi incluída — essas plataformas não a exigem. Para publicar em <strong>livrarias, bibliotecas ou concursos</strong>, você vai precisar da ficha CRB oficial. Você pode solicitar diretamente pela CBL em{" "}
                      <a href="https://www.cblservicos.org.br/catalogacao/" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-950">cblservicos.org.br</a>
                      {" "}ou entrar em contato conosco em{" "}
                      <a href="mailto:contato@useautoria.com?subject=Serviço de catalogação — ficha CRB" className="underline hover:text-amber-950">contato@useautoria.com</a>
                      {" "}para saber sobre nosso serviço de catalogação.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Link href={`/dashboard/creditos/${id}`} className="inline-flex items-center gap-1.5 bg-amber-800 text-amber-50 font-medium px-4 py-2 rounded-lg hover:bg-amber-900 transition-colors text-xs">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        Voltar aos Créditos
                      </Link>
                      <a href="https://www.cblservicos.org.br/catalogacao/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-white text-amber-900 font-medium px-4 py-2 rounded-lg border border-amber-300 hover:border-amber-500 transition-colors text-xs">
                        Solicitar ficha oficial na CBL
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-brand-primary rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="flex-1">
                  <p className="font-heading text-xl text-brand-gold mb-1">
                    Publicar nas plataformas
                  </p>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Selecione onde quer distribuir, faça o QA específico por plataforma e envie. Disponível para Amazon KDP, Kobo, Apple Books, Spotify e mais.
                  </p>
                </div>
                <button
                  onClick={iniciarPublicacao}
                  disabled={!contratoAceito}
                  className="shrink-0 inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold px-6 py-3 rounded-xl hover:bg-brand-gold/90 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!contratoAceito ? "Aceite o contrato antes de continuar" : undefined}
                >
                  Iniciar publicação
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
              <label className="flex items-start gap-3 mt-5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={contratoAceito}
                  onChange={toggleAceite}
                  className="mt-0.5 w-4 h-4 rounded border-white/30 bg-white/10 accent-brand-gold cursor-pointer"
                />
                <span className="text-sm text-white/70 leading-relaxed group-hover:text-white/85 transition-colors">
                  Li e aceito o{" "}
                  <Link href="/contrato-edicao" target="_blank" className="underline decoration-brand-gold/40 hover:decoration-brand-gold text-brand-gold/90 hover:text-brand-gold">
                    contrato de edição não exclusiva
                  </Link>
                  {" "}para publicação via Autoria. Direitos autorais e propriedade da obra permanecem 100% comigo.
                </span>
              </label>
            </div>

            <div className="bg-brand-primary rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="flex-1">
                  <p className="font-heading text-xl text-brand-gold mb-1">
                    Imprimir livro físico
                  </p>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Solicite a impressão em papel via nossa gráfica parceira, com preços por tiragem e envio para todo o Brasil.
                  </p>
                </div>
                <button
                  onClick={irParaImpressao}
                  className="shrink-0 inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold px-6 py-3 rounded-xl hover:bg-brand-gold/90 transition-colors text-sm"
                >
                  Ver opções
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
              {alertaGrafica && (
                <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-400/20 p-3">
                  <div className="flex items-start gap-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-300 shrink-0 mt-0.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div className="flex-1 text-xs text-amber-100/90 leading-relaxed">
                      <p className="font-semibold mb-1">Antes de finalizar a impressão, alguns pontos precisam de ajuste:</p>
                      <ul className="space-y-0.5 pl-3 list-disc marker:text-amber-300/60">
                        {alertaGrafica.map((msg, i) => <li key={i}>{msg}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 text-center">
              <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
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

interface DownloadEntry {
  url: string;
  filename: string;
  label: string;
  desc: string;
}

async function downloadAsBlob(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function DownloadButton({ url, filename }: { url: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadAsBlob(url, filename);
    } catch (err) {
      console.warn(`[download] falha em ${filename}:`, err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-primary text-brand-gold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? (
        <>
          <div className="w-3 h-3 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
          Baixando…
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar
        </>
      )}
    </button>
  );
}

type GroupIcon = "pdf" | "capa" | "epub" | "audio";

function DownloadGroup({
  title,
  subtitle,
  items,
  iconType,
  fallbackHref,
  fallbackLabel,
}: {
  title: string;
  subtitle: string;
  items: DownloadEntry[];
  iconType: GroupIcon;
  fallbackHref?: string;
  fallbackLabel?: string;
}) {
  if (items.length === 0 && !fallbackHref) return null;

  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-brand-primary">{title}</p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.url} className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-100 bg-zinc-50">
              <GroupItemIcon type={iconType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-800 truncate">{item.label}</p>
                <p className="text-xs text-zinc-400 truncate">{item.desc}</p>
              </div>
              <DownloadButton url={item.url} filename={item.filename} />
            </div>
          ))}
        </div>
      ) : (
        <Link href={fallbackHref!} className="text-xs text-brand-gold hover:underline">
          {fallbackLabel} →
        </Link>
      )}
    </div>
  );
}

function GroupItemIcon({ type }: { type: GroupIcon }) {
  if (type === "pdf") {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      </div>
    );
  }
  if (type === "capa") {
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    );
  }
  if (type === "epub") {
    return (
      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
        <path d="M3 12a9 9 0 019-9v0a9 9 0 019 9v7a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3M3 19v-7a9 9 0 019-9M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3"/>
      </svg>
    </div>
  );
}
