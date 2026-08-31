// Helpers de upload do manuscrito (client). Fonte única: novo-projeto e
// wizards de ferramenta.

export const ACCEPTED_EXTS = [".docx", ".pdf", ".txt"];
export const ACCEPTED_MIME = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
];
export const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const mimeOk = ACCEPTED_MIME.includes(file.type);
  const extOk = ACCEPTED_EXTS.includes(ext);
  if (!mimeOk && !extOk) return "Formato inválido. Aceitos: .docx, .pdf ou .txt";
  if (file.size > MAX_BYTES) return "Arquivo muito grande. Máximo: 50 MB";
  return null;
}

export function uploadWithProgress(
  storagePath: string,
  file: File,
  token: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve();
      } else {
        reject(new Error(`Falha no upload (${xhr.status}): ${xhr.responseText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Falha na conexão.")));

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/manuscripts/${storagePath}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(file);
  });
}
