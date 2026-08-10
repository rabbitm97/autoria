import { createClient } from "@supabase/supabase-js";
import { type FormatoLivro } from "@/lib/formatos";
import {
  verificarMioloBuffer,
  type MarcasVisuaisHint,
  type VerificacaoResultado,
} from "@/lib/verificacao-miolo";

// Reexports dos tipos: consumidores que importam daqui (rotas Express)
// continuam funcionando sem tocar em imports.
export type {
  MotivoFalha,
  DeteccaoFonte,
  MarcasVisuaisHint,
  VerificacaoOk,
  VerificacaoErro,
  VerificacaoResultado,
} from "@/lib/verificacao-miolo";

/**
 * Camada server-only do fluxo Express: baixa o PDF temporário do bucket
 * `livros` (`{userId}/express-temp.pdf`) e delega o núcleo determinístico
 * pra `verificarMioloBuffer` em `lib/verificacao-miolo.ts` — mesmo motor
 * consumido pela ferramenta pública `/ferramentas/verificador-pdf`. Sem
 * escrita no banco, sem chamada de IA.
 */
export async function verificarMioloPdf(params: {
  userId: string;
  formato: FormatoLivro;
  paginas_declaradas: number;
  marcas_visuais?: MarcasVisuaisHint | null;
}): Promise<VerificacaoResultado> {
  const { userId, formato, paginas_declaradas, marcas_visuais } = params;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const path = `${userId}/express-temp.pdf`;
  const { data: blob, error: downloadErr } = await storageClient.storage
    .from("livros")
    .download(path);

  if (downloadErr || !blob) {
    return {
      ok: false,
      motivo: "pdf_ausente",
      divergencias: ["Envie o arquivo do miolo antes de verificar."],
    };
  }

  const buffer = await blob.arrayBuffer();
  return verificarMioloBuffer({ buffer, formato, paginas_declaradas, marcas_visuais });
}
