import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_DOCS, LEGAL_DOC_SLUGS, type LegalDocSlug } from "@/lib/legal-docs";

export default function LegalDocFrame({
  slug,
  children,
}: {
  slug: LegalDocSlug;
  children: ReactNode;
}) {
  const doc = LEGAL_DOCS[slug];
  const outros = LEGAL_DOC_SLUGS.filter((s) => s !== slug).map((s) => LEGAL_DOCS[s]);

  return (
    <>
      <div className="mb-8 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8760a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
          Rascunho v{doc.versao} · sujeito a revisão jurídica
        </span>
      </div>

      <h1 className="font-heading text-4xl text-brand-primary mb-8 leading-tight">
        {doc.titulo}
      </h1>

      <article className="space-y-6 text-zinc-700 leading-relaxed">
        {children}
      </article>

      <div className="mt-16 pt-8 border-t border-zinc-100">
        <p className="text-xs text-zinc-400 mb-4">
          Versão {doc.versao} · Vigência: {doc.vigenciaISO}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {outros.map((d, i) => (
            <span key={d.slug} className="flex items-center gap-x-4">
              {i > 0 && <span className="text-zinc-300">·</span>}
              <Link href={d.rota} className="text-zinc-500 hover:text-brand-primary underline underline-offset-4 transition-colors">
                {d.titulo}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
