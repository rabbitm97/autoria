import Image from "next/image";

// Wordmark v3 em Fraunces (13/ago/2026). Chaves gold/navy mantêm nome
// por compat de API; "gold" agora aponta pro offwhite (superfícies escuras:
// sidebar, auth, footer). "navy" segue nas superfícies claras (navbar home, cards).
const SRC = {
  gold: "/logo-offwhite-v3.png",
  navy: "/logo-azul-v3.png",
} as const;

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
