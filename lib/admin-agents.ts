export const ADMIN_EMAILS = ["mateusccoelho@gmail.com", "mateusccoelho@hotmail.com"];

export interface AgentMeta {
  name: string;
  label: string;
  model: string;
  hasPrompt: boolean;   // true = has an LLM system prompt editable in admin
  promptKey: string;    // key used in agent_prompts table
}

export const AGENTS_REGISTRY: AgentMeta[] = [
  // ── Agentes da esteira ────────────────────────────────────────────────────
  { name: "diagnostico",          label: "Diagnóstico",          model: "claude-haiku-4-5",          hasPrompt: true,  promptKey: "diagnostico"           },
  { name: "revisao",              label: "Revisão",              model: "claude-sonnet-4-6",         hasPrompt: true,  promptKey: "revisao"               },
  { name: "elementos-editoriais", label: "Elementos Editoriais", model: "claude-sonnet-4-6",         hasPrompt: true,  promptKey: "elementos-editoriais"  },
  { name: "creditos",             label: "Créditos",             model: "claude-sonnet-4-6",         hasPrompt: true,  promptKey: "creditos"              },
  { name: "suporte",              label: "Suporte N1",           model: "claude-sonnet-4-6",         hasPrompt: true,  promptKey: "suporte"               },
  { name: "miolo",                label: "Miolo",                model: "claude-sonnet-4-6",         hasPrompt: true,  promptKey: "miolo-estrutura"       },
  { name: "qa-publicacao",        label: "QA Publicação",        model: "claude-sonnet-4-6",         hasPrompt: false, promptKey: "qa-publicacao"         },
  { name: "prova",                label: "Prova",                model: "— (sem LLM)",               hasPrompt: false, promptKey: "prova"                 },
  { name: "prova-revisao",        label: "Prova Revisão",        model: "— (sem LLM)",               hasPrompt: false, promptKey: "prova-revisao"         },
  // ── Pipeline de capítulos ─────────────────────────────────────────────────
  { name: "propor-capitulos",     label: "Propor Capítulos",     model: "— (heurística)",            hasPrompt: false, promptKey: "propor-capitulos"      },
  { name: "aprovar-capitulos",    label: "Aprovar Capítulos",    model: "— (validação)",             hasPrompt: false, promptKey: "aprovar-capitulos"     },
  // ── Pipeline de capa ──────────────────────────────────────────────────────
  { name: "gerar-capa",           label: "Gerar Capa",           model: "Nano Banana Pro",           hasPrompt: false, promptKey: "gerar-capa"            },
  { name: "gerar-elemento-capa",  label: "Elemento Capa",        model: "Nano Banana Pro",           hasPrompt: false, promptKey: "gerar-elemento-capa"   },
  { name: "montar-capa",          label: "Montar Capa",          model: "Sharp",                     hasPrompt: false, promptKey: "montar-capa"           },
  { name: "upload-capa",          label: "Upload Capa",          model: "— (upload)",                hasPrompt: false, promptKey: "upload-capa"           },
  { name: "ajustar-lombada",      label: "Ajustar Lombada",      model: "Nano Banana Pro + Sharp",   hasPrompt: false, promptKey: "ajustar-lombada"       },
  // ── Geração de artefatos ──────────────────────────────────────────────────
  { name: "gerar-pdf",            label: "Gerar PDF Gráfica",    model: "Puppeteer",                 hasPrompt: false, promptKey: "gerar-pdf"             },
  { name: "gerar-pdf-digital",    label: "Gerar PDF Digital",    model: "Puppeteer",                 hasPrompt: false, promptKey: "gerar-pdf-digital"     },
  { name: "gerar-epub",           label: "Gerar EPUB",           model: "JSZip",                     hasPrompt: false, promptKey: "gerar-epub"            },
  { name: "gerar-docx",           label: "Gerar DOCX",           model: "docx",                      hasPrompt: false, promptKey: "gerar-docx"            },
  { name: "gerar-audio",          label: "Audiolivro",           model: "ElevenLabs",                hasPrompt: false, promptKey: "gerar-audio"           },
];

export function getAgentMeta(name: string): AgentMeta | undefined {
  return AGENTS_REGISTRY.find(a => a.name === name);
}
