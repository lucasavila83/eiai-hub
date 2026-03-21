import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { memberId, orgId } = await req.json();

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

  // Get the member to be removed
  const { data: targetMember } = await adminClient
    .from("org_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }

  // Cannot remove owner
  if (targetMember.role === "owner") {
    return NextResponse.json({ error: "Não é possível remover o proprietário" }, { status: 400 });
  }

  // Cannot remove yourself
  if (targetMember.user_id === user.id) {
    return NextResponse.json({ error: "Não é possível remover a si mesmo" }, { status: 400 });
  }

  // Remove from team_members first
  await adminClient
    .from("team_members")
    .delete()
    .eq("user_id", targetMember.user_id);

  // Remove from channel_members
  await adminClient
    .from("channel_members")
    .delete()
    .eq("user_id", targetMember.user_id);

  // Remove from org_members
  const { error } = await adminClient
    .from("org_members")
    .delete()
    .eq("id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Membro removido com sucesso" });
}
