import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ADMIN_EMAILS } from "@/lib/admin-agents";

/**
 * Creates a Supabase SSR client bound to the current request's cookies.
 * Use this in Server Components, Server Actions, and Route Handlers.
 *
 * The browser-side client in lib/supabase.ts is for Client Components only.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

/**
 * Authenticates the current request.
 * Returns { user, supabase } on success or throws a Response with 401.
 */
export async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  return { user, supabase };
}

/**
 * Like requireAuth but also verifies admin access.
 * Checks hardcoded ADMIN_EMAILS first, then users.role = "admin".
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (ADMIN_EMAILS.includes(user.email ?? "")) {
    return { user, supabase };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  return { user, supabase };
}
