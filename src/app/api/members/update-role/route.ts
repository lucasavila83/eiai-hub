import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { memberId, orgId, newRole } = await req.json();

  if (!["member", "admin"].includes(newRole)) {
    return NextResponse.json({ error: "Role inválida" }, { status: 400 });
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

  // Get target member
  const { data: targetMember } = await adminClient
    .from("org_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }

  // Cannot change owner role
  if (targetMember.role === "owner") {
    return NextResponse.json({ error: "Não é possível alterar o papel do proprietário" }, { status: 400 });
  }

  const { error } = await adminClient
    .from("org_members")
    .update({ role: newRole })
    .eq("id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `Papel alterado para ${newRole}` });
}
