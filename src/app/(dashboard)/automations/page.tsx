"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import {
  Zap,
  Loader2,
  ArrowLeft,
  History,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  X,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils/helpers";
import { TemplateManager } from "@/components/automations/TemplateManager";
import { AutomationBuilder, type Automation } from "@/components/bpm/AutomationBuilder";

interface LogRow {
  id: string;
  automation_id: string;
  card_id: string | null;
  bpm_card_id: string | null;
  status: string;
  details: string | null;
  details_json: any;
  created_at: string;
}

export default function AutomationsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [activeTab, setActiveTab] = useState<"automations" | "templates">("automations");
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [columns, setColumns] = useState<{ id: string; name: string; board_id: string }[]>([]);
  const [pipes, setPipes] = useState<{ id: string; name: string }[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Logs
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Filter
  const [filter, setFilter] = useState<"all" | "board" | "bpm">("all");

  useEffect(() => {
    if (activeOrgId) loadData();
  }, [activeOrgId]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const [autoRes, boardsRes, pipesRes, membersRes] = await Promise.all([
      supabase
        .from("automations")
        .select("*")
        .eq("org_id", activeOrgId!)
        .order("created_at", { ascending: false }),
      supabase
        .from("boards")
        .select("id, name")
        .eq("org_id", activeOrgId!)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("bpm_pipes")
        .select("id, name")
        .eq("org_id", activeOrgId!)
        .order("name"),
      supabase
        .from("org_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("org_id", activeOrgId!),
    ]);

    const orgBoards = boardsRes.data || [];
    const boardIds = orgBoards.map((b) => b.id);
    const safeBoardIds = boardIds.length > 0 ? boardIds : ["00000000-0000-0000-0000-000000000000"];

    const pipesList = pipesRes.data || [];
    const pipeIds = pipesList.map((p) => p.id);
    const safePipeIds = pipeIds.length > 0 ? pipeIds : ["00000000-0000-0000-0000-000000000000"];

    const [colsRes, phasesRes] = await Promise.all([
      supabase
        .from("columns")
        .select("id, name, board_id")
        .in("board_id", safeBoardIds)
        .order("position"),
      supabase
        .from("bpm_phases")
        .select("id, name, pipe_id, color, position")
        .in("pipe_id", safePipeIds)
        .order("position"),
    ]);

    const phasesList = phasesRes?.data || [];

    // Load fields across all phases (sequential — depends on phasesRes)
    let allFields: any[] = [];
    if (phasesList.length > 0) {
      const phaseIds = phasesList.map((p: any) => p.id);
      const { data: fData } = await supabase
        .from("bpm_fields")
        .select("id, phase_id, field_key, field_type, label, options")
        .in("phase_id", phaseIds);
      allFields = (fData || []).map((f: any) => ({ ...f, options: f.options || [] }));
    }

    setAutomations(autoRes.data || []);
    setBoards(orgBoards);
    setColumns(colsRes.data || []);
    setPipes(pipesList);
    setPhases(phasesList);
    setFields(allFields);
    setMembers(
      (membersRes.data || []).map((m: any) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name,
        email: m.profiles?.email,
      }))
    );
    setLoading(false);
  }

  async function handleAdd(auto: Partial<Automation>) {
    if (!activeOrgId || !currentUserId) return;
    const { error } = await supabase.from("automations").insert({
      org_id: activeOrgId,
      name: auto.name,
      board_id: auto.board_id || null,
      pipe_id: auto.pipe_id || null,
      phase_id: auto.phase_id || null,
      trigger_type: auto.trigger_type,
      trigger_config: auto.trigger_config || {},
      action_type: auto.action_type,
      action_config: auto.action_config || {},
      condition: auto.condition || null,
      is_active: true,
      created_by: currentUserId,
    });
    if (!error) await loadData();
  }

  async function handleSave(auto: Automation) {
    await supabase
      .from("automations")
      .update({
        name: auto.name,
        trigger_type: auto.trigger_type,
        trigger_config: auto.trigger_config || {},
        action_type: auto.action_type,
        action_config: auto.action_config || {},
        condition: auto.condition || null,
        board_id: auto.board_id || null,
        pipe_id: auto.pipe_id || null,
        phase_id: auto.phase_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auto.id);
    await loadData();
  }

  async function handleDelete(id: string) {
    await supabase.from("automation_logs").delete().eq("automation_id", id);
    await supabase.from("automations").delete().eq("id", id);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleToggle(id: string, active: boolean) {
    await supabase.from("automations").update({ is_active: active }).eq("id", id);
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: active } : a)));
  }

  async function loadLogs(automationId: string) {
    if (showLogs === automationId) { setShowLogs(null); return; }
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

  // Filtered automations
  const filteredAutomations = automations.filter((a) => {
    if (filter === "board") return !!a.board_id && !a.pipe_id;
    if (filter === "bpm") return !!a.pipe_id;
    return true;
  });

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
            className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <Zap className="w-6 h-6 text-yellow-500" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Automações</h1>
            <p className="text-sm text-muted-foreground">
              Central de automações — boards e processos
            </p>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
          <button
            onClick={() => setActiveTab("automations")}
            className={cn(
              "flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === "automations"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Automações
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={cn(
              "flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === "templates"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Templates
          </button>
        </div>

        {/* Templates Tab */}
        {activeTab === "templates" && currentUserId && activeOrgId && (
          <TemplateManager orgId={activeOrgId} currentUserId={currentUserId} />
        )}

        {/* Automations Tab */}
        {activeTab === "automations" && (
          <>
            {/* Filter pills */}
            <div className="flex gap-2 mb-4">
              {(["all", "board", "bpm"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border",
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {f === "all" ? "Todas" : f === "board" ? "Boards" : "Processos"}
                  <span className="ml-1.5 opacity-70">
                    {f === "all"
                      ? automations.length
                      : f === "board"
                        ? automations.filter((a) => !!a.board_id && !a.pipe_id).length
                        : automations.filter((a) => !!a.pipe_id).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Automation Builder */}
            <AutomationBuilder
              automations={filteredAutomations}
              context="all"
              orgId={activeOrgId}
              boards={boards}
              columns={columns}
              phases={phases}
              fields={fields}
              members={members}
              onSave={handleSave}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />

            {/* Logs viewer */}
            {filteredAutomations.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Histórico de execuções</h3>
                <div className="space-y-1">
                  {filteredAutomations.slice(0, 10).map((auto) => (
                    <div key={auto.id}>
                      <button
                        onClick={() => loadLogs(auto.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span className="flex-1 text-left truncate">{auto.name}</span>
                        {auto.run_count != null && auto.run_count > 0 && (
                          <span className="text-[10px] opacity-60">{auto.run_count}x</span>
                        )}
                      </button>

                      {showLogs === auto.id && (
                        <div className="ml-6 mb-2 bg-background/50 border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Últimas execuções
                            </p>
                            <button onClick={() => setShowLogs(null)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {loadingLogs ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto my-3" />
                          ) : logs.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">Nenhuma execução registrada</p>
                          ) : (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {logs.map((log) => (
                                <div key={log.id} className="flex items-center gap-2 text-xs py-1">
                                  {log.status === "success" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                  ) : log.status === "skipped" ? (
                                    <SkipForward className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  )}
                                  <span className="text-muted-foreground flex-1 truncate">
                                    {log.details_json?.reason === "condition_not_met"
                                      ? "Condição não atendida"
                                      : log.details || (log.status === "success" ? "Executado com sucesso" : "Erro na execução")}
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
              </div>
            )}
          </>
        )}
      </div>
    </PermissionGuard>
  );
}
