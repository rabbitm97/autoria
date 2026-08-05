"use client";

import { useState } from "react";

// Thumb da frente da capa via /api/projects/[id]/capa-frente (302 → signed
// URL do JPEG recortado pelo extractor canônico). `children` = fallback
// (mock), sempre montado por baixo; some visualmente quando a imagem cobre.
export function CapaFrenteThumb({
  projectId,
  alt,
  children,
}: {
  projectId: string;
  alt: string;
  children: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative w-full h-full">
      {children}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/projects/${projectId}/capa-frente`}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
