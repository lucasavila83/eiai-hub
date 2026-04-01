"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { usePermissions } from "@/lib/hooks/usePermissions";
import {
  Target, Plus, Trash2, Loader2, DollarSign, Users, Calendar,
  ChevronLeft, ChevronRight, Save, X, Pencil, Eye, EyeOff,
  Building2, FolderTree, TrendingUp, BarChart3, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

/* ─── Constants ─── */
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

const GOAL_TYPE_OPTIONS = [
  { value: "amount", label: "Valor (R$)" },
  { value: "quantity", label: "Quantidade" },
  { value: "percentage", label: "Percentual (%)" },
];

const MEMBER_GOAL_TYPES = [
  { value: "tasks_completed", label: "Tarefas concluídas" },
  { value: "sla_met", label: "SLA cumprido (%)" },
  { value: "revenue", label: "Faturamento (R$)" },
  { value: "custom", label: "Personalizado" },
];

/* ─── Types ─── */
interface BudgetGoal {
  id: string;
  org_id: string;
  name: string | null;
  department_id: string | null;
  category_id: string | null;
  goal_type: string;
  year: number | null;
  values_by_month: Record<string, number>;
  allowed_viewers: string[];
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
  year: number | null;
  values_by_month: Record<string, number>;
  actuals_by_month: Record<string, number>;
  profile?: { id: string; full_name: string | null; email: string; avatar_url: string | null } | null;
}

interface OrgMember {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
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

/* ─── Helpers ─── */
function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sumValues(obj: Record<string, number>) {
  return Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
}

/* ─── Page ─── */
export default function GoalsPage() {
  const { activeOrgId } = useUIStore();
  const perms = usePermissions();

  const [tab, setTab] = useState<"budget" | "members">("budget");
  const [year, setYear] = useState(new Date().getFullYear());
  const [budgetGoals, setBudgetGoals] = useState<BudgetGoal[]>([]);
  const [memberGoals, setMemberGoals] = useState<MemberGoal[]>([]);
  const [categories, setCategories] = useState<OmieCategory[]>([]);
  const [departments, setDepartments] = useState<OmieDepartment[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [omieConfigs, setOmieConfigs] = useState<{ id: string; company_name: string; app_key: string }[]>([]);
  const [selectedOmieKey, setSelectedOmieKey] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ goalId: string; month: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDeptId, setAddDeptId] = useState("");
  const [addCatId, setAddCatId] = useState("");
  const [addGoalType, setAddGoalType] = useState("amount");
  const [addViewers, setAddViewers] = useState<string[]>([]);
  // Member goal add
  const [addUserId, setAddUserId] = useState("");
  const [addMemberGoalType, setAddMemberGoalType] = useState("tasks_completed");
  const [addGoalName, setAddGoalName] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  // Viewers modal
  const [viewersGoalId, setViewersGoalId] = useState<string | null>(null);
  const [viewersList, setViewersList] = useState<string[]>([]);

  /* ─── Load OMIE configs once ─── */
  useEffect(() => {
    if (!activeOrgId) return;
    fetch(`/api/omie/sync?org_id=${activeOrgId}&type=configs`)
      .then((r) => r.json())
      .then((data) => {
        const configs = Array.isArray(data) ? data : [];
        setOmieConfigs(configs);
        // Auto-select first config (Hannah) if none selected
        if (configs.length > 0 && !selectedOmieKey) {
          setSelectedOmieKey(configs[0].app_key);
        }
      });
  }, [activeOrgId]);

  /* ─── Data loading ─── */
  const loadData = useCallback(async () => {
    if (!activeOrgId || !selectedOmieKey) return;
    setLoading(true);
    try {
      const keyParam = `&omie_key=${selectedOmieKey}`;
      const [budgetRes, memberRes, catRes, deptRes, membRes] = await Promise.all([
        fetch(`/api/goals?org_id=${activeOrgId}&type=budget&year=${year}`),
        fetch(`/api/goals?org_id=${activeOrgId}&type=member&year=${year}`),
        fetch(`/api/omie/sync?org_id=${activeOrgId}&type=categories${keyParam}`),
        fetch(`/api/omie/sync?org_id=${activeOrgId}&type=departments${keyParam}`),
        fetch(`/api/goals/members?org_id=${activeOrgId}`),
      ]);
      const [budget, member, cats, depts, memb] = await Promise.all([
        budgetRes.json(), memberRes.json(), catRes.json(), deptRes.json(), membRes.json(),
      ]);
      setBudgetGoals(Array.isArray(budget) ? budget : []);
      setMemberGoals(Array.isArray(member) ? member : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setMembers(Array.isArray(memb) ? memb : []);
    } catch (e) {
      console.error("Erro ao carregar metas:", e);
    }
    setLoading(false);
  }, [activeOrgId, year, selectedOmieKey]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editingCell && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingCell]);

  /* ─── Cell editing (inline) ─── */
  function startEdit(goalId: string, month: string, currentValue: number) {
    setEditingCell({ goalId, month });
    setEditValue(currentValue ? String(currentValue) : "");
  }

  async function saveCell() {
    if (!editingCell) return;
    const { goalId, month } = editingCell;
    const numVal = parseFloat(editValue) || 0;

    // Determine which tab
    if (tab === "budget") {
      const goal = budgetGoals.find((g) => g.id === goalId);
      if (!goal) return;
      const newValues = { ...goal.values_by_month, [month]: numVal };
      // Optimistic update
      setBudgetGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, values_by_month: newValues } : g));
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goalId, type: "budget", values_by_month: newValues }),
      });
    } else {
      const goal = memberGoals.find((g) => g.id === goalId);
      if (!goal) return;
      const newValues = { ...goal.values_by_month, [month]: numVal };
      setMemberGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, values_by_month: newValues } : g));
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goalId, type: "member", values_by_month: newValues }),
      });
    }
    setEditingCell(null);
  }

  async function saveActualCell(goalId: string, month: string) {
    const numVal = parseFloat(editValue) || 0;
    const goal = memberGoals.find((g) => g.id === goalId);
    if (!goal) return;
    const newActuals = { ...goal.actuals_by_month, [month]: numVal };
    setMemberGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, actuals_by_month: newActuals } : g));
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goalId, type: "member", actuals_by_month: newActuals }),
    });
    setEditingCell(null);
  }

  function handleCellKeyDown(e: React.KeyboardEvent, isActual?: boolean, goalId?: string, month?: string) {
    if (e.key === "Enter") {
      if (isActual && goalId && month) saveActualCell(goalId, month);
      else saveCell();
    }
    if (e.key === "Escape") setEditingCell(null);
  }

  /* ─── Add goal ─── */
  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "budget",
        org_id: activeOrgId,
        name: addName || null,
        department_id: addDeptId || null,
        category_id: addCatId || null,
        goal_type: addGoalType,
        year,
        values_by_month: {},
        allowed_viewers: addViewers,
      }),
    });
    resetAddForm();
    loadData();
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrgId || !addUserId) return;
    setSaving(true);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "member",
        org_id: activeOrgId,
        user_id: addUserId,
        goal_type: addMemberGoalType,
        goal_name: addGoalName || MEMBER_GOAL_TYPES.find((t) => t.value === addMemberGoalType)?.label || addMemberGoalType,
        year,
        values_by_month: {},
        actuals_by_month: {},
      }),
    });
    resetAddForm();
    loadData();
  }

  function resetAddForm() {
    setShowAdd(false);
    setEditingGoalId(null);
    setAddName("");
    setAddDeptId("");
    setAddCatId("");
    setAddGoalType("amount");
    setAddViewers([]);
    setAddUserId("");
    setAddMemberGoalType("tasks_completed");
    setAddGoalName("");
    setSaving(false);
  }

  async function handleDelete(id: string, type: "budget" | "member") {
    if (!confirm("Tem certeza que deseja remover esta meta?")) return;
    await fetch(`/api/goals?id=${id}&type=${type}`, { method: "DELETE" });
    loadData();
  }

  function openEditBudget(goal: BudgetGoal) {
    setEditingGoalId(goal.id);
    setAddName(goal.name || "");
    setAddDeptId(goal.department_id || "");
    setAddCatId(goal.category_id || "");
    setAddGoalType(goal.goal_type || "amount");
    setAddViewers(goal.allowed_viewers || []);
    setShowAdd(true);
  }

  function openEditMember(goal: MemberGoal) {
    setEditingGoalId(goal.id);
    setAddUserId(goal.user_id);
    setAddMemberGoalType(goal.goal_type);
    setAddGoalName(goal.goal_name || "");
    setShowAdd(true);
  }

  async function handleEditBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGoalId) return;
    setSaving(true);
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingGoalId,
        type: "budget",
        name: addName || null,
        department_id: addDeptId || null,
        category_id: addCatId || null,
        goal_type: addGoalType,
        allowed_viewers: addViewers,
      }),
    });
    resetAddForm();
    setEditingGoalId(null);
    loadData();
  }

  async function handleEditMember(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGoalId) return;
    setSaving(true);
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingGoalId,
        type: "member",
        user_id: addUserId,
        goal_type: addMemberGoalType,
        goal_name: addGoalName || MEMBER_GOAL_TYPES.find((t) => t.value === addMemberGoalType)?.label || addMemberGoalType,
      }),
    });
    resetAddForm();
    setEditingGoalId(null);
    loadData();
  }

  /* ─── Viewers ─── */
  async function saveViewers() {
    if (!viewersGoalId) return;
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: viewersGoalId, type: "budget", allowed_viewers: viewersList }),
    });
    setBudgetGoals((prev) => prev.map((g) => g.id === viewersGoalId ? { ...g, allowed_viewers: viewersList } : g));
    setViewersGoalId(null);
  }

  /* ─── Summary ─── */
  const totalBudgetAnual = budgetGoals.reduce((s, g) => s + sumValues(g.values_by_month || {}), 0);
  const totalMemberGoals = memberGoals.length;
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  /* ─── Render helpers ─── */
  function renderCellValue(value: number, goalType: string) {
    if (!value) return "—";
    if (goalType === "amount") return formatCurrency(value);
    if (goalType === "percentage") return `${value}%`;
    return String(value);
  }

  function getGoalLabel(g: BudgetGoal) {
    const parts: string[] = [];
    if (g.name) parts.push(g.name);
    if (g.department) parts.push(g.department.descricao);
    if (g.category) parts.push(`${g.category.codigo} — ${g.category.descricao}`);
    return parts.length > 0 ? parts.join(" · ") : "Meta geral";
  }

  const canEdit = perms.isAdmin || perms.budget_goals.edit;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Metas</h1>
              <p className="text-xs text-muted-foreground">Orçamentos e KPIs — tabela mensal por ano</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Company picker */}
            {omieConfigs.length > 1 && (
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={selectedOmieKey}
                  onChange={(e) => setSelectedOmieKey(e.target.value)}
                  className="text-sm bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground cursor-pointer"
                >
                  {omieConfigs.map((c) => (
                    <option key={c.app_key} value={c.app_key}>{c.company_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Year picker */}
            <div className="flex items-center gap-2">
              <button onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-4 py-1.5 bg-muted rounded-lg min-w-[80px] justify-center">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">{year}</span>
              </div>
              <button onClick={() => setYear((y) => y + 1)} className="p-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Total anual (orçamento)</span>
            </div>
            <p className="text-lg font-bold text-foreground">R$ {formatCurrency(totalBudgetAnual)}</p>
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
              <span className="text-xs text-muted-foreground">KPIs individuais</span>
            </div>
            <p className="text-lg font-bold text-foreground">{totalMemberGoals}</p>
          </div>
        </div>

        {/* Tabs + Add button */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {([
              { key: "budget" as const, label: "Orçamento", icon: DollarSign },
              { key: "members" as const, label: "KPIs Individuais", icon: Users },
            ]).map(({ key, label, icon: Icon }) => (
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
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova meta
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ─── Budget Goals Table ─── */}
            {tab === "budget" && (
              <>
                {budgetGoals.length === 0 ? (
                  <div className="text-center py-16">
                    <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhuma meta orçamentária para {year}</p>
                    {canEdit && <p className="text-xs text-muted-foreground mt-1">Clique em "Nova meta" para começar</p>}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground min-w-[200px] sticky left-0 bg-background z-10">Meta</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground w-[70px]">Tipo</th>
                          {MONTHS.map((m, i) => (
                            <th
                              key={m}
                              className={cn(
                                "text-right py-2 px-2 text-xs font-semibold min-w-[90px]",
                                MONTH_KEYS[i] === currentMonth && year === new Date().getFullYear()
                                  ? "text-primary bg-primary/5"
                                  : "text-muted-foreground"
                              )}
                            >
                              {m}
                            </th>
                          ))}
                          <th className="text-right py-2 px-3 text-xs font-bold text-foreground min-w-[100px]">Total</th>
                          {canEdit && <th className="w-[80px]"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {budgetGoals.map((goal) => {
                          const vals = goal.values_by_month || {};
                          const total = sumValues(vals);
                          const typeLabel = GOAL_TYPE_OPTIONS.find((t) => t.value === goal.goal_type)?.label || "R$";
                          return (
                            <tr key={goal.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors group">
                              <td className="py-2 px-3 sticky left-0 bg-background z-10 group-hover:bg-accent/30">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground text-sm">{getGoalLabel(goal)}</span>
                                  {(goal.allowed_viewers?.length || 0) > 0 && (
                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded" title={`${goal.allowed_viewers.length} visualizadores`}>
                                      <Eye className="w-3 h-3 inline" /> {goal.allowed_viewers.length}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-xs text-muted-foreground">{typeLabel}</td>
                              {MONTH_KEYS.map((mk, i) => {
                                const val = vals[mk] || 0;
                                const isEditing = editingCell?.goalId === goal.id && editingCell?.month === mk;
                                const isCurrent = mk === currentMonth && year === new Date().getFullYear();
                                return (
                                  <td
                                    key={mk}
                                    className={cn(
                                      "py-1 px-1 text-right",
                                      isCurrent && "bg-primary/5",
                                      canEdit && "cursor-pointer hover:bg-accent/50"
                                    )}
                                    onClick={() => canEdit && !isEditing && startEdit(goal.id, mk, val)}
                                  >
                                    {isEditing ? (
                                      <input
                                        ref={editRef}
                                        type="number"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={saveCell}
                                        onKeyDown={(e) => handleCellKeyDown(e)}
                                        step="0.01"
                                        className="w-full px-1 py-0.5 bg-background border border-primary rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    ) : (
                                      <span className={cn("text-xs", val ? "text-foreground" : "text-muted-foreground/40")}>
                                        {renderCellValue(val, goal.goal_type)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-3 text-right">
                                <span className="text-xs font-bold text-foreground">{renderCellValue(total, goal.goal_type)}</span>
                              </td>
                              {canEdit && (
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => openEditBudget(goal)}
                                      className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                                      title="Editar"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                    </button>
                                    <button
                                      onClick={() => { setViewersGoalId(goal.id); setViewersList(goal.allowed_viewers || []); }}
                                      className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                                      title="Gerenciar visualizadores"
                                    >
                                      <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(goal.id, "budget")}
                                      className="p-1 rounded hover:bg-destructive/10 transition-colors cursor-pointer"
                                      title="Remover"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ─── Member Goals Table ─── */}
            {tab === "members" && (
              <>
                {memberGoals.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum KPI definido para {year}</p>
                    {canEdit && <p className="text-xs text-muted-foreground mt-1">Clique em "Nova meta" para começar</p>}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {memberGoals.map((goal) => {
                      const vals = goal.values_by_month || {};
                      const actuals = goal.actuals_by_month || {};
                      const totalTarget = sumValues(vals);
                      const totalActual = sumValues(actuals);
                      const pct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

                      return (
                        <div key={goal.id} className="bg-card border border-border rounded-xl overflow-hidden">
                          {/* Goal header */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {(goal.profile?.full_name || goal.profile?.email || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{goal.profile?.full_name || goal.profile?.email || "—"}</p>
                                <p className="text-[11px] text-muted-foreground">{goal.goal_name} · {MEMBER_GOAL_TYPES.find((t) => t.value === goal.goal_type)?.label || goal.goal_type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className={cn("text-sm font-bold", pct >= 100 ? "text-green-500" : "text-foreground")}>{pct}%</p>
                                <p className="text-[10px] text-muted-foreground">{totalActual} / {totalTarget}</p>
                              </div>
                              {canEdit && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditMember(goal)}
                                    className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                                    title="Editar"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(goal.id, "member")}
                                    className="p-1 rounded hover:bg-destructive/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Monthly table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/50">
                                  <th className="text-left py-1.5 px-3 text-[10px] font-semibold text-muted-foreground w-[80px]"></th>
                                  {MONTHS.map((m, i) => (
                                    <th
                                      key={m}
                                      className={cn(
                                        "text-right py-1.5 px-2 text-[10px] font-semibold min-w-[70px]",
                                        MONTH_KEYS[i] === currentMonth && year === new Date().getFullYear()
                                          ? "text-primary bg-primary/5"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {m}
                                    </th>
                                  ))}
                                  <th className="text-right py-1.5 px-3 text-[10px] font-bold text-foreground min-w-[70px]">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Meta row */}
                                <tr className="border-b border-border/30">
                                  <td className="py-1.5 px-3 text-[11px] font-medium text-muted-foreground">Meta</td>
                                  {MONTH_KEYS.map((mk, i) => {
                                    const val = vals[mk] || 0;
                                    const isEditing = editingCell?.goalId === goal.id && editingCell?.month === `target-${mk}`;
                                    const isCurrent = mk === currentMonth && year === new Date().getFullYear();
                                    return (
                                      <td
                                        key={mk}
                                        className={cn("py-1 px-1 text-right", isCurrent && "bg-primary/5", canEdit && "cursor-pointer hover:bg-accent/50")}
                                        onClick={() => canEdit && !isEditing && (() => { setEditingCell({ goalId: goal.id, month: `target-${mk}` }); setEditValue(val ? String(val) : ""); })()}
                                      >
                                        {isEditing ? (
                                          <input
                                            ref={editRef}
                                            type="number"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => {
                                              const numVal = parseFloat(editValue) || 0;
                                              const newVals = { ...vals, [mk]: numVal };
                                              setMemberGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, values_by_month: newVals } : g));
                                              fetch("/api/goals", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ id: goal.id, type: "member", values_by_month: newVals }),
                                              });
                                              setEditingCell(null);
                                            }}
                                            onKeyDown={(e) => { if (e.key === "Escape") setEditingCell(null); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                            step="0.01"
                                            className="w-full px-1 py-0.5 bg-background border border-primary rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                          />
                                        ) : (
                                          <span className={cn("text-xs", val ? "text-foreground" : "text-muted-foreground/40")}>{val || "—"}</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-1.5 px-3 text-right text-xs font-bold text-foreground">{totalTarget || "—"}</td>
                                </tr>
                                {/* Realizado row */}
                                <tr>
                                  <td className="py-1.5 px-3 text-[11px] font-medium text-muted-foreground">Realizado</td>
                                  {MONTH_KEYS.map((mk, i) => {
                                    const target = vals[mk] || 0;
                                    const actual = actuals[mk] || 0;
                                    const isEditing = editingCell?.goalId === goal.id && editingCell?.month === `actual-${mk}`;
                                    const isCurrent = mk === currentMonth && year === new Date().getFullYear();
                                    const met = target > 0 && actual >= target;
                                    const behind = target > 0 && actual < target && actual > 0;
                                    return (
                                      <td
                                        key={mk}
                                        className={cn("py-1 px-1 text-right", isCurrent && "bg-primary/5", canEdit && "cursor-pointer hover:bg-accent/50")}
                                        onClick={() => canEdit && !isEditing && (() => { setEditingCell({ goalId: goal.id, month: `actual-${mk}` }); setEditValue(actual ? String(actual) : ""); })()}
                                      >
                                        {isEditing ? (
                                          <input
                                            ref={editRef}
                                            type="number"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => {
                                              const numVal = parseFloat(editValue) || 0;
                                              const newActuals = { ...actuals, [mk]: numVal };
                                              setMemberGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, actuals_by_month: newActuals } : g));
                                              fetch("/api/goals", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ id: goal.id, type: "member", actuals_by_month: newActuals }),
                                              });
                                              setEditingCell(null);
                                            }}
                                            onKeyDown={(e) => { if (e.key === "Escape") setEditingCell(null); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                            step="0.01"
                                            className="w-full px-1 py-0.5 bg-background border border-primary rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                          />
                                        ) : (
                                          <span className={cn("text-xs font-medium", met ? "text-green-500" : behind ? "text-amber-500" : actual ? "text-foreground" : "text-muted-foreground/40")}>
                                            {actual || "—"}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-1.5 px-3 text-right">
                                    <span className={cn("text-xs font-bold", pct >= 100 ? "text-green-500" : "text-foreground")}>{totalActual || "—"}</span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ─── Add Modal ─── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">
                {editingGoalId
                  ? (tab === "budget" ? "Editar meta orçamentária" : "Editar KPI individual")
                  : (tab === "budget" ? "Nova meta orçamentária" : "Novo KPI individual")}
              </h2>
              <button onClick={resetAddForm} className="p-1 rounded-md hover:bg-accent cursor-pointer">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {tab === "budget" ? (
              <form onSubmit={editingGoalId ? handleEditBudget : handleAddBudget} className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da meta</label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Ex: Orçamento de Marketing"
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Departamento</label>
                    <select value={addDeptId} onChange={(e) => setAddDeptId(e.target.value)} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm cursor-pointer">
                      <option value="">Todos</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
                    <select value={addCatId} onChange={(e) => setAddCatId(e.target.value)} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm cursor-pointer">
                      <option value="">Todas</option>
                      {categories.filter((c) => c.tipo === "despesa").map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de valor</label>
                  <div className="flex gap-2">
                    {GOAL_TYPE_OPTIONS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setAddGoalType(t.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border",
                          addGoalType === t.value
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Visualizadores (além de admins)</label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {members.filter((m) => m.role !== "owner" && m.role !== "admin").map((m) => {
                      const selected = addViewers.includes(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => setAddViewers((prev) => selected ? prev.filter((v) => v !== m.user_id) : [...prev, m.user_id])}
                          className={cn(
                            "px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border",
                            selected ? "bg-blue-500/10 text-blue-500 border-blue-500/30" : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
                          )}
                        >
                          {m.full_name || m.email}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    {editingGoalId ? "Salvar alterações" : "Criar meta"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={editingGoalId ? handleEditMember : handleAddMember} className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Membro</label>
                  <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} required className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm cursor-pointer">
                    <option value="">Selecionar...</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
                    <select value={addMemberGoalType} onChange={(e) => setAddMemberGoalType(e.target.value)} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm cursor-pointer">
                      {MEMBER_GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da meta</label>
                    <input
                      value={addGoalName}
                      onChange={(e) => setAddGoalName(e.target.value)}
                      placeholder="Ex: Fechar 10 vendas"
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving || !addUserId} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    {editingGoalId ? "Salvar alterações" : "Criar KPI"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Viewers Modal ─── */}
      {viewersGoalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewersGoalId(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Visualizadores</h2>
              <button onClick={() => setViewersGoalId(null)} className="p-1 rounded-md hover:bg-accent cursor-pointer">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-2 max-h-60 overflow-y-auto">
              {members.filter((m) => m.role !== "owner" && m.role !== "admin").map((m) => {
                const checked = viewersList.includes(m.user_id);
                return (
                  <label key={m.user_id} className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setViewersList((prev) => checked ? prev.filter((v) => v !== m.user_id) : [...prev, m.user_id])}
                      className="accent-primary w-4 h-4"
                    />
                    <span className="text-sm text-foreground">{m.full_name || m.email}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setViewersGoalId(null)} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg cursor-pointer">Cancelar</button>
              <button onClick={saveViewers} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg cursor-pointer">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
