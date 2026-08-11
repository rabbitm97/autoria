import Image from "next/image";

const SRC = { gold: "/logo-amarelo.png", navy: "/logo-azul.png" } as const;

export default function BrandLogo({
  variant,
  height = 32,
  priority = false,
  className = "",
}: {
  variant: "gold" | "navy";
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={SRC[variant]}
      alt="Autoria"
      width={Math.round(height * 5.62)}
      height={height}
      priority={priority}
      className={`w-auto object-contain ${className}`}
      style={{ height }}
    />
  );
}
