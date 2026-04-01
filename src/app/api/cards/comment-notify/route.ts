import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cards/comment-notify
 * After a comment is added to a card:
 * 1. COPIES the comment to the linked mirror/source card (so both see it)
 * 2. Creates notifications for relevant parties
 *
 * Body: { card_id: string, comment_content: string, comment_preview: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { card_id, comment_content, comment_preview } = await req.json();
    if (!card_id) return NextResponse.json({ error: "card_id required" }, { status: 400 });

    const card = await getCard(supabase, card_id);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const board = await getBoard(supabase, card.board_id);
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const commenterName = await getUserName(supabase, user.id);
    const preview = (comment_preview || comment_content || "").substring(0, 80);
    const content = comment_content || comment_preview || "";
    const notifiedUserIds: string[] = [];
    const syncedCardIds: string[] = [];

    const isMirror = !!(card.metadata as any)?.is_mirror;

    // ── Step 1: Copy comment to linked card(s) ──
    if (isMirror) {
      // This card IS a mirror → copy comment to SOURCE card
      const { data: mirrorLink } = await supabase
        .from("card_mirrors")
        .select("source_card_id, source_board_id")
        .eq("mirror_card_id", card_id)
        .single();

      if (mirrorLink) {
        // Insert comment on source card
        await supabase.from("card_comments").insert({
          card_id: mirrorLink.source_card_id,
          user_id: user.id,
          content: content,
        });
        syncedCardIds.push(mirrorLink.source_card_id);

        // Log activity on source
        await supabase.from("activity_logs").insert({
          card_id: mirrorLink.source_card_id,
          user_id: user.id,
          action: "mirror_comment",
          details: { comment_preview: preview, from_mirror: true, mirror_card_id: card_id },
        });

        // Notify source card people
        const sourceCard = await getCard(supabase, mirrorLink.source_card_id);
        if (sourceCard) {
          await notifyCardPeople(supabase, {
            card: sourceCard,
            orgId: board.org_id,
            commenterName,
            commenterId: user.id,
            preview,
            notifiedUserIds,
            notificationType: "mirror_comment",
          });
        }
      }
    } else {
      // This card is a SOURCE → copy comment to all MIRROR cards
      const { data: mirrors } = await supabase
        .from("card_mirrors")
        .select("mirror_card_id, mirror_board_id")
        .eq("source_card_id", card_id)
        .eq("status", "active");

      for (const mirror of mirrors || []) {
        // Insert comment on mirror card
        await supabase.from("card_comments").insert({
          card_id: mirror.mirror_card_id,
          user_id: user.id,
          content: content,
        });
        syncedCardIds.push(mirror.mirror_card_id);

        // Log activity on mirror
        await supabase.from("activity_logs").insert({
          card_id: mirror.mirror_card_id,
          user_id: user.id,
          action: "mirror_comment",
          details: { comment_preview: preview, from_source: true, source_card_id: card_id },
        });

        // Notify mirror card people
        const mirrorCard = await getCard(supabase, mirror.mirror_card_id);
        if (mirrorCard) {
          await notifyCardPeople(supabase, {
            card: mirrorCard,
            orgId: board.org_id,
            commenterName,
            commenterId: user.id,
            preview,
            notifiedUserIds,
            notificationType: "mirror_comment",
            linkOverride: `/boards/${mirror.mirror_board_id}?card=${mirror.mirror_card_id}`,
          });
        }
      }
    }

    // ── Step 2: Notify assignees + creator of THIS card ──
    await notifyCardPeople(supabase, {
      card,
      orgId: board.org_id,
      commenterName,
      commenterId: user.id,
      preview,
      notifiedUserIds,
      notificationType: "card_comment",
    });

    return NextResponse.json({
      notified: notifiedUserIds.length,
      synced_to: syncedCardIds,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/cards/comment-notify?card_id=xxx
 * Retroactive sync: copies all comments from this card to its linked mirror/source card(s).
 * Also syncs activity logs.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cardId = req.nextUrl.searchParams.get("card_id");
    if (!cardId) return NextResponse.json({ error: "card_id required" }, { status: 400 });

    const card = await getCard(supabase, cardId);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const isMirror = !!(card.metadata as any)?.is_mirror;
    let linkedCardIds: string[] = [];

    if (isMirror) {
      const { data: link } = await supabase
        .from("card_mirrors")
        .select("source_card_id")
        .eq("mirror_card_id", cardId)
        .single();
      if (link) linkedCardIds = [link.source_card_id];
    } else {
      const { data: mirrors } = await supabase
        .from("card_mirrors")
        .select("mirror_card_id")
        .eq("source_card_id", cardId)
        .eq("status", "active");
      linkedCardIds = (mirrors || []).map((m: any) => m.mirror_card_id);
    }

    if (linkedCardIds.length === 0) {
      return NextResponse.json({ synced: 0, message: "No linked cards found" });
    }

    // Get all comments from this card
    const { data: comments } = await supabase
      .from("card_comments")
      .select("user_id, content, created_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: true });

    // Get all activity logs from this card
    const { data: activities } = await supabase
      .from("activity_logs")
      .select("user_id, action, details, created_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: true });

    let syncedComments = 0;
    let syncedActivities = 0;

    for (const targetCardId of linkedCardIds) {
      // Get existing comments on target to avoid duplicates
      const { data: existingComments } = await supabase
        .from("card_comments")
        .select("user_id, content, created_at")
        .eq("card_id", targetCardId);

      const existingSet = new Set(
        (existingComments || []).map((c: any) => `${c.user_id}|${c.content}|${c.created_at}`)
      );

      // Copy missing comments
      for (const comment of comments || []) {
        const key = `${comment.user_id}|${comment.content}|${comment.created_at}`;
        if (!existingSet.has(key)) {
          await supabase.from("card_comments").insert({
            card_id: targetCardId,
            user_id: comment.user_id,
            content: comment.content,
          });
          syncedComments++;
        }
      }

      // Get existing activities on target
      const { data: existingActivities } = await supabase
        .from("activity_logs")
        .select("user_id, action, created_at")
        .eq("card_id", targetCardId);

      const existingActSet = new Set(
        (existingActivities || []).map((a: any) => `${a.user_id}|${a.action}|${a.created_at}`)
      );

      // Copy missing activity logs (skip mirror-specific ones to avoid loops)
      for (const act of activities || []) {
        if (act.action === "mirror_comment" || act.action === "mirror_synced") continue;
        const key = `${act.user_id}|${act.action}|${act.created_at}`;
        if (!existingActSet.has(key)) {
          await supabase.from("activity_logs").insert({
            card_id: targetCardId,
            user_id: act.user_id,
            action: act.action,
            details: { ...act.details, synced_from_mirror: true },
          });
          syncedActivities++;
        }
      }
    }

    return NextResponse.json({
      synced_comments: syncedComments,
      synced_activities: syncedActivities,
      target_cards: linkedCardIds,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ─── Helpers ─── */

async function getCard(supabase: any, cardId: string) {
  const { data } = await supabase
    .from("cards")
    .select("id, title, board_id, created_by, metadata")
    .eq("id", cardId)
    .single();
  return data;
}

async function getBoard(supabase: any, boardId: string) {
  const { data } = await supabase
    .from("boards")
    .select("org_id, name")
    .eq("id", boardId)
    .single();
  return data;
}

async function getUserName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  return data?.full_name || "Alguém";
}

async function notifyCardPeople(
  supabase: any,
  opts: {
    card: any;
    orgId: string;
    commenterName: string;
    commenterId: string;
    preview: string;
    notifiedUserIds: string[];
    notificationType: string;
    linkOverride?: string;
  }
) {
  const { card, orgId, commenterName, commenterId, preview, notifiedUserIds, notificationType, linkOverride } = opts;
  const link = linkOverride || `/boards/${card.board_id}?card=${card.id}`;

  // Notify assignees
  const { data: assignees } = await supabase
    .from("card_assignees")
    .select("user_id")
    .eq("card_id", card.id);

  for (const a of assignees || []) {
    if (a.user_id !== commenterId && !notifiedUserIds.includes(a.user_id)) {
      await supabase.from("notifications").insert({
        org_id: orgId,
        user_id: a.user_id,
        type: notificationType,
        title: `💬 ${commenterName} comentou em "${card.title}"`,
        body: preview || "Novo comentário",
        link,
        is_read: false,
        metadata: { card_id: card.id, comment_by: commenterId },
      });
      notifiedUserIds.push(a.user_id);
    }
  }

  // Notify creator
  if (card.created_by && card.created_by !== commenterId && !notifiedUserIds.includes(card.created_by)) {
    await supabase.from("notifications").insert({
      org_id: orgId,
      user_id: card.created_by,
      type: notificationType,
      title: `💬 ${commenterName} comentou em "${card.title}"`,
      body: preview || "Novo comentário",
      link,
      is_read: false,
      metadata: { card_id: card.id, comment_by: commenterId },
    });
    notifiedUserIds.push(card.created_by);
  }
}
