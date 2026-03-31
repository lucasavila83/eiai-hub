import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cards/comment-notify
 * After a comment is added to a card, checks for mirror links
 * and creates notifications for the relevant parties.
 *
 * Body: { card_id: string, comment_preview: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { card_id, comment_preview } = await req.json();
    if (!card_id) return NextResponse.json({ error: "card_id required" }, { status: 400 });

    // Load the card
    const { data: card } = await supabase
      .from("cards")
      .select("id, title, board_id, created_by, metadata")
      .eq("id", card_id)
      .single();

    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    // Get org_id from board
    const { data: board } = await supabase
      .from("boards")
      .select("org_id, name")
      .eq("id", card.board_id)
      .single();

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    // Get commenter's name
    const { data: commenterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const commenterName = commenterProfile?.full_name || "Alguém";
    const preview = (comment_preview || "").substring(0, 80);
    const notifiedUserIds: string[] = [];

    const isMirror = !!(card.metadata as any)?.is_mirror;

    if (isMirror) {
      // This card IS a mirror → notify source card creator + assignees
      const { data: mirrorLink } = await supabase
        .from("card_mirrors")
        .select("source_card_id, source_board_id")
        .eq("mirror_card_id", card_id)
        .single();

      if (mirrorLink) {
        // Get source card info
        const { data: sourceCard } = await supabase
          .from("cards")
          .select("id, title, created_by, board_id")
          .eq("id", mirrorLink.source_card_id)
          .single();

        if (sourceCard) {
          // Notify source card creator
          if (sourceCard.created_by && sourceCard.created_by !== user.id) {
            await supabase.from("notifications").insert({
              org_id: board.org_id,
              user_id: sourceCard.created_by,
              type: "mirror_comment",
              title: `💬 ${commenterName} comentou em "${sourceCard.title}"`,
              body: preview || "Novo comentário na tarefa espelhada",
              link: `/boards/${sourceCard.board_id}?card=${sourceCard.id}`,
              is_read: false,
              metadata: { source_card_id: sourceCard.id, mirror_card_id: card_id, comment_by: user.id },
            });
            notifiedUserIds.push(sourceCard.created_by);
          }

          // Notify source card assignees
          const { data: sourceAssignees } = await supabase
            .from("card_assignees")
            .select("user_id")
            .eq("card_id", sourceCard.id);

          for (const a of sourceAssignees || []) {
            if (a.user_id !== user.id && !notifiedUserIds.includes(a.user_id)) {
              await supabase.from("notifications").insert({
                org_id: board.org_id,
                user_id: a.user_id,
                type: "mirror_comment",
                title: `💬 ${commenterName} comentou em "${sourceCard.title}"`,
                body: preview || "Novo comentário na tarefa espelhada",
                link: `/boards/${sourceCard.board_id}?card=${sourceCard.id}`,
                is_read: false,
                metadata: { source_card_id: sourceCard.id, mirror_card_id: card_id, comment_by: user.id },
              });
              notifiedUserIds.push(a.user_id);
            }
          }

          // Mark activity on source card so it shows "has updates"
          await supabase.from("activity_logs").insert({
            card_id: sourceCard.id,
            user_id: user.id,
            action: "mirror_comment",
            details: { comment_preview: preview, from_mirror: true },
          });
        }
      }
    } else {
      // This card is a SOURCE → notify mirror assignees (hub users)
      const { data: mirrors } = await supabase
        .from("card_mirrors")
        .select("mirror_card_id, mirror_board_id")
        .eq("source_card_id", card_id)
        .eq("status", "active");

      for (const mirror of mirrors || []) {
        // Get mirror card assignees (hub users)
        const { data: mirrorAssignees } = await supabase
          .from("card_assignees")
          .select("user_id")
          .eq("card_id", mirror.mirror_card_id);

        for (const a of mirrorAssignees || []) {
          if (a.user_id !== user.id && !notifiedUserIds.includes(a.user_id)) {
            await supabase.from("notifications").insert({
              org_id: board.org_id,
              user_id: a.user_id,
              type: "mirror_comment",
              title: `💬 ${commenterName} comentou em "${card.title}"`,
              body: preview || "Novo comentário na tarefa original",
              link: `/boards/${mirror.mirror_board_id}?card=${mirror.mirror_card_id}`,
              is_read: false,
              metadata: { source_card_id: card_id, mirror_card_id: mirror.mirror_card_id, comment_by: user.id },
            });
            notifiedUserIds.push(a.user_id);
          }
        }

        // Mark activity on mirror card
        await supabase.from("activity_logs").insert({
          card_id: mirror.mirror_card_id,
          user_id: user.id,
          action: "mirror_comment",
          details: { comment_preview: preview, from_source: true },
        });
      }
    }

    // Also notify all OTHER assignees of THIS card (regardless of mirror)
    const { data: cardAssignees } = await supabase
      .from("card_assignees")
      .select("user_id")
      .eq("card_id", card_id);

    for (const a of cardAssignees || []) {
      if (a.user_id !== user.id && !notifiedUserIds.includes(a.user_id)) {
        await supabase.from("notifications").insert({
          org_id: board.org_id,
          user_id: a.user_id,
          type: "card_comment",
          title: `💬 ${commenterName} comentou em "${card.title}"`,
          body: preview || "Novo comentário",
          link: `/boards/${card.board_id}?card=${card_id}`,
          is_read: false,
          metadata: { card_id, comment_by: user.id },
        });
        notifiedUserIds.push(a.user_id);
      }
    }

    // Notify card creator if not already notified and not the commenter
    if (card.created_by && card.created_by !== user.id && !notifiedUserIds.includes(card.created_by)) {
      await supabase.from("notifications").insert({
        org_id: board.org_id,
        user_id: card.created_by,
        type: "card_comment",
        title: `💬 ${commenterName} comentou em "${card.title}"`,
        body: preview || "Novo comentário",
        link: `/boards/${card.board_id}?card=${card_id}`,
        is_read: false,
        metadata: { card_id, comment_by: user.id },
      });
      notifiedUserIds.push(card.created_by);
    }

    return NextResponse.json({ notified: notifiedUserIds.length, users: notifiedUserIds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
