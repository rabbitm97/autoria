export const GUIDE_SANGRIA_COLOR = "#d74343";
export const GUIDE_DOBRA_COLOR = "#3a6bd7";
export const GUIDE_ORELHA_COLOR = "#2d8a4f";
export const GUIDE_LOMBADA_CENTER_COLOR = "#999999";
export const GUIDE_LABEL_COLOR = "#cccccc";

export const CANVAS_BG_COLOR = "#e8e6e0";
export const PAPER_COLOR = "#ffffff";

export const SIDEBAR_WIDTH = 240;
export const TOPBAR_HEIGHT = 56;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;
export const ZOOM_FIT_MARGIN = 40;

// Id determinístico do ImageElement injetado a partir de `dados_capa.modo === "ia"`.
// Único: a arte da IA se renderiza uma vez só, e trocar de opção (via
// "Ver e usar outras gerações") atualiza a mesma entrada.
export const CAPA_IA_FRENTE_ID = "capa-ia-frente";

// Aspect ratio (width/height) das capas geradas pelo Gemini
// (imageConfig.aspectRatio = "2:3" em `app/api/agentes/gerar-capa/route.ts`).
// Usado pra calcular fit-cover centrado no rect da frente sem esperar o
// bitmap carregar no canvas.
export const CAPA_IA_ASPECT_W = 2;
export const CAPA_IA_ASPECT_H = 3;
