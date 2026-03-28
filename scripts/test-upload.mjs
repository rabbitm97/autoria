// Teste de upload para o Supabase Storage
// Execução: node scripts/test-upload.mjs

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SUPABASE_URL = "https://rebttsablofzuqcjalkn.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlYnR0c2FibG9menVxY2phbGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDg0NjcsImV4cCI6MjA4OTg4NDQ2N30.gGAkY4KirTgh5IlLmFjwDZvKvYvnWyt_U6WUNopBpms";

const TEST_EMAIL = `teste-upload-${Date.now()}@autoria-teste.com`;
const TEST_PASSWORD = "Autoria@Teste2025!";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function run() {
  console.log("── Teste de Upload — Autoria ──────────────────────");

  // 1. Criar usuário de teste
  console.log(`\n1. Criando usuário: ${TEST_EMAIL}`);
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signUpErr) {
    console.error("   ✗ Falha no signUp:", signUpErr.message);
    process.exit(1);
  }

  const session = signUpData.session;
  if (!session) {
    console.warn("   ⚠ Confirmação de e-mail obrigatória neste projeto.");
    console.warn("   Desative em: Supabase → Authentication → Email → 'Confirm email'");
    console.warn("   Ou teste manualmente via browser após fazer login.");
    process.exit(0);
  }

  console.log(`   ✓ Usuário criado: ${session.user.id}`);

  // 2. Criar arquivo .txt de teste (simples, não requer Python/libs)
  const testFile = join(tmpdir(), "manuscrito-teste.txt");
  writeFileSync(testFile, "Manuscrito de Teste — Autoria\n\nCapítulo 1\nEra uma vez...");
  const fileContent = Buffer.from("Manuscrito de Teste — Autoria\n\nCapítulo 1\nEra uma vez...");
  const storagePath = `${session.user.id}/${Date.now()}.txt`;

  console.log(`\n2. Fazendo upload: manuscripts/${storagePath}`);

  const { error: uploadErr } = await supabase.storage
    .from("manuscripts")
    .upload(storagePath, fileContent, {
      contentType: "text/plain",
      upsert: false,
    });

  if (uploadErr) {
    console.error("   ✗ Falha no upload:", uploadErr.message);
    process.exit(1);
  }

  console.log("   ✓ Arquivo salvo no Storage");

  // 3. Criar registro manuscripts
  console.log("\n3. Criando registro em manuscripts...");
  const { data: manuscript, error: msErr } = await supabase
    .from("manuscripts")
    .insert({ user_id: session.user.id, nome: "Manuscrito de Teste", status: "rascunho" })
    .select("id")
    .single();

  if (msErr) {
    console.error("   ✗ Falha:", msErr.message);
    process.exit(1);
  }
  console.log(`   ✓ Manuscript ID: ${manuscript.id}`);

  // 4. Criar registro projects
  console.log("\n4. Criando registro em projects...");
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      user_id: session.user.id,
      manuscript_id: manuscript.id,
      plano: "basico",
      etapa_atual: "diagnostico",
    })
    .select("id")
    .single();

  if (projErr) {
    console.error("   ✗ Falha:", projErr.message);
    process.exit(1);
  }
  console.log(`   ✓ Project ID: ${project.id}`);

  // 5. Verificar URL do arquivo
  const { data: urlData } = supabase.storage
    .from("manuscripts")
    .getPublicUrl(storagePath);

  console.log("\n── Resultado ──────────────────────────────────────");
  console.log(`Storage path : manuscripts/${storagePath}`);
  console.log(`Manuscript ID: ${manuscript.id}`);
  console.log(`Project ID   : ${project.id}`);
  console.log(`Redirect URL : /dashboard/diagnostico/${project.id}`);
  console.log("\n✓ Fluxo completo validado com sucesso.");

  // Limpa sessão
  await supabase.auth.signOut();
  try { unlinkSync(testFile); } catch {}
}

run().catch((e) => { console.error(e); process.exit(1); });
