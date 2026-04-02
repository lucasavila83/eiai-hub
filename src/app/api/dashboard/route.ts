import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const orgId = sp.get("org_id");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    const userId = sp.get("user_id") || null;
    const teamId = sp.get("team_id") || null;
    const boardId = sp.get("board_id") || null;
    const pipeId = sp.get("pipe_id") || null;
    const priority = sp.get("priority") || null;

    const now = new Date();
    const fromStr = sp.get("from") || new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    const toStr = sp.get("to") || now.toISOString().split("T")[0];
    const fromISO = `${fromStr}T00:00:00.000Z`;
    const toISO = `${toStr}T23:59:59.999Z`;

    // Resolve team members if team filter
    let teamUserIds: string[] | null = null;
    if (teamId) {
      const { data: tm } = await admin.from("team_members").select("user_id").eq("team_id", teamId);
      teamUserIds = (tm || []).map((t: any) => t.user_id);
      if (teamUserIds.length === 0) teamUserIds = ["00000000-0000-0000-0000-000000000000"];
    }

    // Effective user filter (single user or team users)
    const filterUserIds = userId ? [userId] : teamUserIds;

    // ── Load base data in parallel ──
    const [boardsRes, columnsRes, allCardsRes, assigneesRes, bpmCardsRes, profilesRes, goalsRes] = await Promise.all([
      admin.from("boards").select("id, name").eq("org_id", orgId).eq("is_archived", false),
      admin.from("columns").select("id, name, board_id, is_done_column").eq("is_archived", false),
      (() => {
        let q = admin.from("cards").select("id, board_id, column_id, priority, due_date, completed_at, is_archived, created_at, updated_at, created_by")
          .eq("is_archived", false);
        if (boardId) q = q.eq("board_id", boardId);
        if (priority) q = q.eq("priority", priority);
        return q;
      })(),
      admin.from("card_assignees").select("card_id, user_id"),
      (() => {
        let q = admin.from("bpm_cards").select("id, pipe_id, assignee_id, priority, sla_deadline, completed_at, is_archived, created_at, updated_at, started_at")
          .eq("org_id", orgId).eq("is_archived", false);
        if (pipeId) q = q.eq("pipe_id", pipeId);
        if (priority) q = q.eq("priority", priority);
        return q;
      })(),
      admin.from("profiles").select("id, full_name, avatar_url, email"),
      admin.from("member_goals").select("*").eq("org_id", orgId),
    ]);

    const boards = boardsRes.data || [];
    const columns = columnsRes.data || [];
    const allAssignees = assigneesRes.data || [];
    const profiles = profilesRes.data || [];
    const goalRows = goalsRes.data || [];

    const boardIds = new Set(boards.map((b: any) => b.id));
    const doneColumnIds = new Set(columns.filter((c: any) => c.is_done_column).map((c: any) => c.id));

    // Filter cards to org boards
    let orgCards = (allCardsRes.data || []).filter((c: any) => boardIds.has(c.board_id));
    let bpmCards = bpmCardsRes.data || [];

    // Build assignee map: cardId -> userIds
    const cardAssigneeMap: Record<string, string[]> = {};
    for (const a of allAssignees) {
      if (!cardAssigneeMap[a.card_id]) cardAssigneeMap[a.card_id] = [];
      cardAssigneeMap[a.card_id].push(a.user_id);
    }

    // Filter by user/team
    if (filterUserIds) {
      const uidSet = new Set(filterUserIds);
      orgCards = orgCards.filter((c: any) => {
        const assignees = cardAssigneeMap[c.id] || [];
        return assignees.some((uid) => uidSet.has(uid));
      });
      bpmCards = bpmCards.filter((c: any) => c.assignee_id && uidSet.has(c.assignee_id));
    }

    // Profile lookup
    const profileMap: Record<string, any> = {};
    for (const p of profiles) profileMap[p.id] = p;

    // ── Merge board + BPM cards into unified list ──
    interface UnifiedCard {
      id: string;
      type: "board" | "bpm";
      priority: string;
      dueDate: string | null;
      completedAt: string | null;
      createdAt: string;
      updatedAt: string;
      assigneeIds: string[];
    }

    const unified: UnifiedCard[] = [];

    for (const c of orgCards) {
      unified.push({
        id: c.id,
        type: "board",
        priority: c.priority || "none",
        dueDate: c.due_date,
        completedAt: c.completed_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at || c.created_at,
        assigneeIds: cardAssigneeMap[c.id] || [],
      });
    }

    for (const c of bpmCards) {
      unified.push({
        id: c.id,
        type: "bpm",
        priority: c.priority || "none",
        dueDate: c.sla_deadline,
        completedAt: c.completed_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at || c.created_at,
        assigneeIds: c.assignee_id ? [c.assignee_id] : [],
      });
    }

    // Period-scoped cards
    const createdInPeriod = unified.filter((c) => c.createdAt >= fromISO && c.createdAt <= toISO);
    const completedInPeriod = unified.filter((c) => c.completedAt && c.completedAt >= fromISO && c.completedAt <= toISO);
    const openCards = unified.filter((c) => !c.completedAt);
    const overdueCards = openCards.filter((c) => c.dueDate && new Date(c.dueDate) < now);

    // ── Overview ──
    const completedWithDue = completedInPeriod.filter((c) => c.dueDate);
    const onTime = completedWithDue.filter((c) => new Date(c.completedAt!) <= new Date(c.dueDate!)).length;

    // Lead time
    let avgLeadTimeDays = 0;
    if (completedInPeriod.length > 0) {
      const totalMs = completedInPeriod.reduce((sum, c) => {
        return sum + (new Date(c.completedAt!).getTime() - new Date(c.createdAt).getTime());
      }, 0);
      avgLeadTimeDays = Math.round(totalMs / completedInPeriod.length / 86400000 * 10) / 10;
    }

    const overview = {
      totalCreated: createdInPeriod.length,
      totalCompleted: completedInPeriod.length,
      completionRate: createdInPeriod.length > 0 ? Math.round((completedInPeriod.length / createdInPeriod.length) * 100) : 0,
      totalOpen: openCards.length,
      totalOverdue: overdueCards.length,
      overdueRate: openCards.length > 0 ? Math.round((overdueCards.length / openCards.length) * 100) : 0,
      avgLeadTimeDays,
      onTimeRate: completedWithDue.length > 0 ? Math.round((onTime / completedWithDue.length) * 100) : 100,
    };

    // ── Productivity by member ──
    const memberStats: Record<string, { completed: number; overdue: number; open: number; totalMs: number; completedCount: number }> = {};
    const allUserIds = new Set<string>();

    for (const c of unified) {
      for (const uid of c.assigneeIds) {
        allUserIds.add(uid);
        if (!memberStats[uid]) memberStats[uid] = { completed: 0, overdue: 0, open: 0, totalMs: 0, completedCount: 0 };
        if (c.completedAt) {
          memberStats[uid].completed++;
          memberStats[uid].totalMs += new Date(c.completedAt).getTime() - new Date(c.createdAt).getTime();
          memberStats[uid].completedCount++;
        } else {
          memberStats[uid].open++;
          if (c.dueDate && new Date(c.dueDate) < now) memberStats[uid].overdue++;
        }
      }
    }

    const byMember = Array.from(allUserIds).map((uid) => {
      const s = memberStats[uid] || { completed: 0, overdue: 0, open: 0, totalMs: 0, completedCount: 0 };
      const p = profileMap[uid];
      return {
        userId: uid,
        name: p?.full_name || p?.email || uid.slice(0, 8),
        avatarUrl: p?.avatar_url || null,
        completed: s.completed,
        overdue: s.overdue,
        open: s.open,
        avgTimeDays: s.completedCount > 0 ? Math.round(s.totalMs / s.completedCount / 86400000 * 10) / 10 : 0,
      };
    }).sort((a, b) => b.completed - a.completed);

    const productivity = {
      byMember,
      avgPerMember: byMember.length > 0 ? Math.round(byMember.reduce((s, m) => s + m.completed, 0) / byMember.length * 10) / 10 : 0,
    };

    // ── Timeline ──
    const dayMs = 86400000;
    const fromTime = new Date(fromISO).getTime();
    const toTime = new Date(toISO).getTime();
    const totalDays = Math.ceil((toTime - fromTime) / dayMs);
    // Group by week if > 60 days, otherwise by day
    const groupByWeek = totalDays > 60;

    const timelineMap: Record<string, { created: number; completed: number }> = {};

    for (const c of unified) {
      const dateKey = c.createdAt.split("T")[0];
      if (dateKey >= fromStr && dateKey <= toStr) {
        if (!timelineMap[dateKey]) timelineMap[dateKey] = { created: 0, completed: 0 };
        timelineMap[dateKey].created++;
      }
      if (c.completedAt) {
        const compKey = c.completedAt.split("T")[0];
        if (compKey >= fromStr && compKey <= toStr) {
          if (!timelineMap[compKey]) timelineMap[compKey] = { created: 0, completed: 0 };
          timelineMap[compKey].completed++;
        }
      }
    }

    const createdVsCompleted = [];
    for (let t = fromTime; t <= toTime; t += dayMs) {
      const d = new Date(t).toISOString().split("T")[0];
      const entry = timelineMap[d] || { created: 0, completed: 0 };
      createdVsCompleted.push({ date: d, ...entry });
    }

    // ── Deadlines ──
    const completedAll = unified.filter((c) => c.completedAt);
    const withDue = completedAll.filter((c) => c.dueDate);
    const lateCompleted = withDue.filter((c) => new Date(c.completedAt!) > new Date(c.dueDate!));
    const noDue = completedAll.filter((c) => !c.dueDate);

    // Late by member
    const lateMemberMap: Record<string, { total: number; late: number }> = {};
    for (const c of unified) {
      if (!c.dueDate) continue;
      for (const uid of c.assigneeIds) {
        if (!lateMemberMap[uid]) lateMemberMap[uid] = { total: 0, late: 0 };
        lateMemberMap[uid].total++;
        const isLate = c.completedAt
          ? new Date(c.completedAt) > new Date(c.dueDate)
          : new Date(c.dueDate) < now && !c.completedAt;
        if (isLate) lateMemberMap[uid].late++;
      }
    }

    const lateByMember = Object.entries(lateMemberMap)
      .filter(([, v]) => v.late > 0)
      .map(([uid, v]) => ({
        userId: uid,
        name: profileMap[uid]?.full_name || profileMap[uid]?.email || uid.slice(0, 8),
        lateCount: v.late,
        lateRate: v.total > 0 ? Math.round((v.late / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.lateCount - a.lateCount);

    const deadlines = {
      onTime: withDue.length - lateCompleted.length,
      late: lateCompleted.length + overdueCards.length,
      noDeadline: noDue.length,
      lateByMember,
    };

    // ── Backlog ──
    const staleThreshold = now.getTime() - 7 * dayMs;
    const staleCards = openCards.filter((c) => new Date(c.updatedAt).getTime() < staleThreshold);

    const priorityCounts: Record<string, number> = {};
    for (const c of openCards) {
      priorityCounts[c.priority] = (priorityCounts[c.priority] || 0) + 1;
    }

    let avgAgeDays = 0;
    if (openCards.length > 0) {
      const totalAge = openCards.reduce((s, c) => s + (now.getTime() - new Date(c.createdAt).getTime()), 0);
      avgAgeDays = Math.round(totalAge / openCards.length / dayMs * 10) / 10;
    }

    const backlog = {
      total: openCards.length,
      avgAgeDays,
      stale: staleCards.length,
      byPriority: Object.entries(priorityCounts)
        .map(([p, count]) => ({ priority: p, count }))
        .sort((a, b) => b.count - a.count),
    };

    // ── Board Progress ──
    const boardProgress = boards.map((b: any) => {
      const bCards = orgCards.filter((c: any) => c.board_id === b.id);
      const done = bCards.filter((c: any) => c.completed_at || doneColumnIds.has(c.column_id)).length;
      return {
        boardId: b.id,
        name: b.name.length > 25 ? b.name.slice(0, 25) + "..." : b.name,
        total: bCards.length,
        done,
        pct: bCards.length > 0 ? Math.round((done / bCards.length) * 100) : 0,
      };
    });

    // ── BPM Phase Avg Times ──
    let bpmPhaseAvg: any[] = [];
    if (!boardId) {
      // Load BPM history and phases
      const [histRes, phasesRes, pipesRes] = await Promise.all([
        admin.from("bpm_card_history").select("card_id, from_phase_id, to_phase_id, moved_at, action")
          .in("action", ["moved", "created"]).order("moved_at", { ascending: true }),
        admin.from("bpm_phases").select("id, pipe_id, name, position").order("position", { ascending: true }),
        admin.from("bpm_pipes").select("id, name").eq("org_id", orgId),
      ]);

      const history = histRes.data || [];
      const phases = phasesRes.data || [];
      const bpmPipes = pipesRes.data || [];

      // Filter history to cards in our bpmCards set
      const bpmCardIds = new Set(bpmCards.map((c: any) => c.id));
      const relevantHistory = history.filter((h: any) => bpmCardIds.has(h.card_id));

      // Group history by card, calculate time in each phase
      const phaseTimeMap: Record<string, { totalMs: number; count: number }> = {};

      // Group by card_id
      const histByCard: Record<string, any[]> = {};
      for (const h of relevantHistory) {
        if (!histByCard[h.card_id]) histByCard[h.card_id] = [];
        histByCard[h.card_id].push(h);
      }

      for (const entries of Object.values(histByCard)) {
        entries.sort((a: any, b: any) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
        for (let i = 0; i < entries.length - 1; i++) {
          const phaseId = entries[i].to_phase_id;
          if (!phaseId) continue;
          const duration = new Date(entries[i + 1].moved_at).getTime() - new Date(entries[i].moved_at).getTime();
          if (duration <= 0) continue;
          if (!phaseTimeMap[phaseId]) phaseTimeMap[phaseId] = { totalMs: 0, count: 0 };
          phaseTimeMap[phaseId].totalMs += duration;
          phaseTimeMap[phaseId].count++;
        }
      }

      // Group phases by pipe
      const pipeMap: Record<string, any> = {};
      for (const p of bpmPipes) pipeMap[p.id] = p;

      const phasesByPipe: Record<string, any[]> = {};
      for (const ph of phases) {
        if (!pipeMap[ph.pipe_id]) continue;
        if (pipeId && ph.pipe_id !== pipeId) continue;
        if (!phasesByPipe[ph.pipe_id]) phasesByPipe[ph.pipe_id] = [];
        const stats = phaseTimeMap[ph.id];
        if (stats && stats.count > 0) {
          phasesByPipe[ph.pipe_id].push({
            phaseId: ph.id,
            phaseName: ph.name,
            avgHours: Math.round((stats.totalMs / stats.count / 3600000) * 10) / 10,
            cardCount: stats.count,
          });
        }
      }

      bpmPhaseAvg = Object.entries(phasesByPipe).map(([pid, ph]) => ({
        pipeId: pid,
        pipeName: pipeMap[pid]?.name || pid,
        phases: ph,
      }));
    }

    // ── Goals ──
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const currentYear = now.getFullYear();

    const goals = goalRows
      .filter((g: any) => {
        if (filterUserIds && !filterUserIds.includes(g.user_id)) return false;
        return true;
      })
      .map((g: any) => {
        let target = g.target_value || 0;
        let current = g.current_value || 0;

        // If has monthly breakdown, use current month
        if (g.values_by_month && g.year === currentYear) {
          target = g.values_by_month[currentMonth] || target;
        }
        if (g.actuals_by_month && g.year === currentYear) {
          current = g.actuals_by_month[currentMonth] || current;
        }

        const p = profileMap[g.user_id];
        return {
          userId: g.user_id,
          name: p?.full_name || p?.email || g.user_id?.slice(0, 8) || "—",
          goalName: g.goal_name || g.goal_type || "Meta",
          targetValue: target,
          currentValue: current,
          pct: target > 0 ? Math.round((current / target) * 100) : 0,
        };
      });

    return NextResponse.json({
      overview,
      productivity,
      timeline: { createdVsCompleted },
      deadlines,
      backlog,
      boardProgress,
      bpmPhaseAvg,
      goals,
    });
  } catch (err: any) {
    console.error("Dashboard API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
