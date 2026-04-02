"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  Loader2,
  Filter,
  Target,
  RefreshCw,
  Calendar,
  ChevronDown,
  Timer,
  Zap,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuth } from "@/components/providers/AuthProvider";
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
  LineChart,
  Line,
} from "recharts";

// ── Types ──

interface DashboardData {
  overview: {
    totalCreated: number;
    totalCompleted: number;
    completionRate: number;
    totalOpen: number;
    totalOverdue: number;
    overdueRate: number;
    avgLeadTimeDays: number;
    onTimeRate: number;
  };
  productivity: {
    byMember: MemberProductivity[];
    avgPerMember: number;
  };
  timeline: {
    createdVsCompleted: { date: string; created: number; completed: number }[];
  };
  deadlines: {
    onTime: number;
    late: number;
    noDeadline: number;
    lateByMember: { userId: string; name: string; lateCount: number; lateRate: number }[];
  };
  backlog: {
    total: number;
    avgAgeDays: number;
    stale: number;
    byPriority: { priority: string; count: number }[];
  };
  boardProgress: { boardId: string; name: string; total: number; done: number; pct: number }[];
  bpmPhaseAvg: {
    pipeId: string;
    pipeName: string;
    phases: { phaseId: string; phaseName: string; avgHours: number; cardCount: number }[];
  }[];
  goals: { userId: string; name: string; goalName: string; targetValue: number; currentValue: number; pct: number }[];
}

interface MemberProductivity {
  userId: string;
  name: string;
  avatarUrl: string | null;
  completed: number;
  overdue: number;
  open: number;
  avgTimeDays: number;
}

interface MemberOption {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface TeamOption {
  id: string;
  name: string;
}

interface BoardOption {
  id: string;
  name: string;
}

interface PipeOption {
  id: string;
  name: string;
}

// ── Constants ──

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
  none: "Sem prioridade",
};

const CHART_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ef4444", "#06b6d4", "#8b5cf6", "#eab308", "#ec4899"];

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

type TabId = "overview" | "productivity" | "goals";

const PERIOD_PRESETS = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

// ── Component ──

export default function DashboardPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const { user } = useAuth();
  const perms = usePermissions();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Filter options
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [pipes, setPipes] = useState<PipeOption[]>([]);

  // Filter values
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [selectedPipeId, setSelectedPipeId] = useState<string>("");
  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [periodDays, setPeriodDays] = useState(30);
  const [showFilters, setShowFilters] = useState(false);

  const effectiveMemberId = perms.canViewDashboardAll ? selectedMemberId : (user?.id || "");

  // Date range
  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date(Date.now() - periodDays * 86400000);
    return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
  }, [periodDays]);

  // Load filter options
  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      const [membersRes, teamsRes, boardsRes, pipesRes] = await Promise.all([
        supabase.from("org_members").select("user_id, profiles:user_id(id, full_name, email, avatar_url)").eq("org_id", activeOrgId),
        supabase.from("teams").select("id, name").eq("org_id", activeOrgId),
        supabase.from("boards").select("id, name").eq("org_id", activeOrgId).eq("is_archived", false),
        supabase.from("bpm_pipes").select("id, name").eq("org_id", activeOrgId),
      ]);

      if (membersRes.data) {
        const mapped = membersRes.data
          .filter((m: any) => m.profiles)
          .map((m: any) => ({ id: m.user_id, full_name: m.profiles?.full_name, email: m.profiles?.email || "", avatar_url: m.profiles?.avatar_url }))
          .sort((a: MemberOption, b: MemberOption) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
        setMembers(mapped);
      }
      if (teamsRes.data) setTeams(teamsRes.data);
      if (boardsRes.data) setBoards(boardsRes.data);
      if (pipesRes.data) setPipes(pipesRes.data);
    })();
  }, [activeOrgId]);

  // Load dashboard data
  const loadData = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ org_id: activeOrgId, from: dateRange.from, to: dateRange.to });
      if (effectiveMemberId) params.set("user_id", effectiveMemberId);
      if (selectedTeamId) params.set("team_id", selectedTeamId);
      if (selectedBoardId) params.set("board_id", selectedBoardId);
      if (selectedPipeId) params.set("pipe_id", selectedPipeId);
      if (selectedPriority) params.set("priority", selectedPriority);

      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, dateRange, effectiveMemberId, selectedTeamId, selectedBoardId, selectedPipeId, selectedPriority]);

  useEffect(() => { loadData(); }, [loadData]);

  if (perms.loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "overview", label: "Visão Geral", icon: BarChart3 },
    { id: "productivity", label: "Produtividade", icon: Users },
    { id: "goals", label: "Metas", icon: Target },
  ];

  const hasActiveFilters = !!(effectiveMemberId || selectedTeamId || selectedBoardId || selectedPipeId || selectedPriority);

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-auto max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {effectiveMemberId
                ? `Resultados de ${members.find((m) => m.id === effectiveMemberId)?.full_name || "membro"}`
                : "Visão geral da operação"}
              {" · "}Últimos {periodDays} dias
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-card border border-border rounded-lg overflow-hidden">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  periodDays === p.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              hasActiveFilters
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {perms.canViewDashboardAll && (
            <FilterSelect label="Responsável" value={selectedMemberId} onChange={setSelectedMemberId}
              options={members.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
          )}
          <FilterSelect label="Equipe" value={selectedTeamId} onChange={setSelectedTeamId}
            options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          <FilterSelect label="Board" value={selectedBoardId} onChange={setSelectedBoardId}
            options={boards.map((b) => ({ value: b.id, label: b.name }))} />
          <FilterSelect label="Processo" value={selectedPipeId} onChange={setSelectedPipeId}
            options={pipes.map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Prioridade" value={selectedPriority} onChange={setSelectedPriority}
            options={Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          {hasActiveFilters && (
            <button
              onClick={() => { setSelectedMemberId(""); setSelectedTeamId(""); setSelectedBoardId(""); setSelectedPipeId(""); setSelectedPriority(""); }}
              className="col-span-full text-xs text-primary hover:underline self-end"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading || !data ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && <OverviewTab data={data} />}
          {activeTab === "productivity" && <ProductivityTab data={data} />}
          {activeTab === "goals" && <GoalsTab data={data} />}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: Visão Geral
// ══════════════════════════════════════════════

function OverviewTab({ data }: { data: DashboardData }) {
  const { overview, timeline, deadlines, backlog, boardProgress } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Zap} label="Criadas" value={overview.totalCreated} color="text-blue-500" bg="bg-blue-500/10" />
        <KPICard icon={CheckCircle2} label="Concluídas" value={overview.totalCompleted} color="text-green-500" bg="bg-green-500/10"
          sub={`${overview.completionRate}% taxa de conclusão`} />
        <KPICard icon={AlertTriangle} label="Atrasadas" value={overview.totalOverdue} color="text-red-500" bg="bg-red-500/10"
          sub={`${overview.overdueRate}% das abertas`} alert={overview.overdueRate > 20} />
        <KPICard icon={Timer} label="Lead Time Médio" value={`${overview.avgLeadTimeDays}d`} color="text-purple-500" bg="bg-purple-500/10"
          sub={`${overview.onTimeRate}% no prazo`} />
      </div>

      {/* Alerts */}
      <Alerts data={data} />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline: created vs completed */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Criadas vs Concluídas
          </h3>
          {timeline.createdVsCompleted.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={timeline.createdVsCompleted}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => { const d = new Date(v + "T12:00:00"); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR")} />
                <Area type="monotone" dataKey="created" name="Criadas" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="completed" name="Concluídas" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Deadline pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Prazo
          </h3>
          {(deadlines.onTime + deadlines.late) > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={[
                    { name: "No prazo", value: deadlines.onTime, fill: "#22c55e" },
                    { name: "Atrasadas", value: deadlines.late, fill: "#ef4444" },
                    ...(deadlines.noDeadline > 0 ? [{ name: "Sem prazo", value: deadlines.noDeadline, fill: "#94a3b8" }] : []),
                  ]}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                  {deadlines.noDeadline > 0 && <Cell fill="#94a3b8" />}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backlog by priority */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Archive className="w-4 h-4 text-muted-foreground" />
            Backlog ({backlog.total} abertas · idade média {backlog.avgAgeDays}d)
          </h3>
          <div className="flex items-center gap-4 mb-4">
            {backlog.stale > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-500 font-medium">
                {backlog.stale} paradas há 7+ dias
              </span>
            )}
          </div>
          {backlog.byPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={backlog.byPriority} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={80}
                  tickFormatter={(v) => PRIORITY_LABELS[v] || v} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Tarefas" radius={[0, 4, 4, 0]}>
                  {backlog.byPriority.map((entry, idx) => (
                    <Cell key={idx} fill={PRIORITY_COLORS[entry.priority] || "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Board progress */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Progresso dos Boards
          </h3>
          <div className="space-y-4 max-h-[240px] overflow-y-auto">
            {boardProgress.length > 0 ? boardProgress.map((bp) => (
              <div key={bp.boardId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground font-medium truncate max-w-[200px]">{bp.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{bp.done}/{bp.total} ({bp.pct}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500",
                      bp.pct === 100 ? "bg-green-500" : bp.pct >= 50 ? "bg-blue-500" : "bg-orange-500")}
                    style={{ width: `${bp.pct}%` }}
                  />
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground text-center py-4">Nenhum board</p>}
          </div>
        </div>
      </div>

      {/* BPM Phase Times */}
      {data.bpmPhaseAvg.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4 text-muted-foreground" />
            Tempo Médio por Fase (BPM)
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.bpmPhaseAvg.map((pipe) => (
              <div key={pipe.pipeId}>
                <p className="text-xs font-medium text-muted-foreground mb-3">{pipe.pipeName}</p>
                <ResponsiveContainer width="100%" height={Math.max(120, pipe.phases.length * 40)}>
                  <BarChart data={pipe.phases} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => v >= 24 ? `${Math.round(v / 24)}d` : `${Math.round(v)}h`} />
                    <YAxis type="category" dataKey="phaseName" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => [v >= 24 ? `${(v / 24).toFixed(1)} dias` : `${v.toFixed(1)} horas`, "Tempo médio"]} />
                    <Bar dataKey="avgHours" name="Tempo médio" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: Produtividade
// ══════════════════════════════════════════════

function ProductivityTab({ data }: { data: DashboardData }) {
  const { productivity, deadlines } = data;
  const sorted = [...productivity.byMember].sort((a, b) => b.completed - a.completed);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPICard icon={Users} label="Colaboradores" value={productivity.byMember.length} color="text-blue-500" bg="bg-blue-500/10" />
        <KPICard icon={TrendingUp} label="Média por pessoa" value={productivity.avgPerMember} color="text-green-500" bg="bg-green-500/10"
          sub="tarefas concluídas" />
        <KPICard icon={AlertTriangle} label="Total atrasadas" value={deadlines.late} color="text-red-500" bg="bg-red-500/10" />
      </div>

      {/* Ranking chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          Ranking de Produtividade
        </h3>
        {sorted.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 45)}>
            <BarChart data={sorted} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="completed" name="Concluídas" fill="#22c55e" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="overdue" name="Atrasadas" fill="#ef4444" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="open" name="Em aberto" fill="#6366f1" radius={[0, 4, 4, 0]} stackId="a" />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </div>

      {/* Member table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Detalhamento por Colaborador
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Colaborador</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground">Concluídas</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground">Atrasadas</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground">Em aberto</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground">Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 flex items-center gap-2">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                        {m.name?.charAt(0) || "?"}
                      </div>
                    )}
                    <span className="font-medium text-foreground">{m.name}</span>
                  </td>
                  <td className="text-center px-3 py-3 text-green-500 font-medium">{m.completed}</td>
                  <td className="text-center px-3 py-3">
                    <span className={cn("font-medium", m.overdue > 0 ? "text-red-500" : "text-muted-foreground")}>{m.overdue}</span>
                  </td>
                  <td className="text-center px-3 py-3 text-foreground">{m.open}</td>
                  <td className="text-center px-3 py-3 text-muted-foreground">{m.avgTimeDays}d</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum dado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Late ranking */}
      {deadlines.lateByMember.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Ranking de Atraso
          </h3>
          <div className="space-y-3">
            {deadlines.lateByMember.map((m, i) => (
              <div key={m.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground font-mono">{i + 1}.</span>
                  <span className="text-sm text-foreground">{m.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-red-500">{m.lateCount} atrasadas</span>
                  <span className="text-xs text-muted-foreground">({m.lateRate}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: Metas
// ══════════════════════════════════════════════

function GoalsTab({ data }: { data: DashboardData }) {
  const { goals } = data;

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Target className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhuma meta definida</p>
        <a href="/goals" className="text-sm text-primary hover:underline">Ir para Metas</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Goal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g, i) => {
          const pct = Math.min(g.pct, 100);
          const isGood = pct >= 80;
          const isWarning = pct >= 50 && pct < 80;
          const isDanger = pct < 50;
          return (
            <div key={i} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.goalName}</p>
                </div>
                <span className={cn(
                  "text-lg font-bold",
                  isGood ? "text-green-500" : isWarning ? "text-orange-500" : "text-red-500"
                )}>
                  {g.pct}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={cn("h-full rounded-full transition-all duration-500",
                    isGood ? "bg-green-500" : isWarning ? "bg-orange-500" : "bg-red-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Realizado: {g.currentValue}</span>
                <span>Meta: {g.targetValue}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════

function Alerts({ data }: { data: DashboardData }) {
  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  const { overview, backlog } = data;

  if (overview.overdueRate > 20) {
    alerts.push({ type: "danger", message: `${overview.overdueRate}% das tarefas abertas estão atrasadas` });
  }
  if (backlog.stale > 3) {
    alerts.push({ type: "warning", message: `${backlog.stale} tarefas paradas há mais de 7 dias` });
  }
  if (overview.completionRate < 30 && overview.totalCreated > 5) {
    alerts.push({ type: "warning", message: `Taxa de conclusão baixa: ${overview.completionRate}%` });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
          a.type === "danger" ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
        )}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {a.message}
        </div>
      ))}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, bg, sub, alert }: {
  icon: any; label: string; value: string | number; color: string; bg: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={cn("bg-card border rounded-xl p-4", alert ? "border-red-500/30" : "border-border")}>
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg)}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
      >
        <option value="">Todos</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
      Sem dados para exibir
    </div>
  );
}
