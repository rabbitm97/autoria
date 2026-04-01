"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_EXTS = [".docx", ".pdf", ".txt"];
const ACCEPTED_MIME = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const AUTHOR_TITLES = ["Sr.", "Sra.", "Dr.", "Dra.", "Prof.", "Profa.", "Rev."];

const GENRES: Record<string, Record<string, string[]>> = {
  "Ficção": {
    "Romance": ["Romance Contemporâneo", "Romance Histórico", "Romance Suspense", "Romance Paranormal", "Chick Lit"],
    "Thriller e Suspense": ["Thriller Policial", "Thriller Psicológico", "Suspense", "Crime"],
    "Terror e Horror": ["Terror Sobrenatural", "Horror Psicológico", "Terror Gótico"],
    "Ficção Científica": ["Space Opera", "Distopia", "Cyberpunk", "Hard Sci-Fi", "Ficção Científica Soft"],
    "Fantasia": ["Fantasia Épica", "Fantasia Urbana", "Dark Fantasy", "Steampunk"],
    "Mistério": ["Mistério Policial", "Cozy Mystery", "Noir"],
    "Aventura": ["Aventura de Ação", "Aventura Histórica"],
    "Ficção Literária": ["Ficção Contemporânea", "Ficção Histórica"],
    "Humor e Sátira": ["Humor", "Sátira"],
  },
  "Não Ficção": {
    "Autoajuda e Desenvolvimento Pessoal": ["Autoajuda", "Motivação", "Mindfulness", "Produtividade", "Coaching"],
    "Negócios e Empreendedorismo": ["Empreendedorismo", "Marketing", "Finanças Pessoais", "Liderança", "Gestão"],
    "Biografia e Memórias": ["Autobiografia", "Biografia", "Memórias", "Diário"],
    "História": ["História do Brasil", "História Mundial", "História Regional"],
    "Ciência e Natureza": ["Ciência Popular", "Física", "Biologia", "Astronomia", "Meio Ambiente"],
    "Saúde e Bem-estar": ["Saúde", "Nutrição", "Fitness", "Medicina Alternativa"],
    "Espiritualidade e Religião": ["Espiritualidade", "Religião", "Esoterismo"],
    "Filosofia": ["Filosofia Geral", "Filosofia Prática", "Ética"],
  },
  "Infantil e Juvenil": {
    "Infantil": ["Livro Ilustrado", "Conto Infantil", "Fábula", "Livro de Atividades"],
    "Jovem Adulto (YA)": ["YA Romance", "YA Fantasia", "YA Ficção Científica", "YA Contemporâneo"],
  },
  "Poesia e Literatura": {
    "Poesia": ["Poesia Lírica", "Poesia Épica", "Haiku", "Poesia Contemporânea"],
    "Contos": ["Contos Literários", "Contos de Terror", "Contos Românticos", "Contos de Ficção Científica"],
    "Crônicas": ["Crônicas Literárias", "Crônicas Humorísticas"],
  },
  "Arte e Fotografia": {
    "Arte": ["Arte Visual", "Arquitetura", "Design", "Moda e Estilo"],
    "Fotografia": ["Fotografia Artística", "Fotografia Documental"],
  },
  "Culinária e Estilo de Vida": {
    "Culinária": ["Receitas Gerais", "Cozinha Regional Brasileira", "Culinária Internacional", "Vegano e Vegetariano"],
    "Estilo de Vida": ["Casa e Jardim", "Viagem", "Artesanato"],
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Status =
  | "idle"
  | "uploading"
  | "creating"
  | "parsing"
  | "analyzing"
  | "done"
  | "error";

interface CoAuthor {
  titulo: string;
  primeiro_nome: string;
  nome_meio: string;
  sobrenome: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const mimeOk = ACCEPTED_MIME.includes(file.type);
  const extOk = ACCEPTED_EXTS.includes(ext);
  if (!mimeOk && !extOk) return "Formato inválido. Aceitos: .docx, .pdf ou .txt";
  if (file.size > MAX_BYTES) return "Arquivo muito grande. Máximo: 50 MB";
  return null;
}

function uploadWithProgress(
  storagePath: string,
  file: File,
  token: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve();
      } else {
        reject(new Error(`Falha no upload (${xhr.status}): ${xhr.responseText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Falha na conexão.")));

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/manuscripts/${storagePath}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(file);
  });
}

const fieldClass =
  "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 bg-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 transition";

const labelClass =
  "block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoProjetoPage() {
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

  // ── Services state ──────────────────────────────────────────────────────────
  const [usarRevisao, setUsarRevisao] = useState<boolean | null>(null);

  // ── Upload state ────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── File selection ──────────────────────────────────────────────────────────

  function pickFile(f: File) {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
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

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleNext() {
    setError(null);

    if (!titulo.trim()) {
      setError("O título do livro é obrigatório.");
      return;
    }
    if (usarRevisao === null) {
      setError("Informe se deseja ou não a revisão textual do seu manuscrito.");
      return;
    }
    if (!file) {
      setError("Selecione o arquivo do manuscrito.");
      return;
    }

    setStatus("uploading");
    setProgress(0);

    // 1. Get session
    const { data: { session }, error: authErr } = await supabase.auth.getSession();
    if (authErr || !session) {
      setError("Sessão expirada. Faça login novamente.");
      setStatus("error");
      return;
    }

    // 2. Upload to Storage
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const storagePath = `${session.user.id}/${Date.now()}.${ext}`;

    try {
      await uploadWithProgress(storagePath, file, session.access_token, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no upload.");
      setStatus("error");
      return;
    }

    setStatus("creating");

    // 3. Create manuscript record with metadata
    const { data: manuscript, error: msErr } = await supabase
      .from("manuscripts")
      .insert({
        user_id: session.user.id,
        nome: file.name.replace(/\.[^/.]+$/, ""),
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
        status: "em_diagnostico",
      })
      .select("id")
      .single();

    if (msErr || !manuscript) {
      setError("Upload concluído, mas falha ao registrar o manuscrito.");
      setStatus("error");
      return;
    }

    // 4. Create project record
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: session.user.id,
        manuscript_id: manuscript.id,
        plano: "basico",
        etapa_atual: "upload",
        usar_revisao: usarRevisao,
      })
      .select("id")
      .single();

    if (projErr || !project) {
      setError("Manuscrito salvo, mas falha ao criar o projeto.");
      setStatus("error");
      return;
    }

    // 5. Parse manuscript (extract text)
    setStatus("parsing");

    let textoExtraido = "";
    try {
      const parseRes = await fetch("/api/parse-manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          manuscript_id: manuscript.id,
          storage_path: storagePath,
        }),
      });
      const parseData = await parseRes.json();
      if (parseRes.ok) textoExtraido = parseData.texto ?? "";
      else console.warn("[upload] Parse falhou:", parseData.error);
    } catch (e) {
      console.warn("[upload] Erro na chamada de parse:", e);
    }

    // 6. Run diagnostico
    setStatus("analyzing");

    try {
      const textoParaDiagnostico = textoExtraido.trim().length >= 50
        ? textoExtraido
        : `Manuscrito: ${titulo.trim()}`;

      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoParaDiagnostico, project_id: project.id }),
      });

      if (!diagRes.ok) {
        const diagData = await diagRes.json();
        console.warn("[upload] Diagnóstico falhou:", diagData.error);
      }
    } catch (e) {
      console.warn("[upload] Erro na chamada de diagnóstico:", e);
    }

    setStatus("done");
    router.push(`/dashboard/diagnostico/${project.id}`);
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isProcessing = ["uploading", "creating", "parsing", "analyzing"].includes(status);
  const fileExt = file?.name.split(".").pop()?.toUpperCase() ?? "";

  const statusLabel =
    status === "uploading"  ? `Enviando… ${progress}%` :
    status === "creating"   ? "Criando projeto…" :
    status === "parsing"    ? "Extraindo texto…" :
    status === "analyzing"  ? "Analisando com IA…" :
    status === "done"       ? "Redirecionando…" : "Próximo →";

  const subcats = generoPrincipal ? Object.keys(GENRES[generoPrincipal]) : [];
  const details = generoSub && generoPrincipal ? GENRES[generoPrincipal][generoSub] : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="max-w-2xl mx-auto px-4 py-10">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">

          {/* Card header */}
          <div className="bg-brand-primary px-8 py-5">
            <p className="text-brand-gold text-[11px] font-semibold uppercase tracking-widest mb-0.5">
              Novo Projeto
            </p>
            <h1 className="text-white font-heading text-lg">
              Informações do Livro
            </h1>
          </div>

          <div className="px-8 py-8 space-y-7">

            {/* ── Title + Subtitle ── */}
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

            {/* ── Author Name ── */}
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

              {/* Co-authors */}
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

            {/* ── Genre ── */}
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

            {/* ── Etapas do projeto ── */}
            <div>
              <label className={labelClass}>
                Revisão textual <span className="text-red-400 normal-case font-normal">*</span>
              </label>
              <p className="text-xs text-zinc-400 mb-3">
                Deseja que nossa IA revise ortografia, gramática e estilo antes de prosseguir?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* Sim */}
                <button
                  type="button"
                  onClick={() => setUsarRevisao(true)}
                  disabled={isProcessing}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    usarRevisao === true
                      ? "border-brand-gold bg-brand-gold/5"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  } disabled:opacity-40`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      usarRevisao === true ? "border-brand-gold" : "border-zinc-300"
                    }`}>
                      {usarRevisao === true && (
                        <span className="w-2 h-2 rounded-full bg-brand-gold block" />
                      )}
                    </span>
                    <span className="text-sm font-semibold text-zinc-800">Sim, quero revisão</span>
                  </div>
                  <p className="text-xs text-zinc-400 pl-6">
                    A IA sugere melhorias de escrita antes de avançar para a capa.
                  </p>
                </button>

                {/* Não */}
                <button
                  type="button"
                  onClick={() => setUsarRevisao(false)}
                  disabled={isProcessing}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    usarRevisao === false
                      ? "border-brand-gold bg-brand-gold/5"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  } disabled:opacity-40`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      usarRevisao === false ? "border-brand-gold" : "border-zinc-300"
                    }`}>
                      {usarRevisao === false && (
                        <span className="w-2 h-2 rounded-full bg-brand-gold block" />
                      )}
                    </span>
                    <span className="text-sm font-semibold text-zinc-800">Não, manter como está</span>
                  </div>
                  <p className="text-xs text-zinc-400 pl-6">
                    Pule a revisão e avance direto para capa e diagramação.
                  </p>
                </button>
              </div>
            </div>

            <Divider />

            {/* ── File Upload ── */}
            <div>
              <label className={labelClass}>Manuscrito</label>

              <input
                ref={inputRef}
                type="file"
                accept=".docx,.pdf,.txt"
                className="sr-only"
                onChange={onInputChange}
                disabled={isProcessing}
              />

              {/* Drop zone */}
              {!file && !isProcessing && (
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
                      <p className="text-zinc-400 text-xs mt-1">.docx · .pdf · .txt · máx. 50 MB</p>
                    </div>
                  </div>
                </div>
              )}

              {/* File selected, not processing */}
              {file && !isProcessing && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50">
                  <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shrink-0">
                    <span className="text-brand-gold text-[10px] font-bold">{fileExt}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{file.name}</p>
                    <p className="text-zinc-400 text-xs mt-0.5">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); setError(null); }}
                    className="text-zinc-300 hover:text-zinc-500 transition-colors p-1"
                    aria-label="Remover arquivo"
                  >
                    <RemoveIcon />
                  </button>
                </div>
              )}

              {/* Processing */}
              {isProcessing && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shrink-0">
                      <span className="text-brand-gold text-[10px] font-bold">{fileExt}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{file?.name}</p>
                      <p className="text-zinc-400 text-xs mt-0.5">{statusLabel}</p>
                    </div>
                  </div>

                  <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        status === "analyzing" ? "bg-brand-gold animate-pulse" : "bg-brand-gold"
                      }`}
                      style={{ width: status === "uploading" ? `${progress}%` : "100%" }}
                    />
                  </div>

                  <div className="flex gap-4 mt-3">
                    {(
                      [
                        { s: "uploading", label: "Upload" },
                        { s: "creating",  label: "Projeto" },
                        { s: "parsing",   label: "Texto" },
                        { s: "analyzing", label: "IA" },
                      ] as { s: Status; label: string }[]
                    ).map(({ s, label }, i) => {
                      const order: Status[] = ["uploading", "creating", "parsing", "analyzing"];
                      const done   = order.indexOf(s) < order.indexOf(status);
                      const active = s === status;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            done   ? "bg-emerald-500 text-white" :
                            active ? "bg-brand-gold text-brand-primary" :
                                     "bg-zinc-200 text-zinc-400"
                          }`}>
                            {done ? "✓" : i + 1}
                          </span>
                          <span className={`text-xs ${
                            done   ? "text-emerald-600" :
                            active ? "text-brand-gold font-medium" :
                                     "text-zinc-400"
                          }`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                <div>
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                  {status === "error" && (
                    <button
                      onClick={() => { setStatus("idle"); setError(null); setFile(null); setProgress(0); }}
                      className="text-red-500 text-xs underline underline-offset-2 mt-1 hover:text-red-700"
                    >
                      Tentar novamente
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── CTA ── */}
            <button
              onClick={handleNext}
              disabled={isProcessing}
              className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold text-sm uppercase tracking-wide hover:bg-[#2a2a4e] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? statusLabel : "Próximo →"}
            </button>

            <p className="text-center text-zinc-400 text-xs -mt-2">
              Seu arquivo é armazenado com segurança. Apenas você tem acesso.
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
