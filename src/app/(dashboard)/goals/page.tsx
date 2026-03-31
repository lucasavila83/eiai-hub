"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  Target, Plus, Trash2, Loader2, DollarSign, TrendingUp,
  Users, Calendar, AlertTriangle, CheckCircle2, Building2,
  FolderTree, Pencil, X, Check, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

/* ─── Types ─── */
interface BudgetGoal {
  id: string;
  org_id: string;
  department_id: string | null;
  category_id: string | null;
  year_month: string;
  limit_amount: number;
  alert_percent: number;
  department?: { id: string; descricao: string } | null;
  category?: { id: string; codigo: string; descricao: string; tipo: string } | null;
}

interface MemberGoal {
  id: string;
  org_id: string;
  user_id: string;
  goal_type: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  year_month: string;
  profiles?: { full_name: string | null; email: string; avatar_url: string | null };
}

interface OmieCategory {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
}

interface OmieDepartment {
  id: string;
  omie_id: string;
  codigo: string;
  descricao: string;
}

const GOAL_TYPES = [
  { value: "tasks_completed", label: "Tarefas concluídas" },
  { value: "sla_met", label: "SLA cumprido (%)" },
  { value: "avg_time", label: "Tempo médio (horas)" },
  { value: "custom", label: "Personalizado" },
];

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function GoalsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [tab, setTab] = useState<"budget" | "members">("budget");
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [budgetGoals, setBudgetGoals] = useState<BudgetGoal[]>([]);
  const [memberGoals, setMemberGoals] = useState<MemberGoal[]>([]);
  const [categories, setCategories] = useState<OmieCategory[]>([]);
  const [departments, setDepartments] = useState<OmieDepartment[]>([]);
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form state - budget
  const [addDeptId, setAddDeptId] = useState("");
  const [addCatId, setAddCatId] = useState("");
  const [addLimit, setAddLimit] = useState("");
  const [addAlert, setAddAlert] = useState("80");

  // Add form state - member
  const [addUserId, setAddUserId] = useState("");
  const [addGoalType, setAddGoalType] = useState("tasks_completed");
  const [addGoalName, setAddGoalName] = useState("");
  const [addTarget, setAddTarget] = useState("");

  const loadData = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);

    try {
      const [budgetRes, memberRes, catRes, deptRes, membRes] = await Promise.all([
        fetch(`/api/goals?org_id=${activeOrgId}&type=budget&year_month=${yearMonth}`),
        fetch(`/api/goals?org_id=${activeOrgId}&type=member&year_month=${yearMonth}`),
        fetch(`/api/omie/sync?org_id=${activeOrgId}&type=categories`),
        fetch(`/api/omie/sync?org_id=${activeOrgId}&type=departments`),
        supabase
          .from("org_members")
          .select("user_id, profiles(full_name, email)")
          .eq("org_id", activeOrgId),
      ]);

      const [budget, member, cats, depts] = await Promise.all([
        budgetRes.json(),
        memberRes.json(),
        catRes.json(),
        deptRes.json(),
      ]);

      setBudgetGoals(Array.isArray(budget) ? budget : []);
      setMemberGoals(Array.isArray(member) ? member : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setMembers(
        (membRes.data || []).map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name,
          email: m.profiles?.email,
        }))
      );
    } catch (e) {
      console.error("Erro ao carregar metas:", e);
    }
    setLoading(false);
  }, [activeOrgId, yearMonth, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!addLimit || !activeOrgId) return;
    setSaving(true);

    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "budget",
        org_id: activeOrgId,
        department_id: addDeptId || null,
        category_id: addCatId || null,
        year_month: yearMonth,
        limit_amount: parseFloat(addLimit),
        alert_percent: parseInt(addAlert) || 80,
      }),
    });

    setAddDeptId("");
    setAddCatId("");
    setAddLimit("");
    setAddAlert("80");
    setShowAdd(false);
    setSaving(false);
    loadData();
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addUserId || !addTarget || !activeOrgId) return;
    setSaving(true);

    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "member",
        org_id: activeOrgId,
        user_id: addUserId,
        goal_type: addGoalType,
        goal_name: addGoalName || GOAL_TYPES.find((t) => t.value === addGoalType)?.label || addGoalType,
        target_value: parseFloat(addTarget),
        year_month: yearMonth,
      }),
    });

    setAddUserId("");
    setAddGoalType("tasks_completed");
    setAddGoalName("");
    setAddTarget("");
    setShowAdd(false);
    setSaving(false);
    loadData();
  }

  async function handleDelete(id: string, type: "budget" | "member") {
    if (!confirm("Tem certeza que deseja remover esta meta?")) return;
    await fetch(`/api/goals?id=${id}&type=${type}`, { method: "DELETE" });
    loadData();
  }

  // Month navigation
  function changeMonth(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Summary stats
  const totalBudget = budgetGoals.reduce((s, g) => s + Number(g.limit_amount), 0);
  const memberGoalsMet = memberGoals.filter((g) => Number(g.current_value) >= Number(g.target_value)).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Metas</h1>
              <p className="text-xs text-muted-foreground">Orçamentos por departamento/categoria e KPIs individuais</p>
            </div>
          </div>

          {/* Month picker */}
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground">
              ←
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{formatYearMonth(yearMonth)}</span>
            </div>
            <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground">
              →
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Orçamento total</span>
            </div>
            <p className="text-lg font-bold text-foreground">R$ {totalBudget.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Metas orçamentárias</span>
            </div>
            <p className="text-lg font-bold text-foreground">{budgetGoals.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-violet-500" />
              <span className="text-xs text-muted-foreground">KPIs atingidos</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {memberGoalsMet}/{memberGoals.length}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {[
            { key: "budget" as const, label: "Orçamento", icon: DollarSign },
            { key: "members" as const, label: "KPIs Individuais", icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setShowAdd(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ─── Budget Goals Tab ─── */}
            {tab === "budget" && (
              <div className="space-y-3">
                {budgetGoals.length === 0 && !showAdd && (
                  <div className="text-center py-16">
                    <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhuma meta orçamentária para {formatYearMonth(yearMonth)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Defina limites por departamento e categoria</p>
                  </div>
                )}

                {budgetGoals.map((goal) => {
                  const pct = 0; // TODO: integrate with actual spend from OMIE
                  const isOver = pct >= 100;
                  const isAlert = pct >= (goal.alert_percent || 80);
                  return (
                    <div key={goal.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {goal.department && (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                              <Building2 className="w-3 h-3" />
                              {goal.department.descricao}
                            </span>
                          )}
                          {goal.category && (
                            <span className="inline-flex items-center gap-1 text-xs bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full">
                              <FolderTree className="w-3 h-3" />
                              {goal.category.codigo} — {goal.category.descricao}
                            </span>
                          )}
                          {!goal.department && !goal.category && (
                            <span className="text-xs text-muted-foreground">Geral (sem filtro)</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(goal.id, "budget")}
                          className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold text-foreground">
                          R$ {Number(goal.limit_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-muted-foreground">Alerta em {goal.alert_percent}%</span>
                      </div>
                      {/* Progress bar placeholder */}
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isOver ? "bg-destructive" : isAlert ? "bg-yellow-500" : "bg-green-500"
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {pct === 0 ? "Sem dados de gasto — integre com OMIE para visualizar" : `${pct.toFixed(1)}% utilizado`}
                      </p>
                    </div>
                  );
                })}

                {/* Add budget goal form */}
                {showAdd && tab === "budget" && (
                  <form onSubmit={handleAddBudget} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Nova meta orçamentária</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Departamento (opcional)</label>
                        <select
                          value={addDeptId}
                          onChange={(e) => setAddDeptId(e.target.value)}
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                        >
                          <option value="">Todos</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.descricao}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria (opcional)</label>
                        <select
                          value={addCatId}
                          onChange={(e) => setAddCatId(e.target.value)}
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                        >
                          <option value="">Todas</option>
                          {categories.filter((c) => c.tipo === "despesa").map((c) => (
                            <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Limite (R$)</label>
                        <input
                          type="number"
                          value={addLimit}
                          onChange={(e) => setAddLimit(e.target.value)}
                          placeholder="10000.00"
                          step="0.01"
                          min="0"
                          required
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Alertar em (%)</label>
                        <input
                          type="number"
                          value={addAlert}
                          onChange={(e) => setAddAlert(e.target.value)}
                          placeholder="80"
                          min="1"
                          max="100"
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer">
                        Cancelar
                      </button>
                      <button type="submit" disabled={saving || !addLimit} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer">
                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Adicionar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ─── Member Goals Tab ─── */}
            {tab === "members" && (
              <div className="space-y-3">
                {memberGoals.length === 0 && !showAdd && (
                  <div className="text-center py-16">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum KPI definido para {formatYearMonth(yearMonth)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Defina metas individuais por membro</p>
                  </div>
                )}

                {memberGoals.map((goal) => {
                  const pct = Number(goal.target_value) > 0
                    ? (Number(goal.current_value) / Number(goal.target_value)) * 100
                    : 0;
                  const isMet = pct >= 100;
                  return (
                    <div key={goal.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {(goal.profiles?.full_name || goal.profiles?.email || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{goal.profiles?.full_name || goal.profiles?.email}</p>
                            <p className="text-[10px] text-muted-foreground">{goal.goal_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isMet && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          <button
                            onClick={() => handleDelete(goal.id, "member")}
                            className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground font-bold">{Number(goal.current_value)} / {Number(goal.target_value)}</span>
                        <span className={cn("text-xs font-medium", isMet ? "text-green-500" : "text-muted-foreground")}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", isMet ? "bg-green-500" : "bg-primary")}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Add member goal form */}
                {showAdd && tab === "members" && (
                  <form onSubmit={handleAddMember} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Novo KPI individual</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Membro</label>
                        <select
                          value={addUserId}
                          onChange={(e) => setAddUserId(e.target.value)}
                          required
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                        >
                          <option value="">Selecionar...</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de meta</label>
                        <select
                          value={addGoalType}
                          onChange={(e) => setAddGoalType(e.target.value)}
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                        >
                          {GOAL_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da meta</label>
                        <input
                          value={addGoalName}
                          onChange={(e) => setAddGoalName(e.target.value)}
                          placeholder="Ex: Fechar 10 vendas"
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Meta (valor alvo)</label>
                        <input
                          type="number"
                          value={addTarget}
                          onChange={(e) => setAddTarget(e.target.value)}
                          placeholder="10"
                          min="0"
                          step="0.01"
                          required
                          className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer">
                        Cancelar
                      </button>
                      <button type="submit" disabled={saving || !addUserId || !addTarget} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer">
                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Adicionar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* FAB add button */}
            {!showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer z-50"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
