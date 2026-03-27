import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { userId, orgId, newName } = await req.json();

  if (!userId || !orgId || !newName?.trim()) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Verify caller is admin/owner
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await adminClient.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: callerMember } = await adminClient
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Verify target is in same org
  const { data: targetMember } = await adminClient
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Membro não encontrado nesta organização" }, { status: 404 });
  }

  // Update the profile name using service role (bypasses RLS)
  const { error } = await adminClient
    .from("profiles")
    .update({ full_name: newName.trim() })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `Nome alterado para "${newName.trim()}"` });
}
