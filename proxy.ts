import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // Lê a sessão dos cookies (verificação otimista — sem round-trip ao servidor)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Em desenvolvimento, permite acesso sem autenticação para preview
  const isDev = process.env.NODE_ENV === "development";

  // Sem sessão → redireciona para /login preservando o destino original
  if (!session && !isDev) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Aplica apenas a rotas dentro de /dashboard
  matcher: ["/dashboard/:path*"],
};
