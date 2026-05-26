import type { TemplateId, FormatoId } from "./miolo-builder";

export function buildCustomXmlAnchors(params: {
  project_id: string;
  template: TemplateId;
  formato: FormatoId;
  capitulos: { titulo: string }[];
}): string {
  const { project_id, template, formato, capitulos } = params;

  const json = JSON.stringify({
    autoria_version: "1.0",
    project_id,
    generated_at: new Date().toISOString(),
    template,
    formato,
    capitulos_originais: capitulos.map((c, i) => ({
      id: `cap-${i}`,
      titulo: c.titulo,
      bookmark: `autoria_capitulo_${i + 1}`,
    })),
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<AutoriaMetadata xmlns="urn:autoria:docx:metadata:v1">
  <Json><![CDATA[${json}]]></Json>
</AutoriaMetadata>`;
}
