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
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { invitationId } = await req.json();

    if (!invitationId) {
      return NextResponse.json({ error: "invitationId é obrigatório" }, { status: 400 });
    }

    // Fetch the invitation
    const { data: invitation, error: invErr } = await adminClient
      .from("invitations")
      .select("org_id")
      .eq("id", invitationId)
      .is("accepted_at", null)
      .single();

    if (invErr || !invitation) {
      return NextResponse.json({ error: "Convite não encontrado ou já aceito" }, { status: 404 });
    }

    // Verify user is admin/owner of the org
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("org_id", invitation.org_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Delete the invitation
    const { error: delErr } = await adminClient
      .from("invitations")
      .delete()
      .eq("id", invitationId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Convite removido" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
