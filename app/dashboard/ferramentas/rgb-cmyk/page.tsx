import Link from "next/link";
import RgbCmykTool from "@/components/ferramentas/rgb-cmyk-tool";

export default function RgbCmykPage() {
  return (
    <div>
      <RgbCmykTool />
      <div className="mt-4 mb-10 text-center">
        <Link
          href="/dashboard/ferramentas"
          className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
        >
          ← Voltar às ferramentas
        </Link>
      </div>
    </div>
  );
}
