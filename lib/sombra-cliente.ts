// lib/sombra-cliente.ts
//
// Client helper compartilhado pelos wizards de ferramenta avulsa
// (diagnóstico, epub, …). Extraído de wizard-diagnostico para eliminar
// duplicação e permitir novos wizards reutilizarem a mesma sequência:
//   upload → insert manuscript → insert project sombra → aceite legal
//   → criar job → parse do texto.
//
// Retorna o quarteto (projectId, manuscriptId, jobId, storagePath) + o
// texto parseado. Débito NÃO acontece aqui — o débito fica na primeira
// chamada de rota AI (padrão do diagnóstico: ehSombra + !debitado_em
// → autorizarAcao + registrarDebitoJob).

import { supabase } from "./supabase";
import { uploadWithProgress } from "./upload-manuscrito-cliente";

export interface CriarSombraOpts {
  /** Quando null, pula upload + parse — sombra nasce sem manuscrito (fluxo
   *  da capa avulsa, FERR-3.4b: autor pode gerar capa sem enviar o livro). */
  file: File | null;
  titulo: string;
  autor: string;
  ferramentaId: string;
  entradaExtra?: Record<string, unknown>;
  onStatus?: (texto: string, progresso: number) => void;
}

export interface SombraCriada {
  projectId: string;
  manuscriptId: string;
  jobId: string;
  /** null quando `file` era null (sem upload). */
  storagePath: string | null;
  /** "" quando `file` era null (sem parse). */
  texto: string;
}

export async function criarSombraEJob(opts: CriarSombraOpts): Promise<SombraCriada> {
  const { file, titulo, autor, ferramentaId, entradaExtra, onStatus } = opts;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const userId = session?.user?.id;
  if (!token || !userId) throw new Error("Sessão expirada. Faça login novamente.");

  // 1. Upload (opcional)
  let storagePath: string | null = null;
  if (file) {
    onStatus?.("Enviando manuscrito…", 0);
    storagePath = `${userId}/${crypto.randomUUID()}/${file.name}`;
    await uploadWithProgress(storagePath, file, token, (pct) =>
      onStatus?.("Enviando manuscrito…", Math.round(pct * 0.25)),
    );
  }

  // 2. Insert manuscripts — `nome` é NOT NULL: usa filename (com upload) ou
  //    titulo (sem upload, ex.: capa avulsa). `storage_path` fica NULL quando
  //    sem arquivo — nulável no schema; o parse-manuscript é o único que
  //    depende dele, e ele nem roda no fluxo sem arquivo.
  onStatus?.("Registrando manuscrito…", 25);
  const nomeManuscrito = file
    ? file.name.replace(/\.[^/.]+$/, "")
    : titulo.trim();
  const { data: ms, error: msErr } = await supabase
    .from("manuscripts")
    .insert({
      user_id: userId,
      nome: nomeManuscrito,
      titulo: titulo.trim(),
      autor_primeiro_nome: autor.trim() || null,
      status: "em_diagnostico",
      storage_path: storagePath,
    })
    .select("id")
    .single();
  if (msErr || !ms) throw new Error("Falha ao registrar manuscrito.");
  const manuscriptId = (ms as { id: string }).id;

  // 3. Insert project sombra (origem="ferramenta", plano="freemium")
  onStatus?.("Criando projeto…", 27);
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      manuscript_id: manuscriptId,
      plano: "freemium",
      etapa_atual: "upload",
      origem: "ferramenta",
    })
    .select("id")
    .single();
  if (projErr || !proj) throw new Error("Falha ao criar projeto.");
  const projectId = (proj as { id: string }).id;

  // 4. Aceite legal (best-effort) — sem arquivo, o `artefatoRef` é
  //    "formulario" (a sinopse é obra do autor; o aceite continua válido).
  fetch("/api/legal/aceite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: "declaracao-titularidade",
      contexto: "upload",
      projectId,
      artefatoRef: storagePath ?? "formulario",
    }),
  }).catch(() => {});

  // 5. Criar job
  onStatus?.("Iniciando…", 28);
  const jobRes = await fetch("/api/ferramentas/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ferramenta_id: ferramentaId,
      projeto_sombra_id: projectId,
      entrada: {
        arquivo: file?.name ?? null,
        titulo: titulo.trim(),
        autor: autor.trim(),
        ...(entradaExtra ?? {}),
      },
    }),
  });
  if (!jobRes.ok) throw new Error("Falha ao criar job.");
  const { job_id: jobId } = (await jobRes.json()) as { job_id: string };

  // 6. Parse do texto — só quando há arquivo.
  let texto = "";
  if (file && storagePath) {
    onStatus?.("Extraindo texto…", 30);
    const parseRes = await fetch("/api/parse-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, manuscript_id: manuscriptId, storage_path: storagePath }),
    });
    if (!parseRes.ok) throw new Error("Falha ao processar o arquivo.");
    const parsed = (await parseRes.json()) as { texto?: string };
    texto = parsed.texto ?? "";
  }

  return { projectId, manuscriptId, jobId, storagePath, texto };
}
