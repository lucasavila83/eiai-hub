"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Plus,
  X,
  Loader2,
  Trash2,
  Pencil,
  Play,
  Pause,
  MessageSquare,
  Zap,
  Brain,
  Sparkles,
  Hash,
  Lock,
  Globe,
  Plug,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

const PERSONALITY_OPTIONS = [
  { value: "helpful", label: "Assistente", description: "Responde perguntas e ajuda com tarefas", icon: "\u{1F916}" },
  { value: "formal", label: "Formal", description: "Linguagem profissional e objetiva", icon: "\u{1F454}" },
  { value: "friendly", label: "Amigavel", description: "Tom casual e encorajador", icon: "\u{1F60A}" },
  { value: "technical", label: "Tecnico", description: "Foco em detalhes tecnicos e precisao", icon: "\u{2699}\u{FE0F}" },
  { value: "creative", label: "Criativo", description: "Sugestoes criativas e brainstorming", icon: "\u{1F3A8}" },
];

const PROVIDER_OPTIONS = [
  { value: "openclaw", label: "OpenClaw", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { value: "openai_assistants", label: "OpenAI Assistants", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "custom_api", label: "Custom API", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  { value: "outro", label: "Outro", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
];

interface AgentRow {
  id: string;
  org_id: string;
  profile_id: string | null;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
  personality: string;
  instructions: string | null;
  auto_respond: boolean;
  respond_in_channels: string[];
  trigger_keywords: string[];
  created_by: string | null;
  created_at: string;
}

interface ExternalAgentConfig {
  type: "external";
  provider: string;
  api_endpoint: string;
  api_key: string;
  model_id: string;
  can_execute_tasks: boolean;
  avatar_url?: string;
}

interface ChannelOption {
  id: string;
  name: string;
  type: string;
}

type TabKey = "internal" | "external";

function parseExternalConfig(instructions: string | null): ExternalAgentConfig | null {
  if (!instructions) return null;
  try {
    const parsed = JSON.parse(instructions);
    if (parsed?.type === "external") return parsed as ExternalAgentConfig;
  } catch {
    // not JSON or not external
  }
  return null;
}

function isExternalAgent(agent: AgentRow): boolean {
  return parseExternalConfig(agent.instructions) !== null;
}

function getProviderDef(provider: string) {
  return PROVIDER_OPTIONS.find((o) => o.value === provider) || PROVIDER_OPTIONS[3];
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

export default function AgentsSettingsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("internal");

  // Internal agent modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPersonality, setFormPersonality] = useState("helpful");
  const [formInstructions, setFormInstructions] = useState("");
  const [formAutoRespond, setFormAutoRespond] = useState(false);
  const [formChannels, setFormChannels] = useState<Set<string>>(new Set());
  const [formKeywords, setFormKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // External agent modal
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [editingExternalId, setEditingExternalId] = useState<string | null>(null);
  const [extName, setExtName] = useState("");
  const [extDesc, setExtDesc] = useState("");
  const [extProvider, setExtProvider] = useState("openclaw");
  const [extEndpoint, setExtEndpoint] = useState("");
  const [extApiKey, setExtApiKey] = useState("");
  const [extModelId, setExtModelId] = useState("");
  const [extAvatarUrl, setExtAvatarUrl] = useState("");
  const [extAutoRespond, setExtAutoRespond] = useState(false);
  const [extChannels, setExtChannels] = useState<Set<string>>(new Set());
  const [extKeywords, setExtKeywords] = useState("");
  const [extCanExecuteTasks, setExtCanExecuteTasks] = useState(false);
  const [extShowApiKey, setExtShowApiKey] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);
  const [errorExternal, setErrorExternal] = useState<string | null>(null);

  // Test (internal)
  const [testingAgent, setTestingAgent] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);

  // Test (external)
  const [testingExtAgent, setTestingExtAgent] = useState<string | null>(null);
  const [extTestInput, setExtTestInput] = useState("");
  const [extTestOutput, setExtTestOutput] = useState("");
  const [extTesting, setExtTesting] = useState(false);
  const [extConnectionStatus, setExtConnectionStatus] = useState<Record<string, "idle" | "testing" | "ok" | "error">>({});

  useEffect(() => {
    if (activeOrgId) loadData();
  }, [activeOrgId]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const [agentsRes, channelsRes] = await Promise.all([
      supabase
        .from("ai_agents")
        .select("*")
        .eq("org_id", activeOrgId!)
        .order("created_at", { ascending: false }),
      supabase
        .from("channels")
        .select("id, name, type")
        .eq("org_id", activeOrgId!)
        .eq("is_archived", false)
        .neq("type", "dm")
        .order("name"),
    ]);

    setAgents(agentsRes.data || []);
    setChannels(channelsRes.data || []);
    setLoading(false);
  }

  const internalAgents = agents.filter((a) => !isExternalAgent(a));
  const externalAgents = agents.filter((a) => isExternalAgent(a));

  // --- Internal agent functions ---

  function openCreate() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormPersonality("helpful");
    setFormInstructions("");
    setFormAutoRespond(false);
    setFormChannels(new Set());
    setFormKeywords("");
    setError(null);
    setShowModal(true);
  }

  function openEdit(agent: AgentRow) {
    setEditingId(agent.id);
    setFormName(agent.name);
    setFormDesc(agent.description || "");
    setFormPersonality(agent.personality);
    setFormInstructions(agent.instructions || "");
    setFormAutoRespond(agent.auto_respond);
    setFormChannels(new Set(agent.respond_in_channels || []));
    setFormKeywords((agent.trigger_keywords || []).join(", "));
    setError(null);
    setShowModal(true);
  }

  function toggleChannel(channelId: string) {
    setFormChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !activeOrgId || !currentUserId) return;

    setSaving(true);
    setError(null);

    const keywords = formKeywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from("ai_agents")
          .update({
            name: formName.trim(),
            description: formDesc.trim() || null,
            personality: formPersonality,
            instructions: formInstructions.trim() || null,
            auto_respond: formAutoRespond,
            respond_in_channels: Array.from(formChannels),
            trigger_keywords: keywords,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (err) throw err;
      } else {
        // Create a profile for the agent
        const { data: agentProfile, error: profileErr } = await supabase
          .from("profiles")
          .insert({
            id: crypto.randomUUID(),
            email: `${formName.trim().toLowerCase().replace(/\s+/g, "-")}@agent.eiai.hub`,
            full_name: formName.trim(),
            is_ai_agent: true,
            agent_config: { personality: formPersonality },
            status: "online" as const,
            last_seen_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (profileErr) throw profileErr;

        const { error: err } = await supabase.from("ai_agents").insert({
          org_id: activeOrgId,
          profile_id: agentProfile?.id || null,
          name: formName.trim(),
          description: formDesc.trim() || null,
          is_active: true,
          personality: formPersonality,
          instructions: formInstructions.trim() || null,
          auto_respond: formAutoRespond,
          respond_in_channels: Array.from(formChannels),
          trigger_keywords: keywords,
          created_by: currentUserId,
        });
        if (err) throw err;
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar agente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(agent: AgentRow) {
    await supabase
      .from("ai_agents")
      .update({ is_active: !agent.is_active })
      .eq("id", agent.id);
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, is_active: !a.is_active } : a))
    );
  }

  async function handleDelete(agent: AgentRow) {
    if (!confirm(`Tem certeza que deseja deletar o agente "${agent.name}"?`)) return;
    await supabase.from("ai_agents").delete().eq("id", agent.id);
    setAgents((prev) => prev.filter((a) => a.id !== agent.id));
  }

  async function handleTest() {
    if (!testInput.trim() || !testingAgent) return;
    setTesting(true);
    setTestOutput("");

    try {
      const agent = agents.find((a) => a.id === testingAgent);
      if (!agent) return;

      const res = await fetch("/api/agents/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: "test",
          messageContent: testInput,
          agentId: agent.profile_id || "test",
          personality: agent.personality,
          instructions: agent.instructions,
          testMode: true,
        }),
      });

      const data = await res.json();
      setTestOutput(data.response || data.error || "Sem resposta");
    } catch {
      setTestOutput("Erro ao testar o agente.");
    } finally {
      setTesting(false);
    }
  }

  // --- External agent functions ---

  function openCreateExternal() {
    setEditingExternalId(null);
    setExtName("");
    setExtDesc("");
    setExtProvider("openclaw");
    setExtEndpoint("");
    setExtApiKey("");
    setExtModelId("");
    setExtAvatarUrl("");
    setExtAutoRespond(false);
    setExtChannels(new Set());
    setExtKeywords("");
    setExtCanExecuteTasks(false);
    setExtShowApiKey(false);
    setErrorExternal(null);
    setShowExternalModal(true);
  }

  function openEditExternal(agent: AgentRow) {
    const config = parseExternalConfig(agent.instructions);
    if (!config) return;

    setEditingExternalId(agent.id);
    setExtName(agent.name);
    setExtDesc(agent.description || "");
    setExtProvider(config.provider);
    setExtEndpoint(config.api_endpoint);
    setExtApiKey(config.api_key);
    setExtModelId(config.model_id);
    setExtAvatarUrl(config.avatar_url || "");
    setExtAutoRespond(agent.auto_respond);
    setExtChannels(new Set(agent.respond_in_channels || []));
    setExtKeywords((agent.trigger_keywords || []).join(", "));
    setExtCanExecuteTasks(config.can_execute_tasks);
    setExtShowApiKey(false);
    setErrorExternal(null);
    setShowExternalModal(true);
  }

  function toggleExtChannel(channelId: string) {
    setExtChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  }

  async function handleSaveExternal(e: React.FormEvent) {
    e.preventDefault();
    if (!extName.trim() || !extEndpoint.trim() || !activeOrgId || !currentUserId) return;

    setSavingExternal(true);
    setErrorExternal(null);

    const keywords = extKeywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const externalConfig: ExternalAgentConfig = {
      type: "external",
      provider: extProvider,
      api_endpoint: extEndpoint.trim(),
      api_key: extApiKey.trim(),
      model_id: extModelId.trim(),
      can_execute_tasks: extCanExecuteTasks,
      ...(extAvatarUrl.trim() ? { avatar_url: extAvatarUrl.trim() } : {}),
    };

    const instructionsJson = JSON.stringify(externalConfig);

    try {
      if (editingExternalId) {
        const { error: err } = await supabase
          .from("ai_agents")
          .update({
            name: extName.trim(),
            description: extDesc.trim() || null,
            personality: "helpful",
            instructions: instructionsJson,
            auto_respond: extAutoRespond,
            respond_in_channels: Array.from(extChannels),
            trigger_keywords: keywords,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingExternalId);
        if (err) throw err;
      } else {
        const { data: agentProfile, error: profileErr } = await supabase
          .from("profiles")
          .insert({
            id: crypto.randomUUID(),
            email: `${extName.trim().toLowerCase().replace(/\s+/g, "-")}-ext@agent.eiai.hub`,
            full_name: extName.trim(),
            is_ai_agent: true,
            agent_config: {
              personality: "helpful",
              type: "external",
              provider: extProvider,
            },
            status: "online" as const,
            last_seen_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (profileErr) throw profileErr;

        const { error: err } = await supabase.from("ai_agents").insert({
          org_id: activeOrgId,
          profile_id: agentProfile?.id || null,
          name: extName.trim(),
          description: extDesc.trim() || null,
          is_active: true,
          personality: "helpful",
          instructions: instructionsJson,
          auto_respond: extAutoRespond,
          respond_in_channels: Array.from(extChannels),
          trigger_keywords: keywords,
          created_by: currentUserId,
        });
        if (err) throw err;
      }

      setShowExternalModal(false);
      await loadData();
    } catch (err: any) {
      setErrorExternal(err.message || "Erro ao salvar agente externo.");
    } finally {
      setSavingExternal(false);
    }
  }

  async function handleTestConnection(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    const config = parseExternalConfig(agent.instructions);
    if (!config) return;

    setExtConnectionStatus((prev) => ({ ...prev, [agentId]: "testing" }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(config.api_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
        },
        body: JSON.stringify({
          message: "ping",
          test: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setExtConnectionStatus((prev) => ({
        ...prev,
        [agentId]: res.ok ? "ok" : "error",
      }));
    } catch {
      setExtConnectionStatus((prev) => ({ ...prev, [agentId]: "error" }));
    }
  }

  async function handleTestExternal() {
    if (!extTestInput.trim() || !testingExtAgent) return;
    setExtTesting(true);
    setExtTestOutput("");

    try {
      const agent = agents.find((a) => a.id === testingExtAgent);
      if (!agent) return;
      const config = parseExternalConfig(agent.instructions);
      if (!config) {
        setExtTestOutput("Configuracao externa invalida.");
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(config.api_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
        },
        body: JSON.stringify({
          message: extTestInput,
          model_id: config.model_id || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        setExtTestOutput(`Erro HTTP ${res.status}: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      setExtTestOutput(
        data.response || data.message || data.content || data.output || JSON.stringify(data, null, 2)
      );
    } catch (err: any) {
      if (err.name === "AbortError") {
        setExtTestOutput("Timeout: o agente nao respondeu em 30 segundos.");
      } else {
        setExtTestOutput("Erro ao testar o agente externo.");
      }
    } finally {
      setExtTesting(false);
    }
  }

  const getPersonalityDef = (p: string) =>
    PERSONALITY_OPTIONS.find((o) => o.value === p) || PERSONALITY_OPTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Agentes IA</h1>
          <p className="text-sm text-muted-foreground">
            Configure assistentes inteligentes para seus canais
          </p>
        </div>
        <button
          onClick={activeTab === "internal" ? openCreate : openCreateExternal}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {activeTab === "internal" ? "Novo Agente" : "Novo Agente Externo"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/50 border border-border rounded-lg p-1">
        <button
          onClick={() => setActiveTab("internal")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            activeTab === "internal"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bot className="w-4 h-4" />
          Agentes Internos
          {internalAgents.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              {internalAgents.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("external")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            activeTab === "external"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="w-4 h-4" />
          Agentes Externos
          {externalAgents.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              {externalAgents.length}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ===== INTERNAL AGENTS TAB ===== */}
      {activeTab === "internal" && (
        <>
          {internalAgents.length === 0 ? (
            <div className="text-center py-16">
              <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum agente IA interno configurado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Crie agentes para responder automaticamente nos seus canais
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <MessageSquare className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">Responder perguntas</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <Zap className="w-5 h-5 text-yellow-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">Automatizar tarefas</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <Brain className="w-5 h-5 text-purple-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">Sugerir solucoes</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {internalAgents.map((agent) => {
                const personality = getPersonalityDef(agent.personality);
                const isTesting = testingAgent === agent.id;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "bg-card border rounded-xl overflow-hidden transition-colors",
                      agent.is_active ? "border-border" : "border-border/50 opacity-60"
                    )}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: generateColor(agent.name) }}
                      >
                        <Bot className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                          <span className="text-xs">{personality.icon}</span>
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                            agent.is_active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                          )}>
                            {agent.is_active ? "Ativo" : "Pausado"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {agent.description && (
                            <span className="text-xs text-muted-foreground truncate">{agent.description}</span>
                          )}
                          {agent.auto_respond && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                              Auto-resposta
                            </span>
                          )}
                          {agent.trigger_keywords.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              · {agent.trigger_keywords.length} keyword{agent.trigger_keywords.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {agent.respond_in_channels.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              · {agent.respond_in_channels.length} canal{agent.respond_in_channels.length !== 1 ? "is" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setTestingAgent(isTesting ? null : agent.id)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            isTesting ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                          title="Testar"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggle(agent)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            agent.is_active ? "text-green-500 hover:bg-green-500/10" : "text-muted-foreground hover:bg-accent"
                          )}
                          title={agent.is_active ? "Pausar" : "Ativar"}
                        >
                          {agent.is_active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => openEdit(agent)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(agent)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Test Panel */}
                    {isTesting && (
                      <div className="border-t border-border px-4 py-3 bg-background/50">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Testar agente
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={testInput}
                            onChange={(e) => setTestInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleTest()}
                            placeholder="Digite uma mensagem para testar..."
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            autoFocus
                          />
                          <button
                            onClick={handleTest}
                            disabled={testing || !testInput.trim()}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
                          </button>
                        </div>
                        {testOutput && (
                          <div className="mt-2 bg-card border border-border rounded-lg px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Bot className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium text-primary">{agent.name}</span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{testOutput}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===== EXTERNAL AGENTS TAB ===== */}
      {activeTab === "external" && (
        <>
          {externalAgents.length === 0 ? (
            <div className="text-center py-16">
              <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum agente externo configurado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Conecte agentes de servicos como OpenClaw, OpenAI Assistants ou APIs customizadas
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <Plug className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">OpenClaw</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <Brain className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">OpenAI Assistants</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <ExternalLink className="w-5 h-5 text-purple-500 mx-auto mb-1.5" />
                  <p className="text-xs text-foreground font-medium">Custom API</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {externalAgents.map((agent) => {
                const config = parseExternalConfig(agent.instructions)!;
                const providerDef = getProviderDef(config.provider);
                const isTestingExt = testingExtAgent === agent.id;
                const connStatus = extConnectionStatus[agent.id] || "idle";

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "bg-card border rounded-xl overflow-hidden transition-colors",
                      agent.is_active ? "border-border" : "border-border/50 opacity-60"
                    )}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: generateColor(agent.name) }}
                      >
                        <Globe className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            providerDef.color
                          )}>
                            {providerDef.label}
                          </span>
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                            agent.is_active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                          )}>
                            {agent.is_active ? "Ativo" : "Pausado"}
                          </span>
                          {/* Connection status indicator */}
                          {connStatus === "ok" && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          )}
                          {connStatus === "error" && (
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                          )}
                          {connStatus === "testing" && (
                            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {agent.description && (
                            <span className="text-xs text-muted-foreground truncate">{agent.description}</span>
                          )}
                          {agent.auto_respond && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                              Auto-resposta
                            </span>
                          )}
                          {config.can_execute_tasks && (
                            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded font-medium">
                              Executa tarefas
                            </span>
                          )}
                          {agent.trigger_keywords.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              · {agent.trigger_keywords.length} keyword{agent.trigger_keywords.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {config.model_id && (
                            <span className="text-xs text-muted-foreground truncate">
                              · {config.model_id}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleTestConnection(agent.id)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                          title="Testar conexao"
                          disabled={connStatus === "testing"}
                        >
                          <Plug className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setTestingExtAgent(isTestingExt ? null : agent.id);
                            setExtTestOutput("");
                            setExtTestInput("");
                          }}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            isTestingExt ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                          title="Testar"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggle(agent)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            agent.is_active ? "text-green-500 hover:bg-green-500/10" : "text-muted-foreground hover:bg-accent"
                          )}
                          title={agent.is_active ? "Pausar" : "Ativar"}
                        >
                          {agent.is_active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => openEditExternal(agent)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(agent)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* External Test Panel */}
                    {isTestingExt && (
                      <div className="border-t border-border px-4 py-3 bg-background/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Testar agente externo
                          </p>
                          <button
                            onClick={() => handleTestConnection(agent.id)}
                            disabled={connStatus === "testing"}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {connStatus === "testing" ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : connStatus === "ok" ? (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            ) : connStatus === "error" ? (
                              <XCircle className="w-3 h-3 text-red-500" />
                            ) : (
                              <Plug className="w-3 h-3" />
                            )}
                            Testar conexao
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={extTestInput}
                            onChange={(e) => setExtTestInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleTestExternal()}
                            placeholder="Digite uma mensagem para testar..."
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            autoFocus
                          />
                          <button
                            onClick={handleTestExternal}
                            disabled={extTesting || !extTestInput.trim()}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {extTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
                          </button>
                        </div>
                        {extTestOutput && (
                          <div className="mt-2 bg-card border border-border rounded-lg px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Globe className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium text-primary">{agent.name}</span>
                              <span className={cn("text-[9px] px-1 py-0.5 rounded border", providerDef.color)}>
                                {providerDef.label}
                              </span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{extTestOutput}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Placeholder note */}
          <div className="mt-6 bg-muted/30 border border-border rounded-xl px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Em breve:</span>{" "}
                Os agentes externos poderao executar tarefas diretamente nos seus boards, criar subtarefas,
                atualizar status e interagir via chat.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ===== INTERNAL AGENT MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-semibold text-foreground">
                {editingId ? "Editar Agente" : "Novo Agente IA"}
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
                  Nome do agente *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Assistente de Projetos, Bot de Suporte"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="O que este agente faz?"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Personality */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Personalidade
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {PERSONALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormPersonality(opt.value)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                        formPersonality === opt.value
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      )}
                    >
                      <span className="text-lg">{opt.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs opacity-70">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Instrucoes personalizadas
                </label>
                <textarea
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="Ex: Sempre responda em portugues. Foque em ajudar com gestao de projetos. Sugira uso de boards e tarefas quando apropriado."
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Instrucoes que definem como o agente deve se comportar
                </p>
              </div>

              {/* Auto respond */}
              <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
                <input
                  type="checkbox"
                  id="autoRespond"
                  checked={formAutoRespond}
                  onChange={(e) => setFormAutoRespond(e.target.checked)}
                  className="rounded border-border"
                />
                <div>
                  <label htmlFor="autoRespond" className="text-sm font-medium text-foreground cursor-pointer">
                    Resposta automatica
                  </label>
                  <p className="text-xs text-muted-foreground">
                    O agente respondera automaticamente quando detectar as keywords
                  </p>
                </div>
              </div>

              {/* Trigger keywords */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Keywords de ativacao
                </label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="ajuda, tarefa, board, suporte"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separe por virgula. O agente sera ativado quando estas palavras aparecerem
                </p>
              </div>

              {/* Channels */}
              {channels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Canais ativos
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {channels.map((ch) => {
                      const isActive = formChannels.has(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleChannel(ch.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                            isActive
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {ch.type === "private" ? (
                            <Lock className="w-3 h-3 shrink-0" />
                          ) : (
                            <Hash className="w-3 h-3 shrink-0" />
                          )}
                          <span className="truncate">{ch.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione em quais canais o agente pode responder. Vazio = todos
                  </p>
                </div>
              )}

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
                  disabled={saving || !formName.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? "Salvar" : "Criar Agente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EXTERNAL AGENT MODAL ===== */}
      {showExternalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">
                  {editingExternalId ? "Editar Agente Externo" : "Novo Agente Externo"}
                </h3>
              </div>
              <button
                onClick={() => setShowExternalModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExternal} className="p-5 space-y-4">
              {errorExternal && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                  {errorExternal}
                </div>
              )}

              {/* Agent Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome do Agente *
                </label>
                <input
                  type="text"
                  value={extName}
                  onChange={(e) => setExtName(e.target.value)}
                  placeholder="Ex: Assistente OpenClaw, GPT Suporte"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Provedor *
                </label>
                <select
                  value={extProvider}
                  onChange={(e) => setExtProvider(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Endpoint */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  API Endpoint / URL *
                </label>
                <input
                  type="url"
                  value={extEndpoint}
                  onChange={(e) => setExtEndpoint(e.target.value)}
                  placeholder="https://api.openclaw.com/v1/chat"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  API Key / Token
                </label>
                <div className="relative">
                  <input
                    type={extShowApiKey ? "text" : "password"}
                    value={extApiKey}
                    onChange={(e) => setExtApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setExtShowApiKey(!extShowApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {extShowApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Model / Assistant ID */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Model / Assistant ID
                </label>
                <input
                  type="text"
                  value={extModelId}
                  onChange={(e) => setExtModelId(e.target.value)}
                  placeholder="asst_abc123 ou gpt-4o"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Descrição
                </label>
                <textarea
                  value={extDesc}
                  onChange={(e) => setExtDesc(e.target.value)}
                  placeholder="O que este agente externo faz?"
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Avatar URL */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Avatar URL <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="url"
                  value={extAvatarUrl}
                  onChange={(e) => setExtAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                {/* Auto respond toggle */}
                <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
                  <input
                    type="checkbox"
                    id="extAutoRespond"
                    checked={extAutoRespond}
                    onChange={(e) => setExtAutoRespond(e.target.checked)}
                    className="rounded border-border"
                  />
                  <div>
                    <label htmlFor="extAutoRespond" className="text-sm font-medium text-foreground cursor-pointer">
                      Auto-responder em canais
                    </label>
                    <p className="text-xs text-muted-foreground">
                      O agente respondera automaticamente quando detectar as keywords
                    </p>
                  </div>
                </div>

                {/* Execute tasks toggle */}
                <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
                  <input
                    type="checkbox"
                    id="extCanExecuteTasks"
                    checked={extCanExecuteTasks}
                    onChange={(e) => setExtCanExecuteTasks(e.target.checked)}
                    className="rounded border-border"
                  />
                  <div>
                    <label htmlFor="extCanExecuteTasks" className="text-sm font-medium text-foreground cursor-pointer">
                      Executar tarefas automaticamente
                    </label>
                    <p className="text-xs text-muted-foreground">
                      O agente podera atualizar cards, criar subtarefas e executar acoes nos boards
                    </p>
                  </div>
                </div>
              </div>

              {/* Trigger keywords */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Keywords de ativacao
                </label>
                <input
                  type="text"
                  value={extKeywords}
                  onChange={(e) => setExtKeywords(e.target.value)}
                  placeholder="ajuda, suporte, openclaw"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separe por virgula. O agente sera ativado quando estas palavras aparecerem
                </p>
              </div>

              {/* Channels */}
              {extAutoRespond && channels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Canais ativos
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {channels.map((ch) => {
                      const isActive = extChannels.has(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleExtChannel(ch.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left",
                            isActive
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {ch.type === "private" ? (
                            <Lock className="w-3 h-3 shrink-0" />
                          ) : (
                            <Hash className="w-3 h-3 shrink-0" />
                          )}
                          <span className="truncate">{ch.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione em quais canais o agente pode responder. Vazio = todos
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExternalModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingExternal || !extName.trim() || !extEndpoint.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingExternal && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingExternalId ? "Salvar" : "Criar Agente Externo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
