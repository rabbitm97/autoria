// scripts/sanity-revisao.ts — APAGAR APÓS O TESTE
// Valida que tool_use forçado funciona com claude-sonnet-4-6 antes de subir batch.
// Uso: pnpm tsx scripts/sanity-revisao.ts

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log("Enviando chamada de sanity check...\n");

  const r = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: "Você é um revisor de textos em português brasileiro.",
    tools: [
      {
        name: "registrar_sugestoes",
        description: "Registra sugestões de revisão editorial.",
        input_schema: {
          type: "object",
          properties: {
            sugestoes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tipo: { type: "string" },
                  severidade: { type: "string" },
                  trecho_original: { type: "string" },
                  sugestao: { type: "string" },
                },
                required: ["tipo", "severidade", "trecho_original", "sugestao"],
              },
            },
          },
          required: ["sugestoes"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "registrar_sugestoes" },
    messages: [
      {
        role: "user",
        content:
          'Texto de teste com caracteres especiais:\n\n"O livro" tem erros gramáticais.\n\nO personagem disse: \'Não sei o que fazer\' e saiu.\n\nDevolva 1 sugestão de revisão.',
      },
    ],
  });

  console.log("stop_reason:", r.stop_reason);
  console.log("content blocks:", r.content.map((b) => b.type));

  const toolBlock = r.content.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; name: string; input: { sugestoes?: unknown[] } }
    | undefined;

  if (!toolBlock) {
    console.error("FALHOU — nenhum bloco tool_use na resposta.");
    console.error("Conteúdo recebido:", JSON.stringify(r.content, null, 2));
    process.exit(1);
  }

  if (toolBlock.name !== "registrar_sugestoes") {
    console.error(`FALHOU — tool name errado: ${toolBlock.name}`);
    process.exit(1);
  }

  const sugestoes = toolBlock.input?.sugestoes;
  if (!Array.isArray(sugestoes) || sugestoes.length === 0) {
    console.error("FALHOU — sugestoes não é array ou está vazio.");
    console.error("input:", JSON.stringify(toolBlock.input, null, 2));
    process.exit(1);
  }

  console.log("\n✓ tool_use recebido corretamente.");
  console.log(`✓ ${sugestoes.length} sugestão(ões) retornada(s).`);
  console.log("\nPrimeira sugestão:");
  console.log(JSON.stringify(sugestoes[0], null, 2));
  console.log("\nSANITY CHECK PASSOU — pode subir a correção para produção.");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
