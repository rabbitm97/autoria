"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type WaitlistState =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | null;

export async function joinWaitlist(
  _prevState: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  const email = formData.get("email");

  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "Informe um e-mail válido." };
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase
    .from("waitlist")
    .insert({ email: email.toLowerCase().trim() });

  if (error) {
    if (error.code === "23505") {
      return { status: "success", message: "Este e-mail já está na lista!" };
    }
    return {
      status: "error",
      message: "Não foi possível salvar. Tente novamente.",
    };
  }

  return { status: "success", message: "Você está na lista!" };
}
