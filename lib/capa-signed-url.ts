import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TTL padrão para signed URLs do bucket `capas`. 7 dias é o máximo aceito
 * pelo Supabase e cobre a maioria dos casos de uso (autor volta em <7 dias).
 * Se autor voltar após esse período, precisa refazer upload — bug latente
 * documentado, tratamento automático fica para 14.M.1.7 se necessário.
 */
export const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Gera signed URL para um path no bucket `capas`. Substitui `getPublicUrl`
 * quando o bucket é privado — o usuário precisa da URL assinada para
 * acessar via GET direto, sem depender de policy pública.
 *
 * Nunca lança — retorna objeto com `url` ou `error`. Callers devem tratar
 * o erro explicitamente.
 */
export async function signedUrlCapas(
  storageClient: SupabaseClient,
  path: string,
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  const { data, error } = await storageClient.storage
    .from("capas")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      url: null,
      error: error?.message ?? "createSignedUrl retornou vazio",
    };
  }

  return { url: data.signedUrl, error: null };
}

/**
 * Extrai o path estável (no bucket `capas`) de uma signed URL. Cada
 * `createSignedUrl` gera um token diferente para o MESMO objeto, então
 * comparar URLs assinadas por igualdade é frágil (bug B2-05q: a herança
 * da frente para o verso falhava silenciosamente porque o token da URL
 * gravada em `dados_capa.url_escolhida` divergia da URL da galeria).
 *
 * Casa em URLs do formato `.../object/sign/capas/<PATH>?token=...` — o
 * path retornado é decodificado (o Supabase URL-encoda `/` como `%2F`
 * em alguns casos). Retorna `null` se a URL não bater — caller decide
 * como reagir (na continuação, falha visível 502).
 */
export function storagePathDaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/object\/sign\/capas\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
