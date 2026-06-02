// scripts/sanity-revisao.ts — APAGAR APÓS O TESTE
// Valida que tool_use forçado + prompt caching funcionam com claude-sonnet-4-6.
// Uso: pnpm tsx scripts/sanity-revisao.ts

import { anthropic } from "@/lib/anthropic";

// Prompt longo o suficiente para ativar o cache (mínimo ~1024 tokens).
const SYSTEM_LONGO = `Você é um revisor editorial profissional de português brasileiro.

Categorias a verificar:
- Ortografia: erros de grafia, acento, hífen, concordância.
- Gramática: pontuação, vírgula, ponto-e-vírgula, dois-pontos.
- Coesão: repetição de palavras, parágrafos longos, pronomes ambíguos.
- Consistência: variação de nomes, tempos verbais, voz narrativa.
- Ritmo: capítulos longos demais, excesso de diálogos.

REGRAS:
- trecho_original é substring exata do texto.
- sugestao sempre propõe mudança concreta.
- Use a tool registrar_sugestoes para devolver suas sugestões.

(este prompt é deliberadamente longo para testar caching — em produção o prompt real tem ~2500 tokens)`.repeat(3);

const TOOL = {
  name: "registrar_sugestoes",
  description: "Registra sugestões de revisão editorial.",
  input_schema: {
    type: "object" as const,
    properties: {
      sugestoes: { type: "array", items: { type: "object" } },
    },
    required: ["sugestoes"],
  },
};

async function call(label: string) {
  const r = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: SYSTEM_LONGO,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: "registrar_sugestoes" },
    messages: [
      {
        role: "user",
        content: `Texto de teste (${label}): 'O "livro" tem alguns erros gramáticais.\n\nUma frase qualquer.' Devolva 1 sugestão.`,
      },
    ],
  });

  const usage = r.usage as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };

  console.log(`\n=== ${label} ===`);
  console.log("stop_reason:", r.stop_reason);
  console.log("content_blocks:", r.content.map((b) => b.type));
  console.log("usage:", JSON.stringify(usage, null, 2));
  return r;
}

async function main() {
  console.log("Primeira chamada (deve escrever no cache)...");
  const r1 = await call("primeira");

  console.log("\nSegunda chamada (deve ler do cache)...");
  const r2 = await call("segunda");

  const u1 = r1.usage as { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
  const u2 = r2.usage as { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

  console.log("\n──── Validação ────");
  const toolOk = r1.content[0]?.type === "tool_use" && r2.content[0]?.type === "tool_use";
  const cacheWriteOk = (u1.cache_creation_input_tokens ?? 0) > 0;
  const cacheReadOk = (u2.cache_read_input_tokens ?? 0) > 0;

  console.log(toolOk ? "✓ tool_use em ambas as chamadas" : "✗ FALHOU: alguma chamada não retornou tool_use");
  console.log(cacheWriteOk ? "✓ cache_creation_input_tokens > 0 na 1ª chamada" : "✗ FALHOU: cache não foi escrito na 1ª chamada");
  console.log(cacheReadOk ? "✓ cache_read_input_tokens > 0 na 2ª chamada" : "✗ FALHOU: cache não foi lido na 2ª chamada (TTL ou tamanho insuficiente?)");

  if (toolOk && cacheWriteOk && cacheReadOk) {
    console.log("\nSANITY CHECK PASSOU — pode fazer deploy.");
  } else {
    console.error("\nSANITY CHECK FALHOU — não faça deploy até resolver.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
