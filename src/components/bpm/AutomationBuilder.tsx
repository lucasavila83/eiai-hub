"use client";

import { useState } from "react";
import {
  Plus, X, Trash2, Loader2, Pencil, Check, Zap,
  Play, ArrowRight, Bell, Mail, User, MoveRight, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import type { Phase } from "./PhaseEditor";

const TRIGGERS = [
  { value: "card_created", label: "Card criado", icon: Play },
  { value: "card_moved_to_phase", label: "Card movido para fase", icon: ArrowRight },
  { value: "card_completed", label: "Card concluído", icon: Check },
  { value: "sla_warning", label: "SLA prestes a vencer", icon: Bell },
  { value: "sla_expired", label: "SLA vencido", icon: Bell },
] as const;

const ACTIONS = [
  { value: "notify_chat", label: "Enviar notificação", icon: Bell },
  { value: "send_email", label: "Enviar e-mail", icon: Mail },
  { value: "assign_user", label: "Atribuir responsável", icon: User },
  { value: "move_to_phase", label: "Mover para fase", icon: MoveRight },
  { value: "call_webhook", label: "Chamar webhook", icon: Globe },
] as const;

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

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  automations: Automation[];
  phases: Phase[];
  members: OrgMember[];
  onSave: (auto: Automation) => Promise<void>;
  onAdd: (auto: Omit<Automation, "id" | "pipe_id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}

export function AutomationBuilder({ automations, phases, members, onSave, onAdd, onDelete, onToggle }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState(TRIGGERS[0].value);
  const [formAction, setFormAction] = useState(ACTIONS[0].value);
  const [formPhaseId, setFormPhaseId] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, any>>({});

  function resetForm() {
    setFormName("");
    setFormTrigger(TRIGGERS[0].value);
    setFormAction(ACTIONS[0].value);
    setFormPhaseId("");
    setFormConfig({});
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    await onAdd({
      name: formName.trim(),
      trigger_type: formTrigger,
      action_type: formAction,
      phase_id: formPhaseId || null,
      config: formConfig,
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

  // Config fields based on action type
  function renderConfigFields() {
    switch (formAction) {
      case "notify_chat":
        return (
          <div className="space-y-2">
            <input
              value={formConfig.title || ""}
              onChange={(e) => setFormConfig({ ...formConfig, title: e.target.value })}
              placeholder="Título da notificação"
              className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={formConfig.message || ""}
              onChange={(e) => setFormConfig({ ...formConfig, message: e.target.value })}
              placeholder="Mensagem da notificação"
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
        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma automação configurada.</p>
      )}

      {automations.map((auto) => (
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
      ))}

      {/* Add form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Nome da automação"
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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ação</label>
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
              Criar automação
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar automação
        </button>
      )}
    </div>
  );
}
