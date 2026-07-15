/**
 * One-off C5-05: remove órfãos de editor-assets/{user}/{project}/images/
 * em TODOS os projetos, comparando com os paths referenciados em dados_capa.
 *
 * Uso:
 *   npx tsx scripts/cleanup-editor-assets.ts            # DRY-RUN (só lista)
 *   npx tsx scripts/cleanup-editor-assets.ts --apply    # remove de verdade
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (usar .env.local).
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, user_id, dados_capa");
  if (error) throw error;

  let totalOrphans = 0;
  let totalBytes = 0;

  for (const p of projects ?? []) {
    const referenced = new Set<string>();
    const serialized = JSON.stringify(p.dados_capa ?? {});
    for (const m of serialized.matchAll(/editor-assets\/([^?"\\]+)/g)) {
      referenced.add(decodeURIComponent(m[1]));
    }

    const prefix = `${p.user_id}/${p.id}/images`;
    const { data: files, error: listErr } = await supabase.storage
      .from("editor-assets")
      .list(prefix, { limit: 1000 });
    if (listErr || !files?.length) continue;

    const orphans = files
      .filter((f) => f.name && !referenced.has(`${prefix}/${f.name}`))
      .map((f) => ({
        path: `${prefix}/${f.name}`,
        size: (f.metadata as { size?: number } | null)?.size ?? 0,
      }));

    if (!orphans.length) continue;

    for (const o of orphans) {
      console.log(`${APPLY ? "REMOVENDO" : "[dry-run]"} ${o.path}  (${(o.size / 1024 / 1024).toFixed(2)} MB)`);
      totalBytes += o.size;
    }
    totalOrphans += orphans.length;

    if (APPLY) {
      // batches de 100 (limite prático do remove)
      const paths = orphans.map((o) => o.path);
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await supabase.storage
          .from("editor-assets")
          .remove(paths.slice(i, i + 100));
        if (rmErr) console.error(`  FALHA no batch ${i / 100}:`, rmErr.message);
      }
    }
  }

  console.log(`\n${APPLY ? "Removidos" : "Órfãos encontrados"}: ${totalOrphans} arquivo(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB.`);
  if (!APPLY) console.log("Rode com --apply para remover.");
}

main().catch((e) => { console.error(e); process.exit(1); });
