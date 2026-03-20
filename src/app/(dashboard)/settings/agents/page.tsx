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
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

const PERSONALITY_OPTIONS = [
  { value: "helpful", label: "Assistente", description: "Responde perguntas e ajuda com tarefas", icon: "🤖" },
  { value: "formal", label: "Formal", description: "Linguagem profissional e objetiva", icon: "👔" },
  { value: "friendly", label: "Amigável", description: "Tom casual e encorajador", icon: "😊" },
  { value: "technical", label: "Técnico", description: "Foco em detalhes técnicos e precisão", icon: "⚙️" },
  { value: "creative", label: "Criativo", description: "Sugestões criativas e brainstorming", icon: "🎨" },
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

interface ChannelOption {
  id: string;
  name: string;
  type: string;
}

export default function AgentsSettingsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal
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

  // Test
  const [testingAgent, setTestingAgent] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);

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

      // Call the agent respond endpoint with a test channel
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
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Agente
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Agent List */}
      {agents.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum agente IA configurado</p>
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
              <p className="text-xs text-foreground font-medium">Sugerir soluções</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
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

      {/* Create/Edit Modal */}
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
                  Instruções personalizadas
                </label>
                <textarea
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="Ex: Sempre responda em português. Foque em ajudar com gestão de projetos. Sugira uso de boards e tarefas quando apropriado."
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Instruções que definem como o agente deve se comportar
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
                    Resposta automática
                  </label>
                  <p className="text-xs text-muted-foreground">
                    O agente responderá automaticamente quando detectar as keywords
                  </p>
                </div>
              </div>

              {/* Trigger keywords */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Keywords de ativação
                </label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="ajuda, tarefa, board, suporte"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separe por vírgula. O agente será ativado quando estas palavras aparecerem
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
    </div>
  );
}
