import sharp from "sharp";
import { join } from "path";

export const ICC_PROFILE_PATH = join(
  process.cwd(),
  "public",
  "icc",
  "CoatedFOGRA39.icc",
);

/**
 * Converte JPG/PNG (buffer) em JPEG CMYK com Coated FOGRA39 embutido.
 * Fonte única: editor de capa e ferramenta pública consomem ESTA função —
 * qualquer mudança de qualidade/perfil aqui reflete nos dois caminhos.
 */
export async function converterImagemParaCmyk(entrada: Buffer): Promise<Buffer> {
  return sharp(entrada)
    .withIccProfile(ICC_PROFILE_PATH)
    .jpeg({ quality: 95 })
    .toBuffer();
}
