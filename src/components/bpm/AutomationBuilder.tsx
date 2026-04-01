"use client";

import { useState } from "react";
import {
  Plus, X, Trash2, Loader2, Pencil, Check, Zap,
  Play, ArrowRight, Bell, Mail, User, MoveRight, Globe,
  Filter, LayoutGrid, Workflow, ShieldCheck, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import type { Phase } from "./PhaseEditor";
import { TemplateSelector } from "@/components/automations/TemplateSelector";

// ── All triggers (board + BPM) ──
const BOARD_TRIGGERS = [
  { value: "card_moved_to_column", label: "Tarefa movida para coluna", icon: ArrowRight, context: "board" },
  { value: "card_created", label: "Tarefa criada", icon: Play, context: "board" },
  { value: "card_overdue", label: "Tarefa atrasada", icon: Bell, context: "board" },
  { value: "card_completed", label: "Tarefa concluída", icon: Check, context: "board" },
  { value: "progress_reached", label: "Progresso atingiu %", icon: Play, context: "board" },
] as const;

const BPM_TRIGGERS = [
  { value: "card_created", label: "Card criado", icon: Play, context: "bpm" },
  { value: "card_moved_to_phase", label: "Card movido para fase", icon: ArrowRight, context: "bpm" },
  { value: "card_completed", label: "Card concluído", icon: Check, context: "bpm" },
  { value: "field_updated", label: "Campo atualizado", icon: Pencil, context: "bpm" },
  { value: "sla_warning", label: "SLA prestes a vencer", icon: Bell, context: "bpm" },
  { value: "sla_expired", label: "SLA vencido", icon: Bell, context: "bpm" },
] as const;

const BOARD_ACTIONS = [
  { value: "mark_completed", label: "Marcar como concluída", context: "board" },
  { value: "set_priority", label: "Definir prioridade", context: "board" },
  { value: "assign_member", label: "Atribuir membro", context: "board" },
  { value: "move_to_column", label: "Mover para coluna", context: "board" },
] as const;

const BPM_ACTIONS = [
  { value: "assign_user", label: "Atribuir responsável", context: "bpm" },
  { value: "move_to_phase", label: "Mover para fase", context: "bpm" },
] as const;

const SHARED_ACTIONS = [
  { value: "send_notification", label: "Enviar notificação", context: "shared" },
  { value: "notify_chat", label: "Notificar no chat", context: "shared" },
  { value: "send_email", label: "Enviar e-mail", context: "shared" },
  { value: "call_webhook", label: "Chamar webhook", context: "shared" },
  { value: "create_board_task", label: "Criar tarefa no board", context: "shared" },
  { value: "require_approval", label: "Exigir aprovação", context: "shared" },
  { value: "check_budget", label: "Verificar orçamento", context: "shared" },
] as const;

const OPERATORS = [
  { value: "eq", label: "Igual a" },
  { value: "neq", label: "Diferente de" },
  { value: "gt", label: "Maior que" },
  { value: "gte", label: "Maior ou igual a" },
  { value: "lt", label: "Menor que" },
  { value: "lte", label: "Menor ou igual a" },
  { value: "contains", label: "Contém" },
  { value: "is_empty", label: "Está vazio" },
  { value: "is_not_empty", label: "Não está vazio" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baixa" },
];

const PROGRESS_PRESETS = [10, 25, 50, 75, 100];

export interface Automation {
  id: string;
  org_id?: string;
  board_id?: string | null;
  pipe_id?: string | null;
  phase_id?: string | null;
  name: string;
  trigger_type: string;
  trigger_config?: Record<string, any>;
  action_type: string;
  action_config?: Record<string, any>;
  condition?: Record<string, any> | null;
  template_id?: string | null;
  is_active: boolean;
  run_count?: number;
  last_run_at?: string | null;
  // Legacy compat: BPM used "config" instead of action_config
  config?: Record<string, any>;
}

interface FieldDef {
  id: string;
  phase_id: string;
  field_key: string;
  field_type: string;
  label: string;
  options?: { value: string; label: string }[];
}

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
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

// ── Condition types ──
interface SingleCondition {
  field_id: string;
  operator: string;
  value: string;
}

interface CompositeCondition {
  logic: "and" | "or";
  conditions: SingleCondition[];
}

type ConditionConfig = SingleCondition | CompositeCondition;

function isComposite(c: any): c is CompositeCondition {
  return c && "logic" in c && Array.isArray(c.conditions);
}

// ── Approval chain types ──
interface ApprovalStep {
  approver_id: string;
  label: string;
}

/** context: "board" = board-only, "bpm" = process-only, "all" = central page */
interface Props {
  automations: Automation[];
  context: "board" | "bpm" | "all";
  orgId?: string;
  // Board data
  boards?: BoardOption[];
  columns?: ColumnOption[];
  // BPM data
  phases?: Phase[];
  fields?: FieldDef[];
  // Shared
  members: OrgMember[];
  onSave: (auto: Automation) => Promise<void>;
  onAdd: (auto: Partial<Automation>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}

export function AutomationBuilder({
  automations, context, orgId, boards = [], columns = [], phases = [], fields = [], members,
  onSave, onAdd, onDelete, onToggle,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("");
  const [formAction, setFormAction] = useState("");
  const [formBoardId, setFormBoardId] = useState("");
  const [formPhaseId, setFormPhaseId] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, any>>({});
  const [formTriggerConfig, setFormTriggerConfig] = useState<Record<string, any>>({});
  const [formTemplateId, setFormTemplateId] = useState<string | null>(null);

  // ── Composite condition state ──
  const [hasCondition, setHasCondition] = useState(false);
  const [condLogic, setCondLogic] = useState<"and" | "or">("and");
  const [conditionRows, setConditionRows] = useState<SingleCondition[]>([
    { field_id: "", operator: "eq", value: "" },
  ]);

  // ── Approval chain state ──
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([
    { approver_id: "", label: "" },
  ]);
  const [approvalDestPhase, setApprovalDestPhase] = useState("");

  // Derive available triggers/actions by context
  const availableTriggers = context === "board"
    ? BOARD_TRIGGERS
    : context === "bpm"
      ? BPM_TRIGGERS
      : [...BOARD_TRIGGERS, ...BPM_TRIGGERS.filter((t) => !BOARD_TRIGGERS.some((bt) => bt.value === t.value))];

  const availableActions = context === "board"
    ? [...BOARD_ACTIONS, ...SHARED_ACTIONS]
    : context === "bpm"
      ? [...BPM_ACTIONS, ...SHARED_ACTIONS]
      : [...BOARD_ACTIONS, ...BPM_ACTIONS, ...SHARED_ACTIONS.filter((s) => !BPM_ACTIONS.some((b) => b.value === s.value) && !BOARD_ACTIONS.some((b) => b.value === s.value))];

  // Determine if current trigger is board or bpm type
  const isBpmTrigger = BPM_TRIGGERS.some((t) => t.value === formTrigger) && !BOARD_TRIGGERS.some((t) => t.value === formTrigger);
  const isBoardTrigger = BOARD_TRIGGERS.some((t) => t.value === formTrigger);

  function resetForm() {
    setFormName("");
    setFormTrigger(availableTriggers[0]?.value || "");
    setFormAction(availableActions[0]?.value || "");
    setFormBoardId(boards[0]?.id || "");
    setFormPhaseId("");
    setFormConfig({});
    setFormTriggerConfig({});
    setHasCondition(false);
    setCondLogic("and");
    setConditionRows([{ field_id: "", operator: "eq", value: "" }]);
    setApprovalSteps([{ approver_id: "", label: "" }]);
    setApprovalDestPhase("");
    setFormTemplateId(null);
  }

  function openAdd() {
    resetForm();
    setEditingId(null);
    setFormTrigger(availableTriggers[0]?.value || "");
    setFormAction(availableActions[0]?.value || "");
    setShowAdd(true);
  }

  function openEdit(auto: Automation) {
    const actionCfg = auto.action_config || auto.config || {};
    setEditingId(auto.id);
    setFormName(auto.name);
    setFormTrigger(auto.trigger_type);
    setFormAction(auto.action_type);
    setFormBoardId(auto.board_id || "");
    setFormPhaseId(auto.phase_id || "");
    setFormConfig({ ...actionCfg });
    setFormTriggerConfig(auto.trigger_config || {});
    setFormTemplateId(auto.template_id || null);

    // Restore condition state
    const cond = auto.condition || (actionCfg as any).condition || null;
    if (cond) {
      setHasCondition(true);
      if (isComposite(cond)) {
        setCondLogic(cond.logic);
        setConditionRows(cond.conditions.length > 0 ? cond.conditions : [{ field_id: "", operator: "eq", value: "" }]);
      } else {
        setCondLogic("and");
        setConditionRows([{ field_id: cond.field_id || "", operator: cond.operator || "eq", value: cond.value || "" }]);
      }
    } else {
      setHasCondition(false);
      setConditionRows([{ field_id: "", operator: "eq", value: "" }]);
    }

    // Restore approval chain
    if (auto.action_type === "require_approval" && actionCfg.approval_chain?.length) {
      setApprovalSteps(actionCfg.approval_chain);
      setApprovalDestPhase(actionCfg.destination_phase_id || "");
    } else {
      setApprovalSteps([{ approver_id: "", label: "" }]);
      setApprovalDestPhase("");
    }

    setShowAdd(true);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);

    const actionConfig: Record<string, any> = { ...formConfig };

    // Build approval chain into action_config
    if (formAction === "require_approval") {
      actionConfig.approval_chain = approvalSteps.filter((s) => s.approver_id);
      if (approvalDestPhase) actionConfig.destination_phase_id = approvalDestPhase;
    }

    // Build condition (single or composite)
    let condition: ConditionConfig | null = null;
    if (hasCondition) {
      const validRows = conditionRows.filter((r) => r.field_id);
      if (validRows.length === 1) {
        condition = validRows[0];
      } else if (validRows.length > 1) {
        condition = { logic: condLogic, conditions: validRows };
      }
    }

    const payload = {
      name: formName.trim(),
      trigger_type: formTrigger,
      trigger_config: formTriggerConfig,
      action_type: formAction,
      action_config: actionConfig,
      board_id: (context === "board" || (context === "all" && isBoardTrigger)) ? formBoardId || null : null,
      phase_id: (context === "bpm" || (context === "all" && isBpmTrigger)) ? formPhaseId || null : null,
      condition,
      template_id: formTemplateId || null,
      is_active: true,
    };

    if (editingId) {
      const existing = automations.find((a) => a.id === editingId);
      await onSave({ ...existing, ...payload, id: editingId } as Automation);
    } else {
      await onAdd(payload);
    }
    setEditingId(null);
    resetForm();
    setShowAdd(false);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta automação?")) return;
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  }

  function getTriggerLabel(type: string) {
    return [...BOARD_TRIGGERS, ...BPM_TRIGGERS].find((t) => t.value === type)?.label || type;
  }

  function getActionLabel(type: string) {
    return [...BOARD_ACTIONS, ...BPM_ACTIONS, ...SHARED_ACTIONS].find((a) => a.value === type)?.label || type;
  }

  function getBoardName(boardId: string | null | undefined) {
    if (!boardId) return null;
    return boards.find((b) => b.id === boardId)?.name || null;
  }

  function getPhaseName(id: string | null | undefined) {
    if (!id) return null;
    return phases.find((p) => p.id === id)?.name || null;
  }

  function getFieldLabel(fieldId: string) {
    return fields.find((f) => f.id === fieldId)?.label || "—";
  }

  function getOperatorLabel(op: string) {
    return OPERATORS.find((o) => o.value === op)?.label || op;
  }

  function getMemberName(userId: string) {
    const m = members.find((m) => m.user_id === userId);
    return m?.full_name || m?.email || userId;
  }

  const boardColumns = columns.filter((c) => c.board_id === formBoardId);

  // Determine if a trigger is BPM-only
  function isBpmOnlyTrigger(trigger: string) {
    return ["card_moved_to_phase", "field_updated", "sla_warning", "sla_expired"].includes(trigger);
  }

  // ── Condition row helpers ──
  function addConditionRow() {
    setConditionRows([...conditionRows, { field_id: "", operator: "eq", value: "" }]);
  }

  function removeConditionRow(idx: number) {
    setConditionRows(conditionRows.filter((_, i) => i !== idx));
  }

  function updateConditionRow(idx: number, updates: Partial<SingleCondition>) {
    setConditionRows(conditionRows.map((r, i) => i === idx ? { ...r, ...updates } : r));
  }

  // ── Approval step helpers ──
  function addApprovalStep() {
    setApprovalSteps([...approvalSteps, { approver_id: "", label: "" }]);
  }

  function removeApprovalStep(idx: number) {
    setApprovalSteps(approvalSteps.filter((_, i) => i !== idx));
  }

  function updateApprovalStep(idx: number, updates: Partial<ApprovalStep>) {
    setApprovalSteps(approvalSteps.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }

  // ── Render helpers ──
  function renderConditionDisplay(cond: any) {
    if (!cond) return null;

    if (isComposite(cond)) {
      return (
        <p className="text-xs text-blue-500 mt-0.5">
          <Filter className="w-3 h-3 inline mr-0.5" />
          {cond.conditions.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="font-bold text-blue-400"> {cond.logic.toUpperCase()} </span>}
              {getFieldLabel(c.field_id)} {getOperatorLabel(c.operator)}{" "}
              {!["is_empty", "is_not_empty"].includes(c.operator) && <strong>{c.value}</strong>}
            </span>
          ))}
        </p>
      );
    }

    // Single condition (legacy)
    return (
      <p className="text-xs text-blue-500 mt-0.5">
        <Filter className="w-3 h-3 inline mr-0.5" />
        Se {getFieldLabel(cond.field_id)} {getOperatorLabel(cond.operator)}{" "}
        {!["is_empty", "is_not_empty"].includes(cond.operator) && <strong>{cond.value}</strong>}
      </p>
    );
  }

  function renderApprovalDisplay(config: Record<string, any>) {
    const chain: ApprovalStep[] = config.approval_chain || [];
    if (chain.length === 0) return null;
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0" />
        {chain.map((step, i) => (
          <span key={i} className="text-xs text-amber-600">
            {i > 0 && <span className="text-muted-foreground mx-0.5">→</span>}
            {getMemberName(step.approver_id)}
            {step.label && <span className="text-muted-foreground"> ({step.label})</span>}
          </span>
        ))}
        {config.destination_phase_id && (
          <>
            <span className="text-muted-foreground text-xs mx-0.5">→</span>
            <span className="text-xs text-green-500">{getPhaseName(config.destination_phase_id) || "Fase destino"}</span>
          </>
        )}
      </div>
    );
  }

  function renderTriggerConfig() {
    if (formTrigger === "card_moved_to_column" && boardColumns.length > 0) {
      return (
        <select
          value={formTriggerConfig.column_id || ""}
          onChange={(e) => setFormTriggerConfig({ ...formTriggerConfig, column_id: e.target.value })}
          className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="">Qualquer coluna</option>
          {boardColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      );
    }
    if (formTrigger === "progress_reached") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="5"
            max="100"
            step="5"
            value={formTriggerConfig.percent || 100}
            onChange={(e) => setFormTriggerConfig({ ...formTriggerConfig, percent: parseInt(e.target.value) || 100 })}
            className="w-20 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <div className="flex gap-1 ml-1">
            {PROGRESS_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFormTriggerConfig({ ...formTriggerConfig, percent: p })}
                className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer",
                  (formTriggerConfig.percent || 100) === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  function renderActionConfig() {
    switch (formAction) {
      case "set_priority":
        return (
          <select
            value={formConfig.priority || "high"}
            onChange={(e) => setFormConfig({ ...formConfig, priority: e.target.value })}
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        );
      case "assign_member":
      case "assign_user":
        return (
          <select
            value={formConfig.user_id || ""}
            onChange={(e) => setFormConfig({ ...formConfig, user_id: e.target.value })}
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Selecionar pessoa...</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
            ))}
          </select>
        );
      case "move_to_column":
        return (
          <select
            value={formConfig.column_id || ""}
            onChange={(e) => setFormConfig({ ...formConfig, column_id: e.target.value })}
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Selecionar coluna...</option>
            {boardColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        );
      case "move_to_phase":
        return (
          <select
            value={formConfig.target_phase_id || ""}
            onChange={(e) => setFormConfig({ ...formConfig, target_phase_id: e.target.value })}
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Selecionar fase destino...</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        );
      case "send_notification":
      case "notify_chat":
        return (
          <div className="space-y-2">
            {orgId && (
              <TemplateSelector
                orgId={orgId}
                selectedTemplateId={formTemplateId}
                onSelect={setFormTemplateId}
                filterTypes={formAction === "notify_chat" ? ["chat"] : ["chat", "email"]}
              />
            )}
            {!formTemplateId && (
              <>
                <input
                  value={formConfig.title || ""}
                  onChange={(e) => setFormConfig({ ...formConfig, title: e.target.value })}
                  placeholder="Título da notificação"
                  className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  value={formConfig.message || ""}
                  onChange={(e) => setFormConfig({ ...formConfig, message: e.target.value })}
                  placeholder="Mensagem"
                  className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </>
            )}
          </div>
        );
      case "call_webhook":
        return (
          <input
            value={formConfig.url || ""}
            onChange={(e) => setFormConfig({ ...formConfig, url: e.target.value })}
            placeholder="https://exemplo.com/webhook"
            type="url"
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        );
      case "send_email":
        return (
          <div className="space-y-2">
            {orgId && (
              <TemplateSelector
                orgId={orgId}
                selectedTemplateId={formTemplateId}
                onSelect={setFormTemplateId}
                filterTypes={["email"]}
              />
            )}
            {!formTemplateId && (
              <input
                value={formConfig.email_template || ""}
                onChange={(e) => setFormConfig({ ...formConfig, email_template: e.target.value })}
                placeholder="Template do e-mail (assunto)"
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
        );

      case "require_approval":
        return (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Cadeia de aprovação
            </p>

            {approvalSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-center font-bold">
                  {idx + 1}.
                </span>
                <select
                  value={step.approver_id}
                  onChange={(e) => updateApprovalStep(idx, { approver_id: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="">Selecionar aprovador...</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                  ))}
                </select>
                <input
                  value={step.label}
                  onChange={(e) => updateApprovalStep(idx, { label: e.target.value })}
                  placeholder="Cargo (opcional)"
                  className="w-28 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {approvalSteps.length > 1 && (
                  <button type="button" onClick={() => removeApprovalStep(idx)} className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer">
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addApprovalStep}
              className="text-xs text-amber-600 hover:text-amber-500 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Adicionar nivel
            </button>

            {/* Destination after all approvals */}
            {phases.length > 0 && (
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Após aprovação total, mover para:</label>
                <select
                  value={approvalDestPhase}
                  onChange={(e) => setApprovalDestPhase(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="">Manter na fase atual</option>
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        );

      case "check_budget":
        return (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 space-y-2">
            <p className="text-[10px] text-green-600 font-medium uppercase tracking-wider">Verificar orçamento</p>
            <p className="text-xs text-muted-foreground">
              Compara o valor da solicitação com a meta orçamentária do departamento/categoria.
              Se exceder o limite, adiciona um passo extra de aprovação.
            </p>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Campo do valor (R$)</label>
              <select
                value={formConfig.value_field_id || ""}
                onChange={(e) => setFormConfig({ ...formConfig, value_field_id: e.target.value })}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">Selecionar campo...</option>
                {fields.filter((f) => f.field_type === "currency" || f.field_type === "number").map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Aprovador extra (quando exceder)</label>
              <select
                value={formConfig.extra_approver_id || ""}
                onChange={(e) => setFormConfig({ ...formConfig, extra_approver_id: e.target.value })}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">Selecionar...</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                ))}
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  function getAutoActionConfig(auto: Automation) {
    return auto.action_config || auto.config || {};
  }

  function getAutoCondition(auto: Automation) {
    return auto.condition || (auto.config || auto.action_config || {}).condition || null;
  }

  return (
    <div className="space-y-3">
      {/* Automation list */}
      {automations.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma automação configurada.</p>
      )}

      {automations.map((auto) => {
        const cond = getAutoCondition(auto);
        const actionCfg = getAutoActionConfig(auto);
        const boardName = getBoardName(auto.board_id);
        const phaseName = getPhaseName(auto.phase_id);
        const isBpm = !!auto.pipe_id;
        return (
          <div key={auto.id} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <Zap className={cn("w-4 h-4 shrink-0", auto.is_active ? "text-yellow-500" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground truncate">{auto.name}</p>
                  {context === "all" && (
                    isBpm
                      ? <span className="shrink-0 text-[10px] bg-violet-500/10 text-violet-500 px-1.5 py-0.5 rounded font-medium">Processo</span>
                      : <span className="shrink-0 text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">Board</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando: <strong>{getTriggerLabel(auto.trigger_type)}</strong>
                  {phaseName && <> em <strong>{phaseName}</strong></>}
                  {boardName && <> em <strong>{boardName}</strong></>}
                  {" → "}
                  <strong>{getActionLabel(auto.action_type)}</strong>
                </p>
                {renderConditionDisplay(cond)}
                {auto.action_type === "require_approval" && renderApprovalDisplay(actionCfg)}
                {auto.run_count != null && auto.run_count > 0 && (
                  <span className="text-[10px] text-muted-foreground/60">{auto.run_count}x executada</span>
                )}
              </div>
              <button
                onClick={() => onToggle(auto.id, !auto.is_active)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 cursor-pointer",
                  auto.is_active ? "bg-primary" : "bg-muted"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                  auto.is_active ? "translate-x-4.5" : "translate-x-0.5"
                )} />
              </button>
              <button
                onClick={() => openEdit(auto)}
                className="p-1 rounded-md hover:bg-accent transition-colors cursor-pointer"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              <button
                onClick={() => handleDelete(auto.id)}
                disabled={deleting === auto.id}
                className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                {deleting === auto.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />}
              </button>
            </div>
          </div>
        );
      })}

      {/* Add form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {editingId ? "Editar automação" : "Nova automação"}
          </p>
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Nome da automação"
            className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
            required
          />

          {/* Board selector (for board and all contexts) */}
          {(context === "board" || (context === "all" && !isBpmOnlyTrigger(formTrigger))) && boards.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Board</label>
              <select
                value={formBoardId}
                onChange={(e) => setFormBoardId(e.target.value)}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">Selecione o board...</option>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quando</label>
              <select
                value={formTrigger}
                onChange={(e) => { setFormTrigger(e.target.value); setFormTriggerConfig({}); }}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {availableTriggers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Phase selector for BPM triggers */}
            {(context === "bpm" || (context === "all" && isBpmOnlyTrigger(formTrigger))) && phases.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fase (opcional)</label>
                <select
                  value={formPhaseId}
                  onChange={(e) => setFormPhaseId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="">Todas as fases</option>
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Trigger-specific config */}
          {renderTriggerConfig()}

          {/* ── Composite Conditions (AND/OR) ── */}
          {fields.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCondition}
                  onChange={(e) => setHasCondition(e.target.checked)}
                  className="rounded border-border"
                />
                <Filter className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground">Adicionar condições (alçada)</span>
              </label>

              {hasCondition && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                  {/* Logic toggle */}
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Executar somente se</p>
                    {conditionRows.length > 1 && (
                      <div className="flex bg-muted rounded-md p-0.5">
                        <button
                          type="button"
                          onClick={() => setCondLogic("and")}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                            condLogic === "and" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          E (AND)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCondLogic("or")}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                            condLogic === "or" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          OU (OR)
                        </button>
                      </div>
                    )}
                  </div>

                  {conditionRows.map((row, idx) => {
                    const selectedField = fields.find((f) => f.id === row.field_id);
                    const showValue = !["is_empty", "is_not_empty"].includes(row.operator);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && (
                          <span className="text-[10px] font-bold text-blue-400 w-8 text-center shrink-0">
                            {condLogic.toUpperCase()}
                          </span>
                        )}
                        {idx === 0 && conditionRows.length > 1 && (
                          <span className="w-8 shrink-0" />
                        )}
                        <select
                          value={row.field_id}
                          onChange={(e) => updateConditionRow(idx, { field_id: e.target.value })}
                          className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="">Campo...</option>
                          {fields.map((f) => {
                            const phase = phases.find((p) => p.id === f.phase_id);
                            return (
                              <option key={f.id} value={f.id}>
                                {phase ? `${phase.name} → ` : ""}{f.label}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={row.operator}
                          onChange={(e) => updateConditionRow(idx, { operator: e.target.value })}
                          className="w-32 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                        {showValue && (
                          selectedField?.field_type === "select" && selectedField.options?.length ? (
                            <select
                              value={row.value}
                              onChange={(e) => updateConditionRow(idx, { value: e.target.value })}
                              className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                            >
                              <option value="">Valor...</option>
                              {selectedField.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={row.value}
                              onChange={(e) => updateConditionRow(idx, { value: e.target.value })}
                              placeholder="Valor..."
                              className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          )
                        )}
                        {conditionRows.length > 1 && (
                          <button type="button" onClick={() => removeConditionRow(idx)} className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer">
                            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addConditionRow}
                    className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 cursor-pointer mt-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar condição
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ação</label>
            <select
              value={formAction}
              onChange={(e) => { setFormAction(e.target.value); setFormConfig({}); }}
              className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {availableActions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Action-specific config */}
          {renderActionConfig()}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent cursor-pointer">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingId ? "Salvar alterações" : "Criar automação"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={openAdd}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar automação
        </button>
      )}
    </div>
  );
}
