import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCalendarClient,
  refreshIfNeeded,
  toGoogleEvent,
  fromGoogleEvent,
} from "@/lib/google/calendar";

/**
 * POST /api/integrations/google-calendar/sync
 * Bidirectional sync between EIAI events and Google Calendar.
 * Body: { orgId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await req.json();

    // Get user's Google Calendar tokens
    const { data: tokenRow } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!tokenRow) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
    }

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

    // Time range: 30 days back, 90 days ahead
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);

    const stats = { pushed: 0, pulled: 0, updated: 0 };

    // ─── PUSH: EIAI → Google ──────────────────────────────────────────────

    // Get EIAI events not yet synced to Google
    const { data: localEvents } = await supabase
      .from("events")
      .select("*")
      .eq("org_id", orgId)
      .eq("created_by", user.id)
      .is("google_event_id", null)
      .gte("start_at", timeMin.toISOString())
      .lte("start_at", timeMax.toISOString());

    for (const ev of localEvents || []) {
      try {
        const gEvent = toGoogleEvent(ev);
        const res = await calendar.events.insert({
          calendarId,
          requestBody: gEvent,
        });

        if (res.data.id) {
          await supabase
            .from("events")
            .update({
              google_event_id: res.data.id,
              google_synced_at: new Date().toISOString(),
            })
            .eq("id", ev.id);
          stats.pushed++;
        }
      } catch (err: any) {
        console.error(`Failed to push event ${ev.id}:`, err.message);
      }
    }

    // Update already-synced events that changed since last sync
    const { data: syncedEvents } = await supabase
      .from("events")
      .select("*")
      .eq("org_id", orgId)
      .eq("created_by", user.id)
      .not("google_event_id", "is", null)
      .gt("updated_at", "google_synced_at")
      .gte("start_at", timeMin.toISOString())
      .lte("start_at", timeMax.toISOString());

    for (const ev of syncedEvents || []) {
      try {
        const gEvent = toGoogleEvent(ev);
        await calendar.events.update({
          calendarId,
          eventId: ev.google_event_id!,
          requestBody: gEvent,
        });

        await supabase
          .from("events")
          .update({ google_synced_at: new Date().toISOString() })
          .eq("id", ev.id);
        stats.updated++;
      } catch (err: any) {
        // Event may have been deleted from Google
        if (err.code === 404 || err.code === 410) {
          await supabase
            .from("events")
            .update({ google_event_id: null, google_synced_at: null })
            .eq("id", ev.id);
        }
      }
    }

    // ─── PULL: Google → EIAI ──────────────────────────────────────────────

    try {
      const res = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });

      const googleEvents = res.data.items || [];

      // Get all google_event_ids we already know about
      const { data: knownEvents } = await supabase
        .from("events")
        .select("google_event_id")
        .eq("org_id", orgId)
        .eq("created_by", user.id)
        .not("google_event_id", "is", null);

      const knownIds = new Set((knownEvents || []).map((e) => e.google_event_id));

      for (const gEvent of googleEvents) {
        if (!gEvent.id || knownIds.has(gEvent.id)) continue;
        // Skip cancelled events
        if (gEvent.status === "cancelled") continue;

        try {
          const parsed = fromGoogleEvent(gEvent);
          await supabase.from("events").insert({
            org_id: orgId,
            ...parsed,
            color: "#22c55e", // Green for imported events
            created_by: user.id,
            google_synced_at: new Date().toISOString(),
          });
          stats.pulled++;
        } catch (err: any) {
          console.error(`Failed to pull event ${gEvent.id}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("Failed to list Google Calendar events:", err.message);
    }

    return NextResponse.json({ synced: true, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
