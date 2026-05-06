"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MioloConfig, FormatoId, TemplateId } from "@/lib/miolo-builder";
import { FORMAT_DIMS } from "@/lib/miolo-builder";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectData {
  project_id: string;
  titulo: string;
  autor: string;
  config: MioloConfig | null;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: MioloConfig = {
  template: "literario",
  formato: "padrao_br",
  corpo_pt: 11,
  capitular: true,
  ornamentos: true,
  sumario: true,
  dedicatoria: "",
  epigrafe_texto: "",
  epigrafe_autor: "",
  bio_autor: "",
  marcas_corte: false,
};

const TEMPLATES: { value: TemplateId; label: string }[] = [
  { value: "literario",   label: "Literário (Garamond)" },
  { value: "nao_ficcao",  label: "Não-ficção (Source Serif)" },
  { value: "abnt",        label: "ABNT (Times)" },
  { value: "infantil",    label: "Infantil (Lora)" },
  { value: "poesia",      label: "Poesia (Crimson)" },
  { value: "religioso",   label: "Religioso (Gentium)" },
];

const FORMATOS = Object.entries(FORMAT_DIMS).map(([k, v]) => ({
  value: k as FormatoId,
  label: v.label,
}));

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreviewClient({ data }: { data: ProjectData }) {
  const [config, setConfig] = useState<MioloConfig>(data.config ?? DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // srcdoc cache: config JSON → html string
  const htmlCache = useRef(new Map<string, string>());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfig = useRef(config);
  latestConfig.current = config;

  const buildUrl = useCallback((cfg: MioloConfig) => {
    const params = new URLSearchParams({
      project_id: data.project_id,
      config: JSON.stringify(cfg),
    });
    return `/api/preview/render?${params.toString()}`;
  }, [data.project_id]);

  const loadPreview = useCallback(async (cfg: MioloConfig) => {
    const key = JSON.stringify(cfg);
    if (htmlCache.current.has(key)) {
      const iframe = iframeRef.current;
      if (iframe) iframe.srcdoc = htmlCache.current.get(key)!;
      return;
    }

    try {
      const res = await fetch(buildUrl(cfg));
      if (!res.ok) return;
      const html = await res.text();
      htmlCache.current.set(key, html);
      // Only apply if config hasn't changed while fetching
      if (JSON.stringify(latestConfig.current) === key) {
        const iframe = iframeRef.current;
        if (iframe) iframe.srcdoc = html;
      }
    } catch {
      // silent — iframe keeps previous content
    }
  }, [buildUrl]);

  // Debounced reload on config change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      loadPreview(config);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [config, loadPreview]);

  const set = <K extends keyof MioloConfig>(key: K, value: MioloConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/preview/config?project_id=${data.project_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error();
      setSaveMsg("Configuração salva.");
    } catch {
      setSaveMsg("Erro ao salvar.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setIframeKey(k => k + 1);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Left panel: controls ─────────────────────────────────────────────── */}
      <div style={{ width: "35%", minWidth: 300, maxWidth: 420, overflowY: "auto", borderRight: "1px solid #2a2a2a", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Preview do Miolo</h1>
          <p style={{ fontSize: 12, color: "#888" }}>{data.titulo} · {data.autor}</p>
        </div>

        {/* Template */}
        <Section label="Template">
          <Select
            value={config.template}
            options={TEMPLATES}
            onChange={v => set("template", v as TemplateId)}
          />
        </Section>

        {/* Formato */}
        <Section label="Formato de impressão">
          <Select
            value={config.formato}
            options={FORMATOS}
            onChange={v => set("formato", v as FormatoId)}
          />
        </Section>

        {/* Tipografia */}
        <Section label="Tamanho do corpo">
          <div style={{ display: "flex", gap: 8 }}>
            {([10, 11, 12] as const).map(pt => (
              <button
                key={pt}
                onClick={() => set("corpo_pt", pt)}
                style={btnStyle(config.corpo_pt === pt)}
              >
                {pt}pt
              </button>
            ))}
          </div>
        </Section>

        {/* Switches */}
        <Section label="Elementos">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Toggle label="Capitular (drop cap)" checked={config.capitular} onChange={v => set("capitular", v)} />
            <Toggle label="Ornamentos (***)" checked={config.ornamentos} onChange={v => set("ornamentos", v)} />
            <Toggle label="Sumário" checked={config.sumario} onChange={v => set("sumario", v)} />
            <Toggle label="Marcas de corte (sangria 3mm)" checked={config.marcas_corte} onChange={v => set("marcas_corte", v)} />
          </div>
        </Section>

        {/* Texto libre */}
        <Section label="Dedicatória">
          <textarea
            value={config.dedicatoria}
            onChange={e => set("dedicatoria", e.target.value)}
            rows={3}
            placeholder="Para..."
            style={textareaStyle}
          />
        </Section>

        <Section label="Epígrafe">
          <textarea
            value={config.epigrafe_texto}
            onChange={e => set("epigrafe_texto", e.target.value)}
            rows={3}
            placeholder="Texto da epígrafe..."
            style={textareaStyle}
          />
          <input
            type="text"
            value={config.epigrafe_autor}
            onChange={e => set("epigrafe_autor", e.target.value)}
            placeholder="Autor da epígrafe"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </Section>

        <Section label="Nota sobre o autor">
          <textarea
            value={config.bio_autor}
            onChange={e => set("bio_autor", e.target.value)}
            rows={4}
            placeholder="Breve bio do autor..."
            style={textareaStyle}
          />
        </Section>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...actionBtn, background: "#2563eb", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Salvando..." : "Salvar como configuração atual"}
          </button>
          <button onClick={handleReset} style={{ ...actionBtn, background: "#3f3f46" }}>
            Restaurar padrões
          </button>
          {saveMsg && (
            <p style={{ fontSize: 12, color: saveMsg.startsWith("Erro") ? "#f87171" : "#4ade80", textAlign: "center" }}>
              {saveMsg}
            </p>
          )}
        </div>
      </div>

      {/* ── Right panel: iframe preview ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", background: "#1a1a1a", position: "relative" }}>
        <iframe
          key={iframeKey}
          ref={iframeRef}
          title="Pré-visualização do miolo"
          style={{ width: "100%", height: "100%", border: "none", background: "#888" }}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 8 }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Select({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: "100%", background: "#1c1c1c", color: "#e5e5e5", border: "1px solid #3f3f46", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
      <span
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? "#2563eb" : "#3f3f46",
          position: "relative", flexShrink: 0, transition: "background .15s",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 19 : 3,
          width: 14, height: 14, borderRadius: "50%", background: "#fff",
          transition: "left .15s",
        }} />
      </span>
      {label}
    </label>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#1c1c1c",
  color: "#e5e5e5",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  resize: "vertical",
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1c1c1c",
  color: "#e5e5e5",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
};

const actionBtn: React.CSSProperties = {
  width: "100%",
  padding: "9px 16px",
  borderRadius: 7,
  border: "none",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const btnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: `1px solid ${active ? "#2563eb" : "#3f3f46"}`,
  background: active ? "#1d4ed8" : "#1c1c1c",
  color: "#e5e5e5",
  fontSize: 13,
  cursor: "pointer",
});
