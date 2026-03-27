"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import {
  Zap,
  Plus,
  X,
  Loader2,
  Trash2,
  Pencil,
  Play,
  Pause,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  History,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils/helpers";

const TRIGGER_OPTIONS = [
  { value: "card_moved_to_column", label: "Tarefa movida para coluna", icon: "→" },
  { value: "card_created", label: "Tarefa criada", icon: "+" },
  { value: "card_overdue", label: "Tarefa atrasada", icon: "⏰" },
  { value: "card_completed", label: "Tarefa concluída", icon: "✓" },
  { value: "progress_reached", label: "Progresso atingiu %", icon: "📊" },
] as const;

const PROGRESS_PRESETS = [10, 25, 50, 75, 100];

const ACTION_OPTIONS = [
  { value: "mark_completed", label: "Marcar como concluída" },
  { value: "set_priority", label: "Definir prioridade" },
  { value: "assign_member", label: "Atribuir membro" },
  { value: "send_notification", label: "Enviar notificação" },
  { value: "move_to_column", label: "Mover para coluna" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];

interface AutomationRow {
  id: string;
  org_id: string;
  board_id: string | null;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  created_by: string | null;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

interface LogRow {
  id: string;
  automation_id: string;
  card_id: string | null;
  status: string;
  details: string | null;
  created_at: string;
}

interface BoardOption {
  id: string;
  name: string;
}

interface ColumnOption {
  id: string;
  name: string;
  board_id: string;
}

interface MemberOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

export default function AutomationsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [columns, setColumns] = useState<ColumnOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formBoardId, setFormBoardId] = useState("");
  const [formTrigger, setFormTrigger] = useState<string>("card_moved_to_column");
  const [formTriggerColumnId, setFormTriggerColumnId] = useState("");
  const [formTriggerPercent, setFormTriggerPercent] = useState<number>(100);
  const [formAction, setFormAction] = useState<string>("mark_completed");
  const [formActionPriority, setFormActionPriority] = useState("high");
  const [formActionMemberId, setFormActionMemberId] = useState("");
  const [formActionColumnId, setFormActionColumnId] = useState("");
  const [formActionMessage, setFormActionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logs
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (activeOrgId) loadData();
  }, [activeOrgId]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    // Step 1: Load boards first (scoped to org)
    const boardsRes = await supabase
      .from("boards")
      .select("id, name")
      .eq("org_id", activeOrgId!)
      .eq("is_archived", false)
      .order("name");
    const orgBoardIds = (boardsRes.data || []).map((b) => b.id);
    const safeBoardIds = orgBoardIds.length > 0 ? orgBoardIds : ["00000000-0000-0000-0000-000000000000"];

    // Step 2: Load rest filtered by org boards
    const [autoRes, colsRes, membersRes] = await Promise.all([
      supabase
        .from("automations")
        .select("*")
        .eq("org_id", activeOrgId!)
        .order("created_at", { ascending: false }),
      supabase
        .from("columns")
        .select("id, name, board_id")
        .in("board_id", safeBoardIds)
        .order("position"),
      supabase
        .from("org_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("org_id", activeOrgId!),
    ]);

    setAutomations(autoRes.data || []);
    setBoards(boardsRes.data || []);
    setColumns(colsRes.data || []);
    setMembers(
      (membersRes.data || []).map((m: any) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name,
        email: m.profiles?.email,
      }))
    );
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setFormName("");
    setFormBoardId(boards[0]?.id || "");
    setFormTrigger("card_moved_to_column");
    setFormTriggerColumnId("");
    setFormTriggerPercent(100);
    setFormAction("mark_completed");
    setFormActionPriority("high");
    setFormActionMemberId("");
    setFormActionColumnId("");
    setFormActionMessage("");
    setError(null);
    setShowModal(true);
  }

  function openEdit(auto: AutomationRow) {
    setEditingId(auto.id);
    setFormName(auto.name);
    setFormBoardId(auto.board_id || boards[0]?.id || "");
    setFormTrigger(auto.trigger_type);
    setFormTriggerColumnId(auto.trigger_config?.column_id || "");
    setFormTriggerPercent(auto.trigger_config?.percent || 100);
    setFormAction(auto.action_type);
    setFormActionPriority(auto.action_config?.priority || "high");
    setFormActionMemberId(auto.action_config?.user_id || "");
    setFormActionColumnId(auto.action_config?.column_id || "");
    setFormActionMessage(auto.action_config?.message || "");
    setError(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formBoardId || !activeOrgId || !currentUserId) return;

    setSaving(true);
    setError(null);

    const triggerConfig: any = {};
    if (formTrigger === "card_moved_to_column" && formTriggerColumnId) {
      triggerConfig.column_id = formTriggerColumnId;
    }
    if (formTrigger === "progress_reached") {
      triggerConfig.percent = formTriggerPercent;
    }

    const actionConfig: any = {};
    if (formAction === "set_priority") actionConfig.priority = formActionPriority;
    if (formAction === "assign_member") actionConfig.user_id = formActionMemberId;
    if (formAction === "move_to_column") actionConfig.column_id = formActionColumnId;
    if (formAction === "send_notification") actionConfig.message = formActionMessage;

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from("automations")
          .update({
            name: formName.trim(),
            board_id: formBoardId,
            trigger_type: formTrigger,
            trigger_config: triggerConfig,
            action_type: formAction,
            action_config: actionConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("automations").insert({
          org_id: activeOrgId,
          board_id: formBoardId,
          name: formName.trim(),
          is_active: true,
          trigger_type: formTrigger,
          trigger_config: triggerConfig,
          action_type: formAction,
          action_config: actionConfig,
          created_by: currentUserId,
          last_run_at: null,
        });
        if (err) throw err;
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar automação.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(auto: AutomationRow) {
    await supabase
      .from("automations")
      .update({ is_active: !auto.is_active })
      .eq("id", auto.id);
    setAutomations((prev) =>
      prev.map((a) => (a.id === auto.id ? { ...a, is_active: !a.is_active } : a))
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja deletar esta automação?")) return;
    await supabase.from("automation_logs").delete().eq("automation_id", id);
    await supabase.from("automations").delete().eq("id", id);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  async function loadLogs(automationId: string) {
    setShowLogs(automationId);
    setLoadingLogs(true);
    const { data } = await supabase
      .from("automation_logs")
      .select("*")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs(data || []);
    setLoadingLogs(false);
  }

  function getTriggerLabel(type: string) {
    return TRIGGER_OPTIONS.find((t) => t.value === type)?.label || type;
  }

  function getActionLabel(type: string) {
    return ACTION_OPTIONS.find((a) => a.value === type)?.label || type;
  }

  function getBoardName(boardId: string | null) {
    if (!boardId) return "—";
    return boards.find((b) => b.id === boardId)?.name || "—";
  }

  function getColumnName(columnId: string) {
    return columns.find((c) => c.id === columnId)?.name || "—";
  }

  const boardColumns = columns.filter((c) => c.board_id === formBoardId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard permission="canManageAutomations">
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <Zap className="w-6 h-6 text-yellow-500" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Automações</h1>
          <p className="text-sm text-muted-foreground">
            Automatize ações quando eventos acontecem nos seus boards
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Automação
        </button>
      </div>

      {/* Automations List */}
      {automations.length === 0 ? (
        <div className="text-center py-16">
          <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma automação criada</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Crie regras para automatizar ações nos seus boards
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className={cn(
                "bg-card border rounded-xl overflow-hidden transition-colors",
                auto.is_active ? "border-border" : "border-border/50 opacity-60"
              )}
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => handleToggleActive(auto)}
                  className={cn(
                    "shrink-0 p-1.5 rounded-lg transition-colors",
                    auto.is_active
                      ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                  title={auto.is_active ? "Pausar" : "Ativar"}
                >
                  {auto.is_active ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{auto.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <span className="bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                      {getTriggerLabel(auto.trigger_type)}
                    </span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded font-medium">
                      {getActionLabel(auto.action_type)}
                    </span>
                    <span className="text-muted-foreground/60 ml-1">
                      · {getBoardName(auto.board_id)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {auto.run_count > 0 && (
                    <span className="text-xs text-muted-foreground mr-1">
                      {auto.run_count}x
                    </span>
                  )}
                  <button
                    onClick={() => loadLogs(auto.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                    title="Ver logs"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(auto)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(auto.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
                    title="Deletar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Logs section */}
              {showLogs === auto.id && (
                <div className="border-t border-border px-4 py-3 bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Últimas execuções
                    </p>
                    <button
                      onClick={() => setShowLogs(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {loadingLogs ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto my-3" />
                  ) : logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Nenhuma execução registrada
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center gap-2 text-xs py-1"
                        >
                          {log.status === "success" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          )}
                          <span className="text-muted-foreground flex-1 truncate">
                            {log.details || (log.status === "success" ? "Executado com sucesso" : "Erro na execução")}
                          </span>
                          <span className="text-muted-foreground/60 shrink-0">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">
                {editingId ? "Editar Automação" : "Nova Automação"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Marcar concluído ao mover para Done"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Board *
                </label>
                <select
                  value={formBoardId}
                  onChange={(e) => setFormBoardId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                >
                  <option value="">Selecione...</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Trigger */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">
                  Quando (Trigger)
                </p>
                <select
                  value={formTrigger}
                  onChange={(e) => setFormTrigger(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {TRIGGER_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>

                {formTrigger === "card_moved_to_column" && boardColumns.length > 0 && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Coluna de destino
                    </label>
                    <select
                      value={formTriggerColumnId}
                      onChange={(e) => setFormTriggerColumnId(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Qualquer coluna</option>
                      {boardColumns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formTrigger === "progress_reached" && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Percentual de progresso
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="100"
                        step="5"
                        value={formTriggerPercent}
                        onChange={(e) => setFormTriggerPercent(parseInt(e.target.value) || 100)}
                        className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <div className="flex gap-1 ml-2">
                        {PROGRESS_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormTriggerPercent(p)}
                            className={cn(
                              "px-2 py-1 text-xs rounded-md border transition-colors",
                              formTriggerPercent === p
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary/50"
                            )}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide">
                  Então (Ação)
                </p>
                <select
                  value={formAction}
                  onChange={(e) => setFormAction(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>

                {formAction === "set_priority" && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Prioridade
                    </label>
                    <select
                      value={formActionPriority}
                      onChange={(e) => setFormActionPriority(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formAction === "assign_member" && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Membro
                    </label>
                    <select
                      value={formActionMemberId}
                      onChange={(e) => setFormActionMemberId(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Selecione...</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formAction === "move_to_column" && boardColumns.length > 0 && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Coluna de destino
                    </label>
                    <select
                      value={formActionColumnId}
                      onChange={(e) => setFormActionColumnId(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Selecione...</option>
                      {boardColumns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formAction === "send_notification" && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Mensagem da notificação
                    </label>
                    <input
                      type="text"
                      value={formActionMessage}
                      onChange={(e) => setFormActionMessage(e.target.value)}
                      placeholder="Ex: Tarefa precisa de atenção!"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !formName.trim() || !formBoardId}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </PermissionGuard>
  );
}
