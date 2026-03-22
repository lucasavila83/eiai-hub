"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  MessageSquare,
  Kanban,
  TrendingUp,
  Loader2,
  CalendarDays,
  Filter,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  none: "#94a3b8",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem",
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#ef4444", "#8b5cf6", "#06b6d4", "#eab308", "#ec4899"];

interface Stats {
  totalCards: number;
  completedCards: number;
  overdueCards: number;
  totalMessages: number;
  totalMembers: number;
  totalBoards: number;
  totalEvents: number;
  cardsByPriority: { name: string; value: number; color: string }[];
  cardsByColumn: { name: string; count: number }[];
  activityByDay: { date: string; messages: number; cards: number }[];
  boardProgress: { name: string; total: number; done: number; pct: number }[];
}

interface MemberOption {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Load org members for filter
  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("org_id", activeOrgId);
      if (data) {
        const mapped = data.map((m: any) => ({
          id: m.user_id,
          full_name: m.profiles.full_name,
          email: m.profiles.email,
          avatar_url: m.profiles.avatar_url,
        }));
        mapped.sort((a: MemberOption, b: MemberOption) =>
          (a.full_name || a.email).localeCompare(b.full_name || b.email)
        );
        setMembers(mapped);
      }
    })();
  }, [activeOrgId, supabase]);

  const loadStats = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);

    const userId = selectedMemberId;

    try {
      // If filtering by user, get their assigned card IDs first
      let userCardIds: Set<string> | null = null;
      if (userId) {
        const { data: assignments } = await supabase
          .from("card_assignees")
          .select("card_id")
          .eq("user_id", userId);
        userCardIds = new Set((assignments || []).map((a) => a.card_id));
      }

      // Build messages count query
      let messagesCountQuery = supabase
        .from("messages")
        .select("id", { count: "exact", head: true });
      if (userId) messagesCountQuery = messagesCountQuery.eq("user_id", userId);

      // Build messages recent query
      let messagesRecentQuery = supabase
        .from("messages")
        .select("id, created_at")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      if (userId) messagesRecentQuery = messagesRecentQuery.eq("user_id", userId);

      // Build cards recent query
      let cardsRecentQuery = supabase
        .from("cards")
        .select("id, created_at")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      if (userId) cardsRecentQuery = cardsRecentQuery.eq("created_by", userId);

      // Build events query
      let eventsQuery = supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", activeOrgId);
      if (userId) eventsQuery = eventsQuery.eq("created_by", userId);

      // Parallel queries
      const [
        cardsRes,
        messagesCountRes,
        membersRes,
        boardsRes,
        eventsRes,
        columnsRes,
        messagesRecentRes,
        cardsRecentRes,
      ] = await Promise.all([
        // All cards in org boards
        supabase
          .from("cards")
          .select("id, priority, due_date, completed_at, is_archived, column_id, board_id, created_at, created_by")
          .eq("is_archived", false),
        // Message count
        messagesCountQuery,
        // Org members
        supabase
          .from("org_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", activeOrgId),
        // Boards
        supabase
          .from("boards")
          .select("id, name")
          .eq("org_id", activeOrgId)
          .eq("is_archived", false),
        // Events
        eventsQuery,
        // Columns for all boards
        supabase
          .from("columns")
          .select("id, name, board_id, is_done_column"),
        // Messages last 7 days
        messagesRecentQuery,
        // Cards created last 7 days
        cardsRecentQuery,
      ]);

      const allCards = cardsRes.data || [];
      const boards = boardsRes.data || [];
      const boardIds = new Set(boards.map((b) => b.id));
      let orgCards = allCards.filter((c) => boardIds.has(c.board_id));
      const columns = columnsRes.data || [];

      // If filtering by user, only keep cards assigned to them
      if (userId && userCardIds) {
        orgCards = orgCards.filter((c) => userCardIds!.has(c.id));
      }

      const now = new Date();
      const completedCards = orgCards.filter((c) => c.completed_at).length;
      const overdueCards = orgCards.filter(
        (c) => c.due_date && new Date(c.due_date) < now && !c.completed_at
      ).length;

      // Cards by priority
      const priorityCounts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
      for (const c of orgCards) {
        priorityCounts[c.priority] = (priorityCounts[c.priority] || 0) + 1;
      }
      const cardsByPriority = Object.entries(priorityCounts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: PRIORITY_LABELS[k] || k,
          value: v,
          color: PRIORITY_COLORS[k] || "#94a3b8",
        }));

      // Cards by column (top board)
      const topBoard = boards[0];
      let cardsByColumn: { name: string; count: number }[] = [];
      if (topBoard) {
        const boardCols = columns.filter((c) => c.board_id === topBoard.id);
        cardsByColumn = boardCols.map((col) => ({
          name: col.name,
          count: orgCards.filter((c) => c.column_id === col.id).length,
        }));
      }

      // Activity by day (last 7 days)
      const recentMessages = messagesRecentRes.data || [];
      const recentCards = cardsRecentRes.data || [];
      const activityByDay: { date: string; messages: number; cards: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
        activityByDay.push({
          date: dayLabel,
          messages: recentMessages.filter((m) => m.created_at.startsWith(dateStr)).length,
          cards: recentCards.filter((c) => c.created_at.startsWith(dateStr)).length,
        });
      }

      // Board progress
      const doneColumnIds = new Set(columns.filter((c) => c.is_done_column).map((c) => c.id));
      const boardProgress = boards.map((b) => {
        const boardCards = orgCards.filter((c) => c.board_id === b.id);
        const doneCount = boardCards.filter((c) => c.completed_at || doneColumnIds.has(c.column_id)).length;
        return {
          name: b.name.length > 20 ? b.name.slice(0, 20) + "..." : b.name,
          total: boardCards.length,
          done: doneCount,
          pct: boardCards.length > 0 ? Math.round((doneCount / boardCards.length) * 100) : 0,
        };
      });

      setStats({
        totalCards: orgCards.length,
        completedCards,
        overdueCards,
        totalMessages: messagesCountRes.count || 0,
        totalMembers: membersRes.count || 0,
        totalBoards: boards.length,
        totalEvents: eventsRes.count || 0,
        cardsByPriority,
        cardsByColumn,
        activityByDay,
        boardProgress,
      });
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, supabase, selectedMemberId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completionRate =
    stats.totalCards > 0 ? Math.round((stats.completedCards / stats.totalCards) * 100) : 0;

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {selectedMemberId
                ? `Resultados de ${members.find((m) => m.id === selectedMemberId)?.full_name || "membro"}`
                : "Visão geral da organização"}
            </p>
          </div>
        </div>

        {/* Member filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedMemberId || ""}
            onChange={(e) => setSelectedMemberId(e.target.value || null)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]"
          >
            <option value="">Todos os membros</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard icon={Kanban} label="Tarefas" value={stats.totalCards} color="text-blue-500" bg="bg-blue-500/10" />
        <KPICard icon={CheckCircle2} label="Concluídas" value={stats.completedCards} color="text-green-500" bg="bg-green-500/10" />
        <KPICard icon={AlertTriangle} label="Atrasadas" value={stats.overdueCards} color="text-red-500" bg="bg-red-500/10" />
        <KPICard icon={TrendingUp} label="Conclusão" value={`${completionRate}%`} color="text-purple-500" bg="bg-purple-500/10" />
        <KPICard icon={MessageSquare} label="Mensagens" value={stats.totalMessages} color="text-cyan-500" bg="bg-cyan-500/10" />
        <KPICard icon={Users} label="Membros" value={stats.totalMembers} color="text-orange-500" bg="bg-orange-500/10" />
        <KPICard icon={CalendarDays} label="Eventos" value={stats.totalEvents} color="text-pink-500" bg="bg-pink-500/10" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity last 7 days */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Atividade nos últimos 7 dias
          </h3>
          {stats.activityByDay.some((d) => d.messages > 0 || d.cards > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.activityByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="messages"
                  name="Mensagens"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cards"
                  name="Tarefas criadas"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
              Sem atividade recente
            </div>
          )}
        </div>

        {/* Priority distribution */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            Distribuição por prioridade
          </h3>
          {stats.cardsByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.cardsByPriority}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stats.cardsByPriority.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
              Nenhuma tarefa
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cards by column (top board) */}
        {stats.cardsByColumn.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Kanban className="w-4 h-4 text-muted-foreground" />
              Tarefas por coluna
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.cardsByColumn}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Tarefas" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Board progress */}
        {stats.boardProgress.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              Progresso dos Boards
            </h3>
            <div className="space-y-4">
              {stats.boardProgress.map((bp) => (
                <div key={bp.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground font-medium truncate max-w-[200px]">
                      {bp.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {bp.done}/{bp.total} ({bp.pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        bp.pct === 100 ? "bg-green-500" : bp.pct >= 50 ? "bg-blue-500" : "bg-orange-500"
                      )}
                      style={{ width: `${bp.pct}%` }}
                    />
                  </div>
                </div>
              ))}
              {stats.boardProgress.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum board</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center text-center">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2", bg)}>
        <Icon className={cn("w-4.5 h-4.5", color)} />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
