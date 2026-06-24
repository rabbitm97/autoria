export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dev = isDev();

  let userId: string;

  if (dev) {
    userId = "dev-user";
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
    } catch (e) {
      return e as Response;
    }
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Imagem vazia." }, { status: 400 });
  }

  if (dev) {
    // In dev, skip actual storage upload
    return NextResponse.json({ path: `dev-user/${id}/temp-cover.jpg` });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const path = `${userId}/${id}/temp-cover.jpg`;

  const { error } = await storageClient.storage
    .from("editor-assets")
    .upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path });
}
