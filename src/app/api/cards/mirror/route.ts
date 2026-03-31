import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cards/mirror
 * Creates a mirror of a card in the hub board of one of its assignees.
 * Called after card creation when an assignee has a hub board.
 *
 * Body: { card_id: string, board_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { card_id, board_id } = await req.json();
    if (!card_id || !board_id) {
      return NextResponse.json({ error: "card_id and board_id required" }, { status: 400 });
    }

    // Load the source card with assignees
    const { data: card } = await supabase
      .from("cards")
      .select("*, card_assignees(user_id)")
      .eq("id", card_id)
      .single();

    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    // Get the org_id from the source board
    const { data: sourceBoard } = await supabase
      .from("boards")
      .select("org_id")
      .eq("id", board_id)
      .single();

    if (!sourceBoard) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    // Find hub boards for any of the card's assignees (in the same org, excluding source board)
    const assigneeIds = card.card_assignees?.map((a: any) => a.user_id) || [];
    if (assigneeIds.length === 0) {
      return NextResponse.json({ mirrored: false, reason: "no assignees" });
    }

    const { data: hubBoards } = await supabase
      .from("boards")
      .select("id, hub_user_id, name")
      .eq("org_id", sourceBoard.org_id)
      .in("hub_user_id", assigneeIds)
      .neq("id", board_id) // Don't mirror to the same board
      .eq("is_archived", false);

    if (!hubBoards || hubBoards.length === 0) {
      return NextResponse.json({ mirrored: false, reason: "no hub boards for assignees" });
    }

    const results = [];

    for (const hub of hubBoards) {
      // Check if mirror already exists
      const { data: existing } = await supabase
        .from("card_mirrors")
        .select("id")
        .eq("source_card_id", card_id)
        .eq("mirror_board_id", hub.id)
        .single();

      if (existing) {
        results.push({ hub_board: hub.name, skipped: true });
        continue;
      }

      // Find the first column in the hub board (inbox)
      const { data: firstCol } = await supabase
        .from("columns")
        .select("id")
        .eq("board_id", hub.id)
        .order("position", { ascending: true })
        .limit(1)
        .single();

      if (!firstCol) continue;

      // Get source board name for the mirror card title prefix
      const { data: srcBoard } = await supabase
        .from("boards")
        .select("name")
        .eq("id", board_id)
        .single();

      // Get creator name
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", card.created_by)
        .single();

      // Create the mirror card
      const { data: mirrorCard, error: mirrorErr } = await supabase
        .from("cards")
        .insert({
          column_id: firstCol.id,
          board_id: hub.id,
          title: card.title,
          description: card.description,
          priority: card.priority,
          due_date: card.due_date,
          position: 9999, // goes to bottom
          created_by: card.created_by,
          metadata: {
            ...(card.metadata || {}),
            is_mirror: true,
            source_card_id: card_id,
            source_board_id: board_id,
            source_board_name: srcBoard?.name || "",
            mirror_created_by: creator?.full_name || "Alguem",
          },
        })
        .select()
        .single();

      if (mirrorErr || !mirrorCard) continue;

      // Copy attachments from source card to mirror
      const { data: attachments } = await supabase
        .from("card_attachments")
        .select("file_url, file_name, file_size, file_type, uploaded_by")
        .eq("card_id", card_id);

      if (attachments && attachments.length > 0) {
        await supabase.from("card_attachments").insert(
          attachments.map((a: any) => ({
            card_id: mirrorCard.id,
            file_url: a.file_url,
            file_name: a.file_name,
            file_size: a.file_size,
            file_type: a.file_type,
            uploaded_by: a.uploaded_by,
          }))
        );
      }

      // Copy checklists from source card to mirror
      const { data: checklists } = await supabase
        .from("checklists")
        .select("id, name, position, created_by")
        .eq("card_id", card_id)
        .order("position");

      if (checklists && checklists.length > 0) {
        for (const cl of checklists) {
          const { data: newCl } = await supabase
            .from("checklists")
            .insert({ card_id: mirrorCard.id, name: cl.name, position: cl.position, created_by: cl.created_by })
            .select("id")
            .single();

          if (newCl) {
            const { data: items } = await supabase
              .from("checklist_items")
              .select("title, is_completed, due_date, assigned_to, position")
              .eq("checklist_id", cl.id)
              .order("position");

            if (items && items.length > 0) {
              await supabase.from("checklist_items").insert(
                items.map((item: any) => ({ ...item, checklist_id: newCl.id }))
              );
            }
          }
        }
      }

      // Assign the hub user to the mirror card
      await supabase.from("card_assignees").insert({
        card_id: mirrorCard.id,
        user_id: hub.hub_user_id,
      });

      // Create the mirror link
      await supabase.from("card_mirrors").insert({
        source_card_id: card_id,
        mirror_card_id: mirrorCard.id,
        source_board_id: board_id,
        mirror_board_id: hub.id,
      });

      // Log activity on source card
      await supabase.from("activity_logs").insert({
        card_id: card_id,
        user_id: user.id,
        action: "mirrored",
        details: { mirror_board: hub.name, mirror_card_id: mirrorCard.id },
      });

      // Log activity on mirror card (so CEO sees who created it)
      await supabase.from("activity_logs").insert({
        card_id: mirrorCard.id,
        user_id: user.id,
        action: "created",
        details: {
          title: sourceCard.title,
          source: "mirror",
          source_board_id: board_id,
          source_card_id: card_id,
        },
      });

      results.push({ hub_board: hub.name, mirror_card_id: mirrorCard.id });
    }

    return NextResponse.json({ mirrored: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/cards/mirror
 * Syncs completion status between mirror and source card.
 * Called when a mirrored card is completed or uncompleted.
 *
 * Body: { card_id: string, completed: boolean }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { card_id, completed } = await req.json();

    // Check if this card is a mirror (has source in card_mirrors)
    const { data: asMirror } = await supabase
      .from("card_mirrors")
      .select("*, source_card:source_card_id(id, title, board_id, created_by)")
      .eq("mirror_card_id", card_id)
      .single();

    // Check if this card has mirrors (is a source)
    const { data: asSource } = await supabase
      .from("card_mirrors")
      .select("*, mirror_card:mirror_card_id(id, title, board_id)")
      .eq("source_card_id", card_id);

    const now = completed ? new Date().toISOString() : null;
    const notifications = [];

    // If this is a mirror card → sync back to source + notify source board members
    if (asMirror) {
      const source = (asMirror as any).source_card;
      if (source) {
        // Update mirror status
        await supabase
          .from("card_mirrors")
          .update({ status: completed ? "completed" : "active" })
          .eq("id", asMirror.id);

        // Get hub board name for notification
        const { data: mirrorBoard } = await supabase
          .from("boards")
          .select("name, org_id")
          .eq("id", asMirror.mirror_board_id)
          .single();

        // Notify the source card creator
        if (source.created_by && source.created_by !== user.id) {
          await supabase.from("notifications").insert({
            org_id: mirrorBoard?.org_id,
            user_id: source.created_by,
            type: "mirror_completed",
            title: completed
              ? `Tarefa concluida no board ${mirrorBoard?.name || "Hub"}`
              : `Tarefa reaberta no board ${mirrorBoard?.name || "Hub"}`,
            body: source.title,
            link: `/boards/${source.board_id}`,
            is_read: false,
            metadata: { source_card_id: source.id, mirror_card_id: card_id },
          });
          notifications.push(source.created_by);
        }

        // Also notify source card assignees
        const { data: sourceAssignees } = await supabase
          .from("card_assignees")
          .select("user_id")
          .eq("card_id", source.id);

        for (const a of sourceAssignees || []) {
          if (a.user_id !== user.id && !notifications.includes(a.user_id)) {
            await supabase.from("notifications").insert({
              org_id: mirrorBoard?.org_id,
              user_id: a.user_id,
              type: "mirror_completed",
              title: completed
                ? `Tarefa concluida no board ${mirrorBoard?.name || "Hub"}`
                : `Tarefa reaberta no board ${mirrorBoard?.name || "Hub"}`,
              body: source.title,
              link: `/boards/${source.board_id}`,
              is_read: false,
              metadata: { source_card_id: source.id, mirror_card_id: card_id },
            });
          }
        }

        // Log on source card
        await supabase.from("activity_logs").insert({
          card_id: source.id,
          user_id: user.id,
          action: completed ? "mirror_completed" : "mirror_reopened",
          details: { mirror_board: mirrorBoard?.name },
        });
      }
    }

    // If this is a source card → update all its mirrors
    if (asSource && asSource.length > 0) {
      for (const mirror of asSource) {
        const mc = (mirror as any).mirror_card;
        if (mc) {
          await supabase
            .from("cards")
            .update({ completed_at: now })
            .eq("id", mc.id);

          await supabase
            .from("card_mirrors")
            .update({ status: completed ? "completed" : "active" })
            .eq("id", mirror.id);
        }
      }
    }

    return NextResponse.json({ synced: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/cards/mirror
 * Syncs a new attachment to the linked card (mirror→source or source→mirror).
 * Called after an attachment is uploaded to a mirrored card.
 *
 * Body: { card_id: string, attachment: { file_url, file_name, file_size, file_type, uploaded_by } }
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { card_id, attachment } = await req.json();
    if (!card_id || !attachment?.file_url) {
      return NextResponse.json({ error: "card_id and attachment required" }, { status: 400 });
    }

    const synced: string[] = [];

    // If this card is a mirror → sync attachment to source
    const { data: asMirror } = await supabase
      .from("card_mirrors")
      .select("source_card_id")
      .eq("mirror_card_id", card_id);

    for (const m of asMirror || []) {
      // Check if attachment already exists on source (avoid duplicates by file_url)
      const { data: existing } = await supabase
        .from("card_attachments")
        .select("id")
        .eq("card_id", m.source_card_id)
        .eq("file_url", attachment.file_url)
        .single();

      if (!existing) {
        await supabase.from("card_attachments").insert({
          card_id: m.source_card_id,
          file_url: attachment.file_url,
          file_name: attachment.file_name,
          file_size: attachment.file_size,
          file_type: attachment.file_type,
          uploaded_by: attachment.uploaded_by || user.id,
        });
        synced.push(m.source_card_id);
      }
    }

    // If this card is a source → sync attachment to all mirrors
    const { data: asSource } = await supabase
      .from("card_mirrors")
      .select("mirror_card_id")
      .eq("source_card_id", card_id);

    for (const m of asSource || []) {
      const { data: existing } = await supabase
        .from("card_attachments")
        .select("id")
        .eq("card_id", m.mirror_card_id)
        .eq("file_url", attachment.file_url)
        .single();

      if (!existing) {
        await supabase.from("card_attachments").insert({
          card_id: m.mirror_card_id,
          file_url: attachment.file_url,
          file_name: attachment.file_name,
          file_size: attachment.file_size,
          file_type: attachment.file_type,
          uploaded_by: attachment.uploaded_by || user.id,
        });
        synced.push(m.mirror_card_id);
      }
    }

    return NextResponse.json({ synced: synced.length > 0, synced_to: synced });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
