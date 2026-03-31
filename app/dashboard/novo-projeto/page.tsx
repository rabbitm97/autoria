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

const STEPS = [
  "Upload",
  "Diagnóstico",
  "Revisão",
  "Capa",
  "Diagramação",
  "Publicação",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Status =
  | "idle"
  | "uploading"
  | "creating"
  | "parsing"
  | "analyzing"
  | "done"
  | "error";

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

// XHR upload com progresso real — @supabase/storage-js não expõe onUploadProgress
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoProjetoPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Upload flow ─────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);
    setError(null);

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

    // 3. Create manuscript record
    const { data: manuscript, error: msErr } = await supabase
      .from("manuscripts")
      .insert({
        user_id: session.user.id,
        nome: file.name.replace(/\.[^/.]+$/, ""),
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
      if (!parseRes.ok) {
        // Non-fatal: continue to diagnostico without extracted text
        console.warn("[upload] Parse falhou:", parseData.error);
      } else {
        textoExtraido = parseData.texto ?? "";
      }
    } catch (e) {
      console.warn("[upload] Erro na chamada de parse:", e);
    }

    // 6. Run diagnostico
    setStatus("analyzing");

    try {
      // Use extracted text or fall back to filename as minimal context
      const textoParaDiagnostico = textoExtraido.trim().length >= 50
        ? textoExtraido
        : `Manuscrito: ${file.name.replace(/\.[^/.]+$/, "")}`;

      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: textoParaDiagnostico,
          project_id: project.id,
        }),
      });

      if (!diagRes.ok) {
        const diagData = await diagRes.json();
        console.warn("[upload] Diagnóstico falhou:", diagData.error);
        // Non-fatal: redirect to diagnostico page which handles pending state
      }
    } catch (e) {
      console.warn("[upload] Erro na chamada de diagnóstico:", e);
    }

    // 7. Redirect to diagnostico page regardless
    setStatus("done");
    router.push(`/dashboard/diagnostico/${project.id}`);
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isProcessing = [
    "uploading",
    "creating",
    "parsing",
    "analyzing",
  ].includes(status);

  const fileExt = file?.name.split(".").pop()?.toUpperCase() ?? "";

  const statusLabel =
    status === "uploading"  ? `Enviando… ${progress}%` :
    status === "creating"   ? "Criando projeto…"        :
    status === "parsing"    ? "Extraindo texto…"        :
    status === "analyzing"  ? "Analisando com IA…"      :
    status === "done"       ? "Redirecionando…"         : null;

  const progressPct =
    status === "uploading"  ? progress :
    status === "creating"   ? 100 :
    status === "parsing"    ? 100 :
    status === "analyzing"  ? 100 : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Step indicator */}
      <div className="bg-brand-primary border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <ol className="flex items-center gap-0 overflow-x-auto">
            {STEPS.map((step, i) => {
              const active = i === 0;
              return (
                <li key={step} className="flex items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        active
                          ? "bg-brand-gold text-brand-primary"
                          : "bg-white/10 text-white/30"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`text-xs ${
                        active ? "text-brand-gold font-medium" : "text-white/30"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="mx-3 text-white/10 text-xs">›</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="font-heading text-3xl text-brand-primary mb-2">
            Envie seu manuscrito
          </h1>
          <p className="text-zinc-500">
            Aceitos: <strong>.docx</strong>, <strong>.pdf</strong> ou{" "}
            <strong>.txt</strong> — até 50 MB.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !file && !isProcessing && inputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all ${
            isProcessing
              ? "border-brand-gold/30 bg-brand-primary/5 cursor-default"
              : file
              ? "border-brand-gold/40 bg-white cursor-default"
              : isDragging
              ? "border-brand-gold bg-brand-gold/5 cursor-copy scale-[1.01]"
              : "border-zinc-200 bg-white hover:border-brand-gold/40 hover:bg-zinc-50 cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,.txt"
            className="sr-only"
            onChange={onInputChange}
            disabled={isProcessing}
          />

          {/* Empty state */}
          {!file && !isProcessing && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center">
                <UploadIcon />
              </div>
              <div>
                <p className="font-medium text-zinc-700 mb-1">
                  {isDragging
                    ? "Solte o arquivo aqui"
                    : "Arraste o arquivo ou clique para selecionar"}
                </p>
                <p className="text-zinc-400 text-sm">.docx · .pdf · .txt · até 50 MB</p>
              </div>
            </div>
          )}

          {/* File selected */}
          {file && !isProcessing && (
            <div className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-brand-primary flex items-center justify-center shrink-0">
                <span className="text-brand-gold text-xs font-bold">{fileExt}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-800 truncate">{file.name}</p>
                <p className="text-zinc-400 text-sm mt-0.5">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
                className="text-zinc-300 hover:text-zinc-500 transition-colors p-1"
                aria-label="Remover arquivo"
              >
                <RemoveIcon />
              </button>
            </div>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand-primary flex items-center justify-center shrink-0">
                  <span className="text-brand-gold text-xs font-bold">{fileExt}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-800 truncate">{file?.name}</p>
                  <p className="text-zinc-400 text-sm mt-0.5">{statusLabel}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    status === "analyzing"
                      ? "bg-brand-gold animate-pulse"
                      : "bg-brand-gold"
                  }`}
                  style={{ width: status === "uploading" ? `${progressPct}%` : "100%" }}
                />
              </div>

              {/* Steps */}
              <div className="flex gap-4 mt-4">
                {(
                  [
                    { s: "uploading", label: "Upload" },
                    { s: "creating",  label: "Projeto" },
                    { s: "parsing",   label: "Texto" },
                    { s: "analyzing", label: "IA" },
                  ] as { s: Status; label: string }[]
                ).map(({ s, label }, i) => {
                  const steps: Status[] = ["uploading", "creating", "parsing", "analyzing"];
                  const currentIdx = steps.indexOf(status);
                  const thisIdx = steps.indexOf(s);
                  const done = thisIdx < currentIdx;
                  const active = thisIdx === currentIdx;
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          done   ? "bg-emerald-500 text-white" :
                          active ? "bg-brand-gold text-brand-primary" :
                                   "bg-zinc-100 text-zinc-300"
                        }`}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span
                        className={`text-xs ${
                          done   ? "text-emerald-600" :
                          active ? "text-brand-gold font-medium" :
                                   "text-zinc-300"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
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

        {/* CTA */}
        {!isProcessing && (
          <button
            onClick={handleUpload}
            disabled={!file || isProcessing}
            className="mt-6 w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Iniciar diagnóstico →
          </button>
        )}

        <p className="text-center text-zinc-400 text-xs mt-4">
          Seu arquivo é armazenado com segurança. Apenas você tem acesso.
        </p>
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      width="28" height="28" viewBox="0 0 24 24" fill="none"
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
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
