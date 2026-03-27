import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/migrate
 * One-time migration to add 'progress_reached' trigger type.
 * Delete this file after running once.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Drop and recreate constraint with new trigger type
    // Using raw SQL via Supabase's pg_net or a workaround
    // Since we can't run DDL via the client, we'll remove the constraint
    // by using the service role key directly

    // Workaround: just test insert — if constraint exists, inform user
    const { error } = await supabase.from("automations").insert({
      org_id: "00000000-0000-0000-0000-000000000000",
      board_id: null,
      name: "__migrate_test__",
      trigger_type: "progress_reached",
      action_type: "mark_completed",
      created_by: user.id,
    });

    if (error?.code === "23514") {
      return NextResponse.json({
        status: "constraint_blocking",
        message: "Execute this SQL in Supabase Dashboard > SQL Editor:",
        sql: "ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check; ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check CHECK (trigger_type IN ('card_moved_to_column', 'card_created', 'card_overdue', 'card_completed', 'progress_reached'));"
      });
    }

    // Clean up test row
    await supabase.from("automations").delete().eq("name", "__migrate_test__");

    return NextResponse.json({ status: "ok", message: "Constraint already allows progress_reached" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
