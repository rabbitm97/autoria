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

// Ids determinísticos dos ImageElements injetados a partir de
// `dados_capa` quando modo === "ia". Únicos por alvo: a arte da IA se
// renderiza uma vez só por região, e trocar de opção (via "Ver e usar
// outras gerações") atualiza a MESMA entrada — nunca duplica.
export const CAPA_IA_FRENTE_ID = "capa-ia-frente";
export const CAPA_IA_VERSO_ID = "capa-ia-verso";
export const CAPA_IA_UNICA_ID = "capa-ia-unica";

// Aspect ratio (width/height) das capas retrato geradas pelo Gemini
// (imageConfig.aspectRatio = "2:3" em `app/api/agentes/gerar-capa/route.ts`).
// Aplica-se tanto à frente quanto ao verso — ambos são retrato 2:3.
// Usado pra calcular fit-cover centrado no rect sem esperar o bitmap
// carregar no canvas.
export const CAPA_IA_ASPECT_W = 2;
export const CAPA_IA_ASPECT_H = 3;
