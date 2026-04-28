import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OverdueItem {
  type: "board" | "bpm";
  title: string;
  dueDate: string;
  link: string;
  phaseName?: string;
  boardName?: string;
  pipeName?: string;
}

/**
 * GET /api/notify-overdue
 * Busca todas as tarefas/cards atrasados e envia mensagem consolidada
 * no DM de cada responsável. Chamado por cron (Vercel Cron / external).
 *
 * SECURITY: protected by CRON_SECRET in the Authorization header. Without
 * this, any visitor could trigger a full DB scan + spam DMs to every
 * overdue user — DoS + abuse vector.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!process.env.CRON_SECRET || auth !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // ── 1. Board cards atrasados ──
    const { data: boardCards } = await adminClient
      .from("cards")
      .select("id, title, due_date, column_id, board_id, completed_at, boards!inner(id, name, org_id)")
      .is("completed_at", null)
      .is("deleted_at", null)
      .not("due_date", "is", null)
      .lt("due_date", todayStr);

    // Buscar assignees dos board cards atrasados
    const boardCardIds = (boardCards || []).map((c: any) => c.id);
    let boardAssignees: any[] = [];
    if (boardCardIds.length > 0) {
      const { data } = await adminClient
        .from("card_assignees")
        .select("card_id, user_id")
        .in("card_id", boardCardIds);
      boardAssignees = data || [];
    }

    // ── 2. BPM cards atrasados ──
    const { data: bpmCards } = await adminClient
      .from("bpm_cards")
      .select("id, title, pipe_id, current_phase_id, assignee_id, sla_deadline, org_id, bpm_pipes!inner(name), bpm_phases!bpm_cards_current_phase_id_fkey(name)")
      .is("completed_at", null)
      .eq("is_archived", false)
      .not("sla_deadline", "is", null)
      .lt("sla_deadline", now.toISOString());

    // ── 3. Agrupar por (org_id, user_id) ──
    const userOverdue: Record<string, { orgId: string; items: OverdueItem[] }> = {};

    function addItem(orgId: string, userId: string, item: OverdueItem) {
      const key = `${orgId}:${userId}`;
      if (!userOverdue[key]) userOverdue[key] = { orgId, items: [] };
      userOverdue[key].items.push(item);
    }

    // Board cards
    for (const card of boardCards || []) {
      const orgId = (card as any).boards?.org_id;
      const boardName = (card as any).boards?.name;
      if (!orgId) continue;
      const assignees = boardAssignees.filter((a: any) => a.card_id === card.id);
      if (assignees.length === 0) continue;
      for (const a of assignees) {
        addItem(orgId, a.user_id, {
          type: "board",
          title: card.title,
          dueDate: card.due_date!,
          link: `/boards`,
          boardName,
        });
      }
    }

    // BPM cards
    for (const card of (bpmCards || []) as any[]) {
      if (!card.assignee_id || !card.org_id) continue;
      addItem(card.org_id, card.assignee_id, {
        type: "bpm",
        title: card.title,
        dueDate: card.sla_deadline,
        link: `/processes/${card.pipe_id}`,
        pipeName: card.bpm_pipes?.name,
        phaseName: card.bpm_phases?.name,
      });
    }

    // ── 4. Para cada user, enviar mensagem no DM ──
    let messagesSent = 0;

    for (const [key, data] of Object.entries(userOverdue)) {
      const [orgId, userId] = key.split(":");
      const { items } = data;

      // Encontrar um admin da org para ser o sender
      const { data: adminMember } = await adminClient
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .in("role", ["owner", "admin"])
        .limit(1)
        .single();

      const senderId = adminMember?.user_id;
      if (!senderId) continue;

      // Se o responsável É o admin, enviar no canal geral
      const isSelf = senderId === userId;

      // Encontrar/criar DM channel entre admin e user
      let channelId: string | null = null;

      if (isSelf) {
        // Enviar no canal geral da org
        const { data: generalChannel } = await adminClient
          .from("channels")
          .select("id")
          .eq("org_id", orgId)
          .eq("type", "channel")
          .eq("name", "geral")
          .limit(1)
          .single();
        channelId = generalChannel?.id || null;
      } else {
        // Buscar DM existente entre sender e user
        const { data: senderChannels } = await adminClient
          .from("channel_members")
          .select("channel_id")
          .eq("user_id", senderId);

        if (senderChannels && senderChannels.length > 0) {
          const senderChIds = senderChannels.map((c: any) => c.channel_id);
          const { data: shared } = await adminClient
            .from("channel_members")
            .select("channel_id")
            .eq("user_id", userId)
            .in("channel_id", senderChIds);

          if (shared && shared.length > 0) {
            const { data: dm } = await adminClient
              .from("channels")
              .select("id")
              .eq("type", "dm")
              .in("id", shared.map((s: any) => s.channel_id))
              .limit(1)
              .single();
            channelId = dm?.id || null;
          }
        }

        // Criar DM se não existe
        if (!channelId) {
          const { data: userProfile } = await adminClient
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single();

          const { data: newChannel } = await adminClient
            .from("channels")
            .insert({
              org_id: orgId,
              name: userProfile?.full_name || "DM",
              type: "dm",
              created_by: senderId,
              is_archived: false,
            })
            .select("id")
            .single();

          if (newChannel) {
            channelId = newChannel.id;
            const ts = new Date().toISOString();
            await adminClient.from("channel_members").insert([
              { channel_id: newChannel.id, user_id: senderId, last_read_at: ts, notifications: "all" },
              { channel_id: newChannel.id, user_id: userId, last_read_at: ts, notifications: "all" },
            ]);
          }
        }
      }

      if (!channelId) continue;

      // Montar mensagem consolidada
      let msg = `⚠️ **Tarefas atrasadas (${items.length})**\n\n`;
      for (const item of items) {
        const due = new Date(item.dueDate);
        const diffMs = now.getTime() - due.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        const diffHours = Math.floor((diffMs % 86400000) / 3600000);
        let atraso = "";
        if (diffDays > 0) atraso = `${diffDays}d`;
        else if (diffHours > 0) atraso = `${diffHours}h`;
        else atraso = "< 1h";

        if (item.type === "board") {
          msg += `• **${item.title}** — ${item.boardName || "Board"} — ${atraso} atrasada\n`;
        } else {
          msg += `• **${item.title}** — ${item.pipeName || "Processo"}${item.phaseName ? ` (${item.phaseName})` : ""} — ${atraso} atrasado\n`;
        }
      }

      await adminClient.from("messages").insert({
        channel_id: channelId,
        user_id: senderId,
        content: msg.trim(),
        mentions: isSelf ? [] : [userId],
        metadata: { is_system: true, type: "overdue_notification" },
      });

      messagesSent++;
    }

    return NextResponse.json({
      boardOverdue: boardCardIds.length,
      bpmOverdue: (bpmCards || []).length,
      usersNotified: messagesSent,
      checked_at: now.toISOString(),
    });
  } catch (err: any) {
    console.error("notify-overdue error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
