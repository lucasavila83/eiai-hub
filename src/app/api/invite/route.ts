import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Try Authorization header
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
    }

    const userId = user?.id;
    const { email, orgId, role = "member" } = await req.json();

    if (!email || !orgId) {
      return NextResponse.json({ error: "Email e orgId são obrigatórios" }, { status: 400 });
    }

    // Verify user is admin/owner of the org
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Check if user already member
    const { data: existingMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", (
        await adminClient.from("profiles").select("id").eq("email", email).single()
      ).data?.id || "00000000-0000-0000-0000-000000000000")
      .single();

    if (existingMember) {
      return NextResponse.json({ error: "Usuário já é membro" }, { status: 409 });
    }

    // Create invitation
    const { data: invitation, error } = await adminClient
      .from("invitations")
      .insert({
        org_id: orgId,
        email,
        role,
        invited_by: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const inviteUrl = `${req.nextUrl.origin}/invite/${invitation.token}`;

    return NextResponse.json({ invitation, inviteUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
