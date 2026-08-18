"use client";

import { useEffect, useRef, useState } from "react";

/** VIDEO-ATOS-01: fecho da seção Processo. Teaser mudo em loop roda
 *  só quando visível (IntersectionObserver — economia de bateria e
 *  atenção); o clique é o gesto que libera o vídeo completo COM som.
 *  Regra de copy: nunca exibir tempo do vídeo (martelada 18/ago). */
export default function TutorialVideo() {
  const [modo, setModo] = useState<"teaser" | "completo">("teaser");
  const teaserRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = teaserRef.current;
    if (!el || modo !== "teaser") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [modo]);

  return (
    <div className="mt-10 text-center">
      <h3 className="font-heading text-2xl text-brand-primary mb-1">
        Veja a esteira inteira, de verdade
      </h3>
      <p className="text-brand-primary/55 text-sm mb-5">
        Do arquivo ao livro pronto — uma passada rápida, sem enrolação.
      </p>
      <div className="relative max-w-3xl mx-auto rounded-2xl overflow-hidden border border-brand-primary/10 shadow-sm bg-brand-primary">
        {modo === "teaser" ? (
          <button
            type="button"
            onClick={() => setModo("completo")}
            className="group block w-full cursor-pointer"
            aria-label="Assistir o tutorial completo com som"
          >
            <video
              ref={teaserRef}
              src="/media/tutorial-teaser.mp4"
              poster="/media/tutorial-poster.jpg"
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-auto block"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="bg-brand-primary/80 group-hover:bg-brand-primary text-white text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 transition-colors">
                ▶ Assistir com som
              </span>
            </span>
          </button>
        ) : (
          <video
            src="/media/tutorial-autoria.mp4"
            poster="/media/tutorial-poster.jpg"
            controls
            autoPlay
            playsInline
            className="w-full h-auto block"
          />
        )}
      </div>
    </div>
  );
}
