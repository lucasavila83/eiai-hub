import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getCalendarClient,
  refreshIfNeeded,
  toGoogleCardEvent,
} from "@/lib/google/calendar";

/**
 * POST /api/cards/gcal-sync
 * Auto-syncs a card's due date to Google Calendar for all assignees.
 * Body: { cardId: string, orgId?: string }
 *
 * Called fire-and-forget after card creation, due_date change, or assignee change.
 * Uses admin client so it works regardless of which user triggered it.
 */
export async function POST(req: NextRequest) {
  try {
    const { cardId, orgId: passedOrgId } = await req.json();
    if (!cardId) {
      return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get card with board name
    const { data: card } = await supabase
      .from("cards")
      .select("id, title, description, due_date, board_id, completed_at, google_event_id, is_archived")
      .eq("id", cardId)
      .single();

    if (!card || !card.due_date || card.completed_at || card.is_archived) {
      return NextResponse.json({ skipped: true, reason: "sem prazo ou concluída" });
    }

    // Get board name + org_id
    const { data: board } = await supabase
      .from("boards")
      .select("name, org_id")
      .eq("id", card.board_id)
      .single();

    const orgId = passedOrgId || board?.org_id;
    if (!orgId) {
      return NextResponse.json({ error: "org não encontrada" }, { status: 400 });
    }

    // Get all assignees of this card
    const { data: assignees } = await supabase
      .from("card_assignees")
      .select("user_id")
      .eq("card_id", cardId);

    if (!assignees || assignees.length === 0) {
      return NextResponse.json({ skipped: true, reason: "sem responsáveis" });
    }

    const assigneeIds = assignees.map((a) => a.user_id);

    // Get all Google Calendar tokens for these assignees in this org
    // that have this board in synced_board_ids
    const { data: tokens } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("org_id", orgId)
      .in("user_id", assigneeIds);

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ skipped: true, reason: "nenhum responsável com Google Calendar" });
    }

    // Filter tokens where this board is in synced_board_ids
    const relevantTokens = tokens.filter((t: any) =>
      (t.synced_board_ids || []).includes(card.board_id)
    );

    if (relevantTokens.length === 0) {
      return NextResponse.json({ skipped: true, reason: "board não selecionado para sync" });
    }

    const gEvent = toGoogleCardEvent({
      title: card.title,
      description: card.description,
      due_date: card.due_date.split("T")[0], // Ensure date only
      board_name: board?.name || undefined,
    });

    let synced = 0;

    for (const tokenRow of relevantTokens) {
      try {
        // Refresh token if needed
        let accessToken = tokenRow.access_token;
        const refreshed = await refreshIfNeeded(
          tokenRow.access_token,
          tokenRow.refresh_token,
          new Date(tokenRow.expires_at)
        );

        if (refreshed) {
          accessToken = refreshed.access_token;
          await supabase
            .from("google_calendar_tokens")
            .update({
              access_token: refreshed.access_token,
              expires_at: refreshed.expires_at.toISOString(),
            })
            .eq("id", tokenRow.id);
        }

        const calendar = getCalendarClient(accessToken, tokenRow.refresh_token);
        const calendarId = tokenRow.calendar_id || "primary";

        if (card.google_event_id) {
          // Update existing event
          await calendar.events.update({
            calendarId,
            eventId: card.google_event_id,
            requestBody: gEvent,
          });
        } else {
          // Create new event
          const res = await calendar.events.insert({
            calendarId,
            requestBody: gEvent,
          });

          if (res.data.id) {
            // Save google_event_id on the card (only once, first token wins)
            await supabase
              .from("cards")
              .update({
                google_event_id: res.data.id,
                google_synced_at: new Date().toISOString(),
              })
              .eq("id", cardId)
              .is("google_event_id", null); // Only if not already set
          }
        }

        synced++;
      } catch (err: any) {
        console.error(`gcal-sync card ${cardId} for user ${tokenRow.user_id}:`, err.message);
      }
    }

    return NextResponse.json({ synced });
  } catch (err: any) {
    console.error("gcal-sync error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
