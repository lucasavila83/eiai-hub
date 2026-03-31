"use client";

import { useState } from "react";
import {
  Plus, X, Trash2, Loader2, Pencil, Check, Zap,
  Play, ArrowRight, Bell, Mail, User, MoveRight, Globe,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import type { Phase } from "./PhaseEditor";

const TRIGGERS = [
  { value: "card_created", label: "Card criado", icon: Play },
  { value: "card_moved_to_phase", label: "Card movido para fase", icon: ArrowRight },
  { value: "card_completed", label: "Card concluido", icon: Check },
  { value: "field_updated", label: "Campo atualizado", icon: Pencil },
  { value: "sla_warning", label: "SLA prestes a vencer", icon: Bell },
  { value: "sla_expired", label: "SLA vencido", icon: Bell },
] as const;

const ACTIONS = [
  { value: "notify_chat", label: "Enviar notificacao", icon: Bell },
  { value: "send_email", label: "Enviar e-mail", icon: Mail },
  { value: "assign_user", label: "Atribuir responsavel", icon: User },
  { value: "move_to_phase", label: "Mover para fase", icon: MoveRight },
  { value: "call_webhook", label: "Chamar webhook", icon: Globe },
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

export interface Automation {
  id: string;
  pipe_id: string;
  phase_id: string | null;
  name: string;
  trigger_type: string;
  action_type: string;
  config: Record<string, any>;
  is_active: boolean;
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

interface Props {
  automations: Automation[];
  phases: Phase[];
  members: OrgMember[];
  fields?: FieldDef[];
  onSave: (auto: Automation) => Promise<void>;
  onAdd: (auto: Omit<Automation, "id" | "pipe_id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}

export function AutomationBuilder({ automations, phases, members, fields = [], onSave, onAdd, onDelete, onToggle }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState(TRIGGERS[0].value);
  const [formAction, setFormAction] = useState(ACTIONS[0].value);
  const [formPhaseId, setFormPhaseId] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, any>>({});

  // Condition
  const [hasCondition, setHasCondition] = useState(false);
  const [condFieldId, setCondFieldId] = useState("");
  const [condOperator, setCondOperator] = useState("eq");
  const [condValue, setCondValue] = useState("");

  function resetForm() {
    setFormName("");
    setFormTrigger(TRIGGERS[0].value);
    setFormAction(ACTIONS[0].value);
    setFormPhaseId("");
    setFormConfig({});
    setHasCondition(false);
    setCondFieldId("");
    setCondOperator("eq");
    setCondValue("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);

    const config: Record<string, any> = { ...formConfig };

    // Add condition to config if enabled
    if (hasCondition && condFieldId) {
      config.condition = {
        field_id: condFieldId,
        operator: condOperator,
        value: condValue,
      };
    }

    await onAdd({
      name: formName.trim(),
      trigger_type: formTrigger,
      action_type: formAction,
      phase_id: formPhaseId || null,
      config,
      is_active: true,
    });
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
    return TRIGGERS.find((t) => t.value === type)?.label || type;
  }

  function getActionLabel(type: string) {
    return ACTIONS.find((a) => a.value === type)?.label || type;
  }

  function getPhaseName(id: string | null) {
    if (!id) return "Todas as fases";
    return phases.find((p) => p.id === id)?.name || "—";
  }

  function getFieldLabel(fieldId: string) {
    return fields.find((f) => f.id === fieldId)?.label || "—";
  }

  function getOperatorLabel(op: string) {
    return OPERATORS.find((o) => o.value === op)?.label || op;
  }

  // Get selected field for condition
  const selectedCondField = fields.find((f) => f.id === condFieldId);
  const needsValue = !["is_empty", "is_not_empty"].includes(condOperator);

  // Config fields based on action type
  function renderConfigFields() {
    switch (formAction) {
      case "notify_chat":
        return (
          <div className="space-y-2">
            <input
              value={formConfig.title || ""}
              onChange={(e) => setFormConfig({ ...formConfig, title: e.target.value })}
              placeholder="Titulo da notificacao"
              className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={formConfig.message || ""}
              onChange={(e) => setFormConfig({ ...formConfig, message: e.target.value })}
              placeholder="Mensagem da notificacao"
              className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        );
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
      case "move_to_phase":
        return (
          <select
            value={formConfig.target_phase_id || ""}
            onChange={(e) => setFormConfig({ ...formConfig, target_phase_id: e.target.value })}
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Selecionar fase destino...</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
          <input
            value={formConfig.email_template || ""}
            onChange={(e) => setFormConfig({ ...formConfig, email_template: e.target.value })}
            placeholder="Template do e-mail (assunto)"
            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-3">
      {/* Automation list */}
      {automations.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma automacao configurada.</p>
      )}

      {automations.map((auto) => {
        const cond = auto.config?.condition;
        return (
          <div key={auto.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <Zap className={cn("w-4 h-4 shrink-0", auto.is_active ? "text-yellow-500" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{auto.name}</p>
              <p className="text-xs text-muted-foreground">
                Quando: <strong>{getTriggerLabel(auto.trigger_type)}</strong>
                {auto.phase_id && <> em <strong>{getPhaseName(auto.phase_id)}</strong></>}
                {" → "}
                <strong>{getActionLabel(auto.action_type)}</strong>
              </p>
              {cond && (
                <p className="text-xs text-blue-500 mt-0.5">
                  <Filter className="w-3 h-3 inline mr-0.5" />
                  Se {getFieldLabel(cond.field_id)} {getOperatorLabel(cond.operator)}{" "}
                  {!["is_empty", "is_not_empty"].includes(cond.operator) && <strong>{cond.value}</strong>}
                </p>
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
              onClick={() => handleDelete(auto.id)}
              disabled={deleting === auto.id}
              className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              {deleting === auto.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />}
            </button>
          </div>
        );
      })}

      {/* Add form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Nome da automacao"
            className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quando</label>
              <select
                value={formTrigger}
                onChange={(e) => setFormTrigger(e.target.value)}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
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
          </div>

          {/* Condition */}
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
                <span className="text-xs font-medium text-muted-foreground">Adicionar condicao (alcada)</span>
              </label>

              {hasCondition && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Executar somente se...</p>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={condFieldId}
                      onChange={(e) => setCondFieldId(e.target.value)}
                      className="px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
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
                      value={condOperator}
                      onChange={(e) => setCondOperator(e.target.value)}
                      className="px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {needsValue && (
                      selectedCondField?.field_type === "select" && selectedCondField.options?.length ? (
                        <select
                          value={condValue}
                          onChange={(e) => setCondValue(e.target.value)}
                          className="px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="">Valor...</option>
                          {selectedCondField.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={condValue}
                          onChange={(e) => setCondValue(e.target.value)}
                          placeholder="Valor..."
                          className="px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Acao</label>
            <select
              value={formAction}
              onChange={(e) => { setFormAction(e.target.value); setFormConfig({}); }}
              className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Action config */}
          {renderConfigFields()}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); resetForm(); }} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent cursor-pointer">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Criar automacao
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar automacao
        </button>
      )}
    </div>
  );
}
