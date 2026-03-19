import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

export async function POST(req: NextRequest) {
  const { name } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const cookieStore = await cookies();

  // Client to get the current user
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  let { data: { user }, error: authError } = await supabase.auth.getUser();

  // Fallback: accept a Bearer token from the Authorization header.
  // This handles the case where the client session lives in memory
  // (e.g. right after signUp before cookies are flushed).
  if (!user) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer) {
      const result = await supabase.auth.getUser(bearer);
      user = result.data.user;
      authError = result.error;
    }
  }

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Admin client to bypass RLS
  const adminClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now();

  // Create org
  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .insert({ name: name.trim(), slug, plan: "free" })
    .select()
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: orgError?.message ?? "Erro ao criar organização" }, { status: 500 });
  }

  // Add user as owner
  const { error: memberError } = await adminClient
    .from("org_members")
    .insert({ org_id: org.id, user_id: user.id, role: "owner" });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // Create default #geral channel
  await adminClient.from("channels").insert({
    org_id: org.id,
    name: "geral",
    type: "public",
    created_by: user.id,
  });

  return NextResponse.json({ org });
}
