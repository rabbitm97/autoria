import { createBrowserClient } from "@supabase/ssr";

// createBrowserClient (not createClient) syncs the session to cookies,
// so the server-side proxy can read it via getSession().
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
