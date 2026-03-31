import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export default async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Dev: skip auth so local preview works without credentials
  if (process.env.NODE_ENV === "development") return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          ),
      },
    }
  );

  // getUser() validates the JWT server-side — more secure than getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
