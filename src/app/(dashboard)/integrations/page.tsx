"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import {
  Plug,
  Plus,
  X,
  Loader2,
  Trash2,
  Pencil,
  Play,
  Pause,
  Webhook,
  Github,
  Mail,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  Settings2,
  LayoutDashboard,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils/helpers";

const INTEGRATION_TYPES = [
  {
    value: "webhook",
    label: "Webhook",
    description: "Envie dados para qualquer URL quando eventos acontecerem",
    icon: Webhook,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    fields: ["url"],
  },
  {
    value: "slack",
    label: "Slack",
    description: "Envie notificações para um canal do Slack via Webhook",
    icon: MessageSquare,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    fields: ["webhook_url", "channel"],
  },
  {
    value: "google_calendar",
    label: "Google Calendar",
    description: "Sincronize eventos e prazos com o Google Calendar",
    icon: Calendar,
    color: "text-green-500",
    bg: "bg-green-500/10",
    fields: ["calendar_id"],
  },
  {
    value: "github",
    label: "GitHub",
    description: "Conecte repositórios e vincule commits a tarefas",
    icon: Github,
    color: "text-foreground",
    bg: "bg-muted",
    fields: ["repo", "token"],
  },
  {
    value: "email_notify",
    label: "Email",
    description: "Envie notificações por email quando eventos acontecerem",
    icon: Mail,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    fields: ["recipients"],
  },
] as const;

const EVENT_OPTIONS = [
  { value: "card.created", label: "Tarefa criada" },
  { value: "card.completed", label: "Tarefa concluída" },
  { value: "card.moved", label: "Tarefa movida" },
  { value: "card.overdue", label: "Tarefa atrasada" },
  { value: "message.sent", label: "Mensagem enviada" },
  { value: "member.joined", label: "Membro entrou" },
  { value: "event.created", label: "Evento criado" },
];

interface IntegrationRow {
  id: string;
  org_id: string;
  type: string;
  name: string;
  is_active: boolean;
  config: any;
  events: string[];
  created_by: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

export default function IntegrationsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<"type" | "config">("type");
  const [formType, setFormType] = useState<string>("webhook");
  const [formName, setFormName] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Google Calendar OAuth
  const [gcalStatus, setGcalStatus] = useState<"loading" | "disconnected" | "connected">("loading");
  const [gcalCalendarId, setGcalCalendarId] = useState<string | null>(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncStats, setGcalSyncStats] = useState<{ pushed: number; pulled: number; updated: number } | null>(null);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false);

  // Board sync settings
  const [gcalShowBoardSettings, setGcalShowBoardSettings] = useState(false);
  const [gcalUserBoards, setGcalUserBoards] = useState<{ id: string; name: string }[]>([]);
  const [gcalSyncedBoardIds, setGcalSyncedBoardIds] = useState<string[]>([]);
  const [gcalSavingBoards, setGcalSavingBoards] = useState(false);

  // Webhook URL for receiving
  const webhookReceiveUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/integrations/webhook/${activeOrgId}`
    : "";

  useEffect(() => {
    if (activeOrgId) loadData();
  }, [activeOrgId]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", activeOrgId!)
      .order("created_at", { ascending: false });

    setIntegrations(data || []);
    setLoading(false);

    // Check Google Calendar status
    loadGcalStatus();
  }

  async function loadGcalStatus() {
    if (!activeOrgId) return;
    try {
      const res = await fetch(`/api/integrations/google-calendar?orgId=${activeOrgId}`);
      const data = await res.json();
      if (data.connected) {
        setGcalStatus("connected");
        setGcalCalendarId(data.calendar_id);
        loadBoardSyncSettings();
      } else {
        setGcalStatus("disconnected");
      }
    } catch {
      setGcalStatus("disconnected");
    }
  }

  async function handleGcalConnect() {
    if (!activeOrgId) return;
    setGcalConnecting(true);
    try {
      const res = await fetch(`/api/integrations/google-calendar?orgId=${activeOrgId}`);
      const data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch {
      setGcalConnecting(false);
    }
  }

  async function handleGcalDisconnect() {
    if (!activeOrgId) return;
    setGcalDisconnecting(true);
    await fetch("/api/integrations/google-calendar/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: activeOrgId }),
    });
    setGcalStatus("disconnected");
    setGcalCalendarId(null);
    setGcalDisconnecting(false);
  }

  async function handleGcalSync() {
    if (!activeOrgId) return;
    setGcalSyncing(true);
    setGcalSyncStats(null);
    try {
      const res = await fetch("/api/integrations/google-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: activeOrgId }),
      });
      const data = await res.json();
      if (data.stats) setGcalSyncStats(data.stats);
    } catch {}
    setGcalSyncing(false);
  }

  async function loadBoardSyncSettings() {
    if (!activeOrgId) return;
    try {
      // Load user's boards (boards they are member of or created)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get boards from org
      const { data: boards } = await supabase
        .from("boards")
        .select("id, name")
        .eq("org_id", activeOrgId)
        .eq("is_archived", false)
        .order("name");

      setGcalUserBoards(boards || []);

      // Get currently synced board ids
      const res = await fetch(`/api/integrations/google-calendar/boards?orgId=${activeOrgId}`);
      const data = await res.json();
      setGcalSyncedBoardIds(data.boardIds || []);
    } catch {}
  }

  function toggleBoardSync(boardId: string) {
    setGcalSyncedBoardIds((prev) =>
      prev.includes(boardId)
        ? prev.filter((id) => id !== boardId)
        : [...prev, boardId]
    );
  }

  async function saveBoardSyncSettings() {
    if (!activeOrgId) return;
    setGcalSavingBoards(true);
    try {
      await fetch("/api/integrations/google-calendar/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: activeOrgId, boardIds: gcalSyncedBoardIds }),
      });
    } catch {}
    setGcalSavingBoards(false);
  }

  // Handle OAuth callback query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_success")) {
      setGcalStatus("connected");
      loadGcalStatus();
      // Clean URL
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  function openCreate() {
    setEditingId(null);
    setStep("type");
    setFormType("webhook");
    setFormName("");
    setFormConfig({});
    setFormEvents(new Set());
    setError(null);
    setShowModal(true);
  }

  function openEdit(integ: IntegrationRow) {
    setEditingId(integ.id);
    setStep("config");
    setFormType(integ.type);
    setFormName(integ.name);
    setFormConfig(integ.config || {});
    setFormEvents(new Set(integ.events || []));
    setError(null);
    setShowModal(true);
  }

  function selectType(type: string) {
    setFormType(type);
    const typeDef = INTEGRATION_TYPES.find((t) => t.value === type);
    setFormName(typeDef?.label || "");
    setStep("config");
  }

  function toggleEvent(evt: string) {
    setFormEvents((prev) => {
      const next = new Set(prev);
      if (next.has(evt)) next.delete(evt);
      else next.add(evt);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !activeOrgId || !currentUserId) return;

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from("integrations")
          .update({
            name: formName.trim(),
            config: formConfig,
            events: Array.from(formEvents),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("integrations").insert({
          org_id: activeOrgId,
          type: formType,
          name: formName.trim(),
          is_active: true,
          config: formConfig,
          events: Array.from(formEvents),
          created_by: currentUserId,
          last_triggered_at: null,
        });
        if (err) throw err;
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar integração.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(integ: IntegrationRow) {
    await supabase
      .from("integrations")
      .update({ is_active: !integ.is_active })
      .eq("id", integ.id);
    setIntegrations((prev) =>
      prev.map((i) => (i.id === integ.id ? { ...i, is_active: !i.is_active } : i))
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja deletar esta integração?")) return;
    await supabase.from("integrations").delete().eq("id", id);
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookReceiveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getTypeDef(type: string) {
    return INTEGRATION_TYPES.find((t) => t.value === type);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard permission="canManageIntegrations">
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <Plug className="w-6 h-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-sm text-muted-foreground">
            Conecte ferramentas externas ao seu workspace
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Integração
        </button>
      </div>

      {/* Google Calendar Card */}
      <div className="mb-6 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-green-500/10">
            <Calendar className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Google Calendar</h3>
            <p className="text-xs text-muted-foreground">
              {gcalStatus === "connected"
                ? `Conectado · ${gcalCalendarId || "primary"}`
                : "Sincronize seus eventos com o Google Calendar"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {gcalStatus === "loading" && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {gcalStatus === "disconnected" && (
              <button
                onClick={handleGcalConnect}
                disabled={gcalConnecting}
                className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {gcalConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                Conectar
              </button>
            )}
            {gcalStatus === "connected" && (
              <>
                <button
                  onClick={handleGcalSync}
                  disabled={gcalSyncing}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {gcalSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Sincronizar
                </button>
                <button
                  onClick={handleGcalDisconnect}
                  disabled={gcalDisconnecting}
                  className="inline-flex items-center gap-1.5 text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  {gcalDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Desconectar
                </button>
              </>
            )}
          </div>
        </div>
        {gcalSyncStats && (
          <div className="px-5 py-2 bg-muted/50 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <span className="text-green-500 font-medium">{gcalSyncStats.pushed} enviados</span>
            <span className="text-blue-500 font-medium">{gcalSyncStats.pulled} importados</span>
            <span className="text-yellow-500 font-medium">{gcalSyncStats.updated} atualizados</span>
            {(gcalSyncStats as any).cards > 0 && (
              <span className="text-orange-500 font-medium">{(gcalSyncStats as any).cards} tarefas</span>
            )}
          </div>
        )}

        {/* Board Sync Settings */}
        {gcalStatus === "connected" && (
          <div className="border-t border-border">
            <button
              onClick={() => setGcalShowBoardSettings((v) => !v)}
              className="w-full px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              <span className="flex-1 text-left">Sincronizar prazos de Boards</span>
              {gcalSyncedBoardIds.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {gcalSyncedBoardIds.length} board{gcalSyncedBoardIds.length !== 1 ? "s" : ""}
                </span>
              )}
              <svg
                className={cn("w-4 h-4 transition-transform", gcalShowBoardSettings && "rotate-180")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {gcalShowBoardSettings && (
              <div className="px-5 pb-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Selecione quais boards terão seus prazos de tarefas sincronizados com o Google Calendar.
                  Cada tarefa com prazo aparecerá como evento no seu calendário.
                </p>

                {gcalUserBoards.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic">Nenhum board encontrado</p>
                ) : (
                  <div className="space-y-1">
                    {gcalUserBoards.map((board) => {
                      const isChecked = gcalSyncedBoardIds.includes(board.id);
                      return (
                        <button
                          key={board.id}
                          onClick={() => toggleBoardSync(board.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                            isChecked
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          )}
                        >
                          {isChecked ? (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-border shrink-0" />
                          )}
                          <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                          <span className="flex-1 truncate">{board.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={saveBoardSyncSettings}
                    disabled={gcalSavingBoards}
                    className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {gcalSavingBoards ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Integrations Grid */}
      {integrations.length === 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">Integrações disponíveis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {INTEGRATION_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setFormType(type.value);
                    setFormName(type.label);
                    setStep("config");
                    setEditingId(null);
                    setFormConfig({});
                    setFormEvents(new Set());
                    setError(null);
                    setShowModal(true);
                  }}
                  className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 hover:bg-accent/50 hover:shadow-md transition-all group"
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3", type.bg)}>
                    <Icon className={cn("w-5 h-5", type.color)} />
                  </div>
                  <p className="font-medium text-foreground text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          {integrations.map((integ) => {
            const typeDef = getTypeDef(integ.type);
            const Icon = typeDef?.icon || Plug;
            return (
              <div
                key={integ.id}
                className={cn(
                  "bg-card border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors",
                  integ.is_active ? "border-border" : "border-border/50 opacity-60"
                )}
              >
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", typeDef?.bg || "bg-muted")}>
                  <Icon className={cn("w-5 h-5", typeDef?.color || "text-muted-foreground")} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{integ.name}</p>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      integ.is_active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                    )}>
                      {integ.is_active ? "Ativo" : "Pausado"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground capitalize">{typeDef?.label}</span>
                    {integ.events.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {integ.events.length} evento{integ.events.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {integ.trigger_count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {integ.trigger_count}x disparado
                      </span>
                    )}
                    {integ.last_triggered_at && (
                      <span className="text-xs text-muted-foreground/60">
                        · Último: {formatDateTime(integ.last_triggered_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggle(integ)}
                    className={cn(
                      "p-1.5 rounded transition-colors",
                      integ.is_active
                        ? "text-green-500 hover:bg-green-500/10"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                    title={integ.is_active ? "Pausar" : "Ativar"}
                  >
                    {integ.is_active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => openEdit(integ)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(integ.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add more button */}
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar integração
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-semibold text-foreground">
                {editingId ? "Editar Integração" : step === "type" ? "Escolher Integração" : "Configurar Integração"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Choose type */}
            {step === "type" && !editingId && (
              <div className="p-5 space-y-2">
                {INTEGRATION_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => selectType(type.value)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", type.bg)}>
                        <Icon className={cn("w-4.5 h-4.5", type.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: Configure */}
            {step === "config" && (
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
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                {/* Type-specific fields */}
                {formType === "webhook" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      URL do Webhook *
                    </label>
                    <input
                      type="url"
                      value={formConfig.url || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, url: e.target.value })}
                      placeholder="https://exemplo.com/webhook"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="mt-3 bg-muted/50 border border-border rounded-lg p-3">
                      <p className="text-xs font-medium text-foreground mb-1">URL para receber webhooks:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs text-muted-foreground bg-background rounded px-2 py-1 truncate">
                          {webhookReceiveUrl}
                        </code>
                        <button
                          type="button"
                          onClick={copyWebhookUrl}
                          className="shrink-0 text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {formType === "slack" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Slack Webhook URL *
                      </label>
                      <input
                        type="url"
                        value={formConfig.webhook_url || ""}
                        onChange={(e) => setFormConfig({ ...formConfig, webhook_url: e.target.value })}
                        placeholder="https://hooks.slack.com/services/..."
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-0.5">
                          Como criar um Webhook no Slack <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Canal (opcional)
                      </label>
                      <input
                        type="text"
                        value={formConfig.channel || ""}
                        onChange={(e) => setFormConfig({ ...formConfig, channel: e.target.value })}
                        placeholder="#geral"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </>
                )}

                {formType === "google_calendar" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Calendar ID
                    </label>
                    <input
                      type="text"
                      value={formConfig.calendar_id || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, calendar_id: e.target.value })}
                      placeholder="seu-email@gmail.com"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Integração via Google Calendar API (requer configuração OAuth)
                    </p>
                  </div>
                )}

                {formType === "github" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Repositório *
                      </label>
                      <input
                        type="text"
                        value={formConfig.repo || ""}
                        onChange={(e) => setFormConfig({ ...formConfig, repo: e.target.value })}
                        placeholder="usuario/repositorio"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Token de Acesso
                      </label>
                      <input
                        type="password"
                        value={formConfig.token || ""}
                        onChange={(e) => setFormConfig({ ...formConfig, token: e.target.value })}
                        placeholder="ghp_..."
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-0.5">
                          Criar token no GitHub <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>
                  </>
                )}

                {formType === "email_notify" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Destinatários *
                    </label>
                    <input
                      type="text"
                      value={formConfig.recipients || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, recipients: e.target.value })}
                      placeholder="email1@exemplo.com, email2@exemplo.com"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Separe múltiplos emails por vírgula
                    </p>
                  </div>
                )}

                {/* Events to listen */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Eventos para monitorar
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EVENT_OPTIONS.map((evt) => {
                      const isActive = formEvents.has(evt.value);
                      return (
                        <button
                          key={evt.value}
                          type="button"
                          onClick={() => toggleEvent(evt.value)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                            isActive
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          )}
                        >
                          {isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                          )}
                          {evt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingId && step === "config") setStep("type");
                      else setShowModal(false);
                    }}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {!editingId && step === "config" ? "Voltar" : "Cancelar"}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formName.trim()}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingId ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
    </PermissionGuard>
  );
}
