"use client";

import { useEffect, useState } from "react";

/** CAPAS-HOME-01B: descrições reais usadas na geração das capas de
 *  demonstração da vitrine (kit de curadoria 17/ago). O rótulo diz de
 *  qual livro é o prompt — sem promessa de sincronia com o marquee. */
const PROMPTS_VITRINE = [
  {
    livro: "A Última Guardiã",
    texto:
      "Floresta densa ao entardecer, névoa baixa azulada entre troncos altos, uma jovem em silhueta caminhando em direção a uma luz dourada entre as árvores...",
  },
  {
    livro: "Cartas que Não Enviei",
    texto:
      "Mesa de madeira vista de cima com cartas antigas, envelopes abertos, uma xícara de café e manchas de aquarela escorrendo pras bordas...",
  },
  {
    livro: "O Décimo Andar",
    texto:
      "Painel de elevador escuro, todos os botões apagados exceto um único botão iluminado em vermelho, reflexo fraco em metal escovado...",
  },
  {
    livro: "Tainá e o Rio que Cantava",
    texto:
      "Menina numa canoa num rio azul-turquesa sinuoso, um boto rosa espiando da água, mata vibrante nas margens e notas musicais como bolhas...",
  },
  {
    livro: "O Empreendedor Aumentado",
    texto:
      "Figura humana em formas geométricas facetadas correndo em diagonal, trilhas de circuito e setas de luz se ramificando do movimento...",
  },
  {
    livro: "Inventário das Horas",
    texto:
      "Campos de cor sobrepostos em tons de oliva, creme e âmbar como luz passando por uma janela ao longo do dia, textura de papel sutil...",
  },
] as const;

const INTERVALO_MS = 7000;
const FADE_MS = 400;

export default function CapaPromptRotativo() {
  const [idx, setIdx] = useState(0);
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisivel(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PROMPTS_VITRINE.length);
        setVisivel(true);
      }, FADE_MS);
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, []);

  const p = PROMPTS_VITRINE[idx];

  return (
    <div
      className="transition-opacity duration-300 motion-reduce:transition-none"
      style={{ opacity: visivel ? 1 : 0 }}
    >
      <p className="text-zinc-700 text-sm leading-relaxed italic min-h-[60px]">
        &ldquo;{p.texto}&rdquo;
      </p>
      <p className="text-zinc-400 text-xs mt-2">— {p.livro}</p>
    </div>
  );
}
