import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
