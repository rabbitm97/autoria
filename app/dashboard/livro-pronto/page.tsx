"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AUTHOR_TITLES, GENRES } from "@/lib/generos";
import { FORMATOS_LIVRO, type FormatoLivro } from "@/lib/formatos";
import {
  detectarMarcasMioloCliente,
  type MarcasVisuaisHint,
} from "@/lib/miolo-marcas-cliente";
import { DeclaracaoTitularidade } from "@/components/declaracao-titularidade";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — guarda de UX (Storage aguenta mais)

// ─── Types ────────────────────────────────────────────────────────────────────

type Status =
  | "idle"
  | "uploading"
  | "verifying"
  | "verified_ok"
  | "verified_ko"
  | "creating"
  | "done"
  | "error";

interface CoAuthor {
  titulo: string;
  primeiro_nome: string;
  nome_meio: string;
  sobrenome: string;
}

type DeteccaoFonte = "pdf_boxes" | "visual" | "none";

interface VerificacaoOk {
  ok: true;
  paginas_reais: number;
  largura_mm: number;
  altura_mm: number;
  com_sangria: boolean;
  /** Espelha `com_sangria`, novo contrato. */
  sangria_detectada: boolean;
  /**
   * Marcas de corte detectadas. Fonte `pdf_boxes` (MediaBox > BleedBox) OU
   * `visual` (hint do cliente validado geometricamente pelo motor).
   */
  marcas_detectadas: boolean;
  /** Sangria em mm quando quantificável; `null` na fonte MediaBox cru. */
  sangria_mm: number | null;
  deteccao_fonte: DeteccaoFonte;
  lombada_mm: number;
  avisos: string[];
}

interface VerificacaoKo {
  ok: false;
  paginas_reais: number;
  largura_mm: number;
  altura_mm: number;
  com_sangria: boolean;
  sangria_detectada: boolean;
  marcas_detectadas: boolean;
  sangria_mm: number | null;
  deteccao_fonte: DeteccaoFonte;
  lombada_mm: number;
  formato_provavel?: FormatoLivro;
  divergencias: string[];
  avisos: string[];
}

type VerificacaoResp = VerificacaoOk | VerificacaoKo;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validatePdf(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const mimeOk = file.type === "application/pdf";
  const extOk = ext === ".pdf";
  if (!mimeOk && !extOk) return "Formato inválido. Envie um arquivo .pdf";
  if (file.size > MAX_BYTES) return "Arquivo muito grande. Máximo: 100 MB";
  return null;
}

const fieldClass =
  "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 bg-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 transition";

const labelClass =
  "block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivroProntoPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [generoPrincipal, setGeneroPrincipal] = useState("");
  const [generoSub, setGeneroSub] = useState("");
  const [generoDetalhe, setGeneroDetalhe] = useState("");
  const [autorTitulo, setAutorTitulo] = useState("");
  const [autorPrimeiro, setAutorPrimeiro] = useState("");
  const [autorMeio, setAutorMeio] = useState("");
  const [autorSobrenome, setAutorSobrenome] = useState("");
  const [coautores, setCoautores] = useState<CoAuthor[]>([]);

  // ── Miolo state ─────────────────────────────────────────────────────────────
  const [formato, setFormato] = useState<FormatoLivro | "">("");
  const [paginasDeclaradas, setPaginasDeclaradas] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [verificacao, setVerificacao] = useState<VerificacaoResp | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryContext, setRetryContext] = useState<{ projectId: string } | null>(null);

  // ── LEGAL-1C: Declaração de Titularidade obrigatória para upload ─────────
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);
  const [declaracaoAberta, setDeclaracaoAberta] = useState(false);

  // Path temp do PDF conferido — vira `artefato_ref` do aceite ao ser POSTado.
  const uploadedPathRef = useRef<string | null>(null);

  // Detecção visual de marcas de corte — roda no browser (pdfjs) enquanto o
  // upload/verify seguem em paralelo. Usada como pista para o motor server-side
  // quando o PDF não declara TrimBox (ex.: nossos próprios exports Chromium).
  // Guardamos a promise para conseguir aguardar antes de POSTs se o cálculo
  // ainda estiver em voo, sem bloquear a UI.
  const marcasHintRef = useRef<Promise<MarcasVisuaisHint | null> | null>(null);

  // Token monotônico: respostas de verificações antigas são descartadas se
  // os insumos (arquivo/formato/páginas) mudaram no meio do voo.
  const verifyTokenRef = useRef(0);
  // Debounce da digitação de páginas (800ms). Blur cancela e dispara imediato.
  const pagesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPagesDebounce() {
    if (pagesDebounceRef.current) {
      clearTimeout(pagesDebounceRef.current);
      pagesDebounceRef.current = null;
    }
  }

  useEffect(() => {
    return () => cancelPagesDebounce();
  }, []);

  // ── File selection ──────────────────────────────────────────────────────────

  function pickFile(f: File) {
    const err = validatePdf(f);
    if (err) {
      setError(err);
      return;
    }
    // Invalida qualquer verificação anterior + cancela responses em voo
    verifyTokenRef.current += 1;
    cancelPagesDebounce();

    setError(null);
    setFile(f);
    setHasUploaded(false);
    setVerificacao(null);

    // Dispara detecção visual em paralelo ao upload. Não bloqueia a UI —
    // o resultado é aguardado (se ainda em voo) no momento do POST verify.
    marcasHintRef.current = detectarMarcasMioloCliente(f);

    // Dispara upload imediato (não espera clique em botão)
    void uploadFileToTemp(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  // ── Co-author helpers ───────────────────────────────────────────────────────

  function addCoAuthor() {
    setCoautores([...coautores, { titulo: "", primeiro_nome: "", nome_meio: "", sobrenome: "" }]);
  }

  function removeCoAuthor(idx: number) {
    setCoautores(coautores.filter((_, i) => i !== idx));
  }

  function updateCoAuthor(idx: number, field: keyof CoAuthor, value: string) {
    setCoautores(coautores.map((ca, i) => i === idx ? { ...ca, [field]: value } : ca));
  }

  // ── Upload direto para path temp (dispara na seleção do arquivo) ────────────

  async function uploadFileToTemp(f: File) {
    setStatus("uploading");
    setUploadProgress(0);
    setError(null);

    let uploadPath: string;
    let signedUrl: string | null;
    let token: string | null;
    try {
      const res = await fetch("/api/express/upload-url", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao obter URL de upload.");
      uploadPath = data.path;
      signedUrl = data.signed_url;
      token = data.token;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na conexão.");
      setStatus("error");
      return;
    }

    if (signedUrl && token) {
      try {
        const { error: upErr } = await supabase.storage
          .from("livros")
          .uploadToSignedUrl(uploadPath, token, f, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) throw upErr;
        setUploadProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no upload do PDF.");
        setStatus("error");
        return;
      }
    }

    uploadedPathRef.current = uploadPath;
    setHasUploaded(true);
    setStatus("idle");

    // Se formato + páginas já foram declarados antes do arquivo chegar, roda
    // a verificação sozinha.
    const paginas = Number(paginasDeclaradas);
    if (formato && Number.isFinite(paginas) && paginas > 0) {
      void runVerify(formato as FormatoLivro, paginas);
    }
  }

  // ── Verificação (roda sozinha; caller garante insumos válidos) ──────────────

  async function runVerify(fmt: FormatoLivro, paginas: number) {
    const token = ++verifyTokenRef.current;
    setStatus("verifying");
    setVerificacao(null);
    setError(null);

    // Aguarda o hint visual (se ainda em voo). Falhas na detecção são
    // absorvidas em `null` — o motor server-side segue funcionando.
    const marcasHint = marcasHintRef.current
      ? await marcasHintRef.current.catch(() => null)
      : null;
    if (token !== verifyTokenRef.current) return;

    try {
      const res = await fetch("/api/express/verificar-miolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: fmt,
          paginas_declaradas: Math.round(paginas),
          marcas_visuais: marcasHint,
        }),
      });
      const data = (await res.json()) as VerificacaoResp | { error: string };
      if (token !== verifyTokenRef.current) return;
      if (!res.ok && !("ok" in data)) {
        setError((data as { error: string }).error ?? "Falha na verificação.");
        setStatus("error");
        return;
      }
      const veri = data as VerificacaoResp;
      setVerificacao(veri);
      setStatus(veri.ok ? "verified_ok" : "verified_ko");
    } catch (e) {
      if (token !== verifyTokenRef.current) return;
      setError(e instanceof Error ? e.message : "Erro na verificação.");
      setStatus("error");
    }
  }

  // ── Gatilhos: mudança de formato ou de páginas re-executa a verificação ────

  function onFormatoChange(novo: FormatoLivro) {
    setFormato(novo);
    setVerificacao(null);
    cancelPagesDebounce();
    const paginas = Number(paginasDeclaradas);
    if (hasUploaded && Number.isFinite(paginas) && paginas > 0) {
      void runVerify(novo, paginas);
    }
  }

  function onPaginasChange(v: string) {
    setPaginasDeclaradas(v);
    setVerificacao(null);
    cancelPagesDebounce();
    const paginas = Number(v);
    if (!hasUploaded || !formato) return;
    if (!Number.isFinite(paginas) || paginas <= 0) return;
    pagesDebounceRef.current = setTimeout(() => {
      pagesDebounceRef.current = null;
      void runVerify(formato as FormatoLivro, paginas);
    }, 800);
  }

  function onPaginasBlur() {
    cancelPagesDebounce();
    const paginas = Number(paginasDeclaradas);
    if (!hasUploaded || !formato) return;
    if (!Number.isFinite(paginas) || paginas <= 0) return;
    void runVerify(formato as FormatoLivro, paginas);
  }

  // ── Persistência final: cria manuscript + project + patcha formato + confirma ──

  async function persistir(existingProjectId?: string): Promise<void> {
    setError(null);
    setStatus("creating");

    const fmt = formato as FormatoLivro;

    // Sessão
    const { data: { session }, error: authErr } = await supabase.auth.getSession();
    if (authErr || !session) {
      setError("Sessão expirada. Faça login novamente.");
      setStatus("error");
      return;
    }

    let projectId = existingProjectId ?? "";

    if (!projectId) {
      // 1. INSERT manuscripts (metadados; sem storage_path/texto)
      const { data: manuscript, error: msErr } = await supabase
        .from("manuscripts")
        .insert({
          user_id: session.user.id,
          nome: titulo.trim(),
          titulo: titulo.trim(),
          subtitulo: subtitulo.trim() || null,
          genero_principal: generoPrincipal || null,
          genero_sub: generoSub || null,
          genero_detalhe: generoDetalhe || null,
          autor_titulo: autorTitulo || null,
          autor_primeiro_nome: autorPrimeiro.trim() || null,
          autor_nome_meio: autorMeio.trim() || null,
          autor_sobrenome: autorSobrenome.trim() || null,
          coautores,
          status: "rascunho",
        })
        .select("id")
        .single();

      if (msErr || !manuscript) {
        setError("Falha ao registrar o manuscrito.");
        setStatus("error");
        return;
      }

      // 2. INSERT projects
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: session.user.id,
          manuscript_id: manuscript.id,
          plano: "freemium",
          etapa_atual: "upload",
          usar_revisao: false,
        })
        .select("id")
        .single();

      if (projErr || !project) {
        setError("Manuscrito salvo, mas falha ao criar o projeto.");
        setStatus("error");
        return;
      }
      projectId = project.id;

      // LEGAL-1C: registra aceite da Declaração de Titularidade agora que
      // temos project.id. Idempotente e não bloqueante — o miolo já subiu.
      try {
        const res = await fetch("/api/legal/aceite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "declaracao-titularidade",
            contexto: "upload",
            projectId,
            artefatoRef: uploadedPathRef.current,
          }),
        });
        if (!res.ok) {
          console.error("[livro-pronto] aceite declaração falhou:", res.status);
        }
      } catch (err) {
        console.error("[livro-pronto] aceite declaração exception:", err);
      }
    }

    // 3. PATCH formato
    try {
      const patchRes = await fetch(`/api/projects/${projectId}/formato`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato: fmt }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(data?.error ?? "Falha ao gravar o formato do projeto.");
      }
    } catch (e) {
      setRetryContext({ projectId });
      setError(e instanceof Error ? e.message : "Erro ao gravar o formato.");
      setStatus("error");
      return;
    }

    // 4. Confirmar miolo — repassa o hint visual para que a re-verificação
    // server-side aceite marcas visuais quando o PDF não declara boxes.
    const marcasHint = marcasHintRef.current
      ? await marcasHintRef.current.catch(() => null)
      : null;
    try {
      const confRes = await fetch(`/api/express/confirmar-miolo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          formato: fmt,
          marcas_visuais: marcasHint,
        }),
      });
      if (!confRes.ok) {
        const data = await confRes.json().catch(() => ({}));
        throw new Error(data?.error ?? "Falha ao confirmar o miolo.");
      }
    } catch (e) {
      setRetryContext({ projectId });
      setError(e instanceof Error ? e.message : "Erro ao confirmar o miolo.");
      setStatus("error");
      return;
    }

    setStatus("done");
    router.push(`/dashboard/capa/${projectId}`);
  }

  async function handleContinuar() {
    if (!titulo.trim()) {
      setError("O título do livro é obrigatório.");
      return;
    }
    if (!verificacao || !verificacao.ok) {
      setError("Verifique o arquivo do miolo antes de continuar.");
      return;
    }
    if (!declaracaoAceita) {
      setError("Assine a Declaração de Titularidade e Originalidade para continuar.");
      return;
    }
    setRetryContext(null);
    await persistir();
  }

  async function handleRetry() {
    if (!retryContext) return;
    await persistir(retryContext.projectId);
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isProcessing = ["uploading", "verifying", "creating"].includes(status);
  const fileExt = file?.name.split(".").pop()?.toUpperCase() ?? "";
  const subcats = generoPrincipal ? Object.keys(GENRES[generoPrincipal]) : [];
  const details = generoSub && generoPrincipal ? GENRES[generoPrincipal][generoSub] : [];

  const paginasNum = Number(paginasDeclaradas);
  const paginasValidas = Number.isFinite(paginasNum) && paginasNum > 0;
  const trioIncompleto = !hasUploaded || !formato || !paginasValidas;

  const podeContinuar =
    verificacao?.ok === true &&
    titulo.trim().length > 0 &&
    declaracaoAceita &&
    !isProcessing;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-zinc-50">
      <main className="max-w-2xl mx-auto px-4 py-10">

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">

          {/* Header */}
          <div className="bg-brand-primary px-8 py-5">
            <p className="text-brand-gold text-[11px] font-semibold uppercase tracking-widest mb-0.5">
              Já tenho meu livro pronto
            </p>
            <h1 className="text-white font-heading text-lg">
              Publicação direta do seu arquivo
            </h1>
          </div>

          <div className="px-8 py-8 space-y-7">

            {/* ── Dados do livro ── */}
            <div className="space-y-4">
              <div>
                <label className={labelClass}>
                  Título do livro <span className="text-red-400 normal-case font-normal">*</span>
                </label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: O Último Horizonte"
                  disabled={isProcessing}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Subtítulo</label>
                <input
                  value={subtitulo}
                  onChange={(e) => setSubtitulo(e.target.value)}
                  placeholder="Opcional"
                  disabled={isProcessing}
                  className={fieldClass}
                />
              </div>
            </div>

            <Divider />

            {/* ── Autor ── */}
            <div>
              <label className={labelClass}>Nome do autor</label>
              <AuthorRow
                titulo={autorTitulo}
                primeiro={autorPrimeiro}
                meio={autorMeio}
                sobrenome={autorSobrenome}
                disabled={isProcessing}
                onTitulo={setAutorTitulo}
                onPrimeiro={setAutorPrimeiro}
                onMeio={setAutorMeio}
                onSobrenome={setAutorSobrenome}
              />

              {coautores.map((ca, i) => (
                <div key={i} className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Co-autor {i + 1}
                    </span>
                    <button
                      onClick={() => removeCoAuthor(i)}
                      className="text-zinc-300 hover:text-red-400 transition-colors text-xs"
                      disabled={isProcessing}
                    >
                      Remover
                    </button>
                  </div>
                  <AuthorRow
                    titulo={ca.titulo}
                    primeiro={ca.primeiro_nome}
                    meio={ca.nome_meio}
                    sobrenome={ca.sobrenome}
                    disabled={isProcessing}
                    onTitulo={(v) => updateCoAuthor(i, "titulo", v)}
                    onPrimeiro={(v) => updateCoAuthor(i, "primeiro_nome", v)}
                    onMeio={(v) => updateCoAuthor(i, "nome_meio", v)}
                    onSobrenome={(v) => updateCoAuthor(i, "sobrenome", v)}
                  />
                </div>
              ))}

              <button
                onClick={addCoAuthor}
                disabled={isProcessing}
                className="mt-3 text-brand-gold text-xs font-semibold uppercase tracking-wider hover:underline disabled:opacity-40"
              >
                + Adicionar Co-Autor
              </button>
            </div>

            <Divider />

            {/* ── Gênero ── */}
            <div>
              <label className={labelClass}>Gênero</label>
              <div className="space-y-2">
                <select
                  value={generoPrincipal}
                  onChange={(e) => {
                    setGeneroPrincipal(e.target.value);
                    setGeneroSub("");
                    setGeneroDetalhe("");
                  }}
                  disabled={isProcessing}
                  className={fieldClass}
                >
                  <option value="">Selecione o gênero principal</option>
                  {Object.keys(GENRES).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                {subcats.length > 0 && (
                  <select
                    value={generoSub}
                    onChange={(e) => {
                      setGeneroSub(e.target.value);
                      setGeneroDetalhe("");
                    }}
                    disabled={isProcessing}
                    className={fieldClass}
                  >
                    <option value="">Selecione a subcategoria</option>
                    {subcats.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}

                {details.length > 0 && (
                  <select
                    value={generoDetalhe}
                    onChange={(e) => setGeneroDetalhe(e.target.value)}
                    disabled={isProcessing}
                    className={fieldClass}
                  >
                    <option value="">Selecione o subgênero</option>
                    {details.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <Divider />

            {/* ── Arquivo do miolo (declara → confere) ── */}
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-brand-primary mb-1">
                  Arquivo do miolo
                </h2>
                <p className="text-xs text-zinc-400">
                  Informe o formato e o número de páginas do seu PDF. Vamos conferir com o arquivo enviado antes de continuar.
                </p>
              </div>

              {/* Formato */}
              <div>
                <label className={labelClass}>Formato do livro</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {FORMATOS_LIVRO.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => onFormatoChange(f.value)}
                      disabled={isProcessing}
                      className={`text-left rounded-lg border-2 p-3 transition-all ${
                        formato === f.value
                          ? "border-brand-gold bg-brand-gold/5"
                          : "border-zinc-200 bg-white hover:border-zinc-300"
                      } disabled:opacity-40`}
                    >
                      <p className="text-sm font-semibold text-zinc-800">{f.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{f.descricao_curta}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Páginas declaradas */}
              <div>
                <label className={labelClass}>Quantidade de páginas do seu PDF</label>
                <input
                  type="number"
                  min={1}
                  value={paginasDeclaradas}
                  onChange={(e) => onPaginasChange(e.target.value)}
                  onBlur={onPaginasBlur}
                  placeholder="Ex.: 168"
                  disabled={isProcessing}
                  className={fieldClass}
                />
              </div>

              {/* Dropzone */}
              <div>
                <label className={labelClass}>PDF do miolo</label>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="sr-only"
                  onChange={onInputChange}
                  disabled={isProcessing}
                />

                {!file && (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                      isDragging
                        ? "border-brand-gold bg-brand-gold/5 scale-[1.01]"
                        : "border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-3 py-10 px-8 text-center">
                      <div className="w-12 h-12 rounded-xl bg-brand-primary/5 flex items-center justify-center">
                        <UploadIcon />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-600 uppercase tracking-wider">
                          {isDragging ? "Solte aqui" : "Arraste ou clique para enviar"}
                        </p>
                        <p className="text-zinc-400 text-xs mt-1">.pdf · máx. 100 MB</p>
                      </div>
                    </div>
                  </div>
                )}

                {file && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50">
                    <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shrink-0">
                      <span className="text-brand-gold text-[10px] font-bold">{fileExt}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{file.name}</p>
                      <p className="text-zinc-400 text-xs mt-0.5">{formatBytes(file.size)}</p>
                    </div>
                    {!isProcessing && (
                      <button
                        onClick={() => {
                          verifyTokenRef.current += 1;
                          cancelPagesDebounce();
                          setFile(null);
                          setHasUploaded(false);
                          setVerificacao(null);
                          setError(null);
                          setUploadProgress(0);
                          marcasHintRef.current = null;
                          if (inputRef.current) inputRef.current.value = "";
                        }}
                        className="text-zinc-300 hover:text-zinc-500 transition-colors p-1"
                        aria-label="Remover arquivo"
                      >
                        <RemoveIcon />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Painel de resultado — auto-verificação; sem botão intermediário */}
              {status === "uploading" && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 flex items-center gap-3">
                  <Spinner />
                  <p className="text-sm text-zinc-600">
                    Enviando o arquivo… {uploadProgress}%
                  </p>
                </div>
              )}

              {status === "verifying" && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 flex items-center gap-3">
                  <Spinner />
                  <p className="text-sm text-zinc-600">Conferindo seu arquivo…</p>
                </div>
              )}

              {status !== "uploading" && status !== "verifying" && !verificacao && file && trioIncompleto && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm text-zinc-500">
                    Selecione o formato e informe as páginas para conferirmos o arquivo.
                  </p>
                </div>
              )}

              {verificacao?.ok === true && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                  <p className="text-sm font-semibold text-emerald-800">
                    Arquivo conferido com sucesso
                  </p>
                  <p className="text-xs text-emerald-700">
                    {verificacao.paginas_reais} páginas ·{" "}
                    {verificacao.marcas_detectadas ? "corte " : ""}
                    {verificacao.largura_mm.toFixed(1)}×{verificacao.altura_mm.toFixed(1)}mm ·{" "}
                    lombada estimada {verificacao.lombada_mm.toFixed(1)}mm ·{" "}
                    {verificacao.marcas_detectadas
                      ? "sangria e marcas de corte detectadas"
                      : verificacao.sangria_detectada
                        ? "com sangria"
                        : "sem sangria"}
                  </p>
                  {verificacao.avisos.map((aviso, i) => (
                    <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-100">
                      {aviso}
                    </p>
                  ))}
                </div>
              )}

              {verificacao?.ok === false && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-800">
                    Divergência no arquivo
                  </p>
                  {verificacao.divergencias.map((div, i) => (
                    <p key={i} className="text-xs text-red-700">{div}</p>
                  ))}
                  {verificacao.formato_provavel && (
                    <button
                      type="button"
                      onClick={() => onFormatoChange(verificacao.formato_provavel!)}
                      disabled={isProcessing}
                      className="text-xs font-semibold text-brand-primary underline underline-offset-2 hover:text-brand-gold"
                    >
                      Usar formato {FORMATOS_LIVRO.find(f => f.value === verificacao.formato_provavel)?.label}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* LEGAL-1C: Declaração de Titularidade obrigatória */}
            {verificacao?.ok === true && (
              <DeclaracaoTitularidade
                aceita={declaracaoAceita}
                aberta={declaracaoAberta}
                disabled={isProcessing}
                onAceita={setDeclaracaoAceita}
                onToggle={() => setDeclaracaoAberta((v) => !v)}
              />
            )}

            {/* Error box */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                  {status === "error" && retryContext && (
                    <button
                      onClick={handleRetry}
                      className="text-red-500 text-xs underline underline-offset-2 mt-1 hover:text-red-700"
                    >
                      Tentar novamente
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CTA final */}
            <button
              type="button"
              onClick={handleContinuar}
              disabled={!podeContinuar}
              className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold text-sm uppercase tracking-wide hover:bg-[#2a2a4e] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "creating" ? "Preparando projeto…" :
               status === "done"     ? "Redirecionando…" :
               "Continuar para a capa →"}
            </button>

            <p className="text-center text-zinc-400 text-xs -mt-2">
              O pedido de impressão estará disponível em breve. Nesta etapa você confere seu livro e prepara a capa.
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <hr className="border-zinc-100" />;
}

interface AuthorRowProps {
  titulo: string;
  primeiro: string;
  meio: string;
  sobrenome: string;
  disabled: boolean;
  onTitulo: (v: string) => void;
  onPrimeiro: (v: string) => void;
  onMeio: (v: string) => void;
  onSobrenome: (v: string) => void;
}

function AuthorRow({ titulo, primeiro, meio, sobrenome, disabled, onTitulo, onPrimeiro, onMeio, onSobrenome }: AuthorRowProps) {
  return (
    <div className="grid grid-cols-[90px_1fr_1fr_1fr] gap-2">
      <select
        value={titulo}
        onChange={(e) => onTitulo(e.target.value)}
        disabled={disabled}
        className={fieldClass}
      >
        <option value="">Título</option>
        {AUTHOR_TITLES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input
        value={primeiro}
        onChange={(e) => onPrimeiro(e.target.value)}
        placeholder="Primeiro nome"
        disabled={disabled}
        className={fieldClass}
      />
      <input
        value={meio}
        onChange={(e) => onMeio(e.target.value)}
        placeholder="Nome do meio"
        disabled={disabled}
        className={fieldClass}
      />
      <input
        value={sobrenome}
        onChange={(e) => onSobrenome(e.target.value)}
        placeholder="Sobrenome"
        disabled={disabled}
        className={fieldClass}
      />
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border-2 border-zinc-300 border-t-brand-primary animate-spin"
      aria-hidden="true"
    />
  );
}
