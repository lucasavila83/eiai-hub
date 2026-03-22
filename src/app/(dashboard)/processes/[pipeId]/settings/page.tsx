"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { PhaseEditor, type Phase } from "@/components/bpm/PhaseEditor";
import { FieldConfigurator } from "@/components/bpm/FieldConfigurator";
import { AutomationBuilder, type Automation } from "@/components/bpm/AutomationBuilder";
import type { FieldDef } from "@/components/bpm/DynamicField";
import {
  ArrowLeft, Loader2, Workflow, Settings2, Layers, FileText, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

type SettingsTab = "phases" | "fields" | "automations";

export default function PipeSettingsPage() {
  return (
    <PermissionGuard permission="isAdmin" fallbackMessage="Você não tem permissão para configurar processos.">
      <PipeSettingsContent />
    </PermissionGuard>
  );
}

function PipeSettingsContent() {
  const { pipeId } = useParams<{ pipeId: string }>();
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const permissions = usePermissions();

  const [pipe, setPipe] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("phases");

  // Fields state
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // Automations state
  const [automations, setAutomations] = useState<Automation[]>([]);

  useEffect(() => {
    if (pipeId && activeOrgId) loadData();
  }, [pipeId, activeOrgId]);

  async function loadData() {
    setLoading(true);

    const [pipeRes, phasesRes, membersRes, autoRes] = await Promise.all([
      supabase.from("bpm_pipes").select("*").eq("id", pipeId).single(),
      supabase
        .from("bpm_phases")
        .select("*")
        .eq("pipe_id", pipeId)
        .order("position"),
      supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("org_id", activeOrgId!),
      supabase
        .from("bpm_automations")
        .select("*")
        .eq("pipe_id", pipeId)
        .order("created_at"),
    ]);

    if (pipeRes.data) setPipe(pipeRes.data);
    if (phasesRes.data) setPhases(phasesRes.data);
    if (autoRes.data) setAutomations(autoRes.data);
    if (membersRes.data) {
      setMembers(
        membersRes.data.map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name,
          email: m.profiles?.email,
          avatar_url: m.profiles?.avatar_url,
        }))
      );
    }

    setLoading(false);
  }

  // Load fields when phase selected
  async function loadFields(phaseId: string) {
    setLoadingFields(true);
    const { data } = await supabase
      .from("bpm_fields")
      .select("*")
      .eq("phase_id", phaseId)
      .order("position");
    setFields((data || []).map((f: any) => ({
      ...f,
      options: f.options || [],
      validations: f.validations || {},
    })));
    setLoadingFields(false);
  }

  function selectPhase(phaseId: string) {
    setSelectedPhaseId(phaseId);
    loadFields(phaseId);
  }

  async function handleSaveFields(updatedFields: FieldDef[]) {
    for (const field of updatedFields) {
      await supabase
        .from("bpm_fields")
        .update({
          label: field.label,
          placeholder: field.placeholder,
          help_text: field.help_text,
          is_required: field.is_required,
          options: field.options,
          position: field.position,
        })
        .eq("id", field.id);
    }
    setFields(updatedFields);
  }

  async function handleAddField(field: Omit<FieldDef, "id" | "phase_id">) {
    if (!selectedPhaseId) return;
    const { data } = await supabase
      .from("bpm_fields")
      .insert({ phase_id: selectedPhaseId, ...field })
      .select()
      .single();
    if (data) {
      setFields((prev) => [...prev, { ...data, options: data.options || [], validations: data.validations || {} }]);
    }
  }

  async function handleDeleteField(fieldId: string) {
    await supabase.from("bpm_fields").delete().eq("id", fieldId);
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  }

  // Automation handlers
  async function handleAddAutomation(auto: Omit<Automation, "id" | "pipe_id">) {
    const { data } = await supabase
      .from("bpm_automations")
      .insert({ pipe_id: pipeId, ...auto })
      .select()
      .single();
    if (data) setAutomations((prev) => [...prev, data]);
  }

  async function handleSaveAutomation(auto: Automation) {
    await supabase
      .from("bpm_automations")
      .update({ name: auto.name, trigger_type: auto.trigger_type, action_type: auto.action_type, phase_id: auto.phase_id, config: auto.config, is_active: auto.is_active, updated_at: new Date().toISOString() })
      .eq("id", auto.id);
    setAutomations((prev) => prev.map((a) => a.id === auto.id ? auto : a));
  }

  async function handleDeleteAutomation(id: string) {
    await supabase.from("bpm_automations").delete().eq("id", id);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleToggleAutomation(id: string, active: boolean) {
    await supabase.from("bpm_automations").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
    setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, is_active: active } : a));
  }

  async function handleSavePhases(updatedPhases: Phase[]) {
    // Update each phase
    for (const phase of updatedPhases) {
      await supabase
        .from("bpm_phases")
        .update({
          name: phase.name,
          description: phase.description,
          position: phase.position,
          sla_hours: phase.sla_hours,
          default_assignee_id: phase.default_assignee_id,
          is_start: phase.is_start,
          is_end: phase.is_end,
          color: phase.color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", phase.id);
    }
    setPhases(updatedPhases);
  }

  async function handleAddPhase(phase: Omit<Phase, "id" | "pipe_id">) {
    const { data, error } = await supabase
      .from("bpm_phases")
      .insert({
        pipe_id: pipeId,
        ...phase,
      })
      .select()
      .single();

    if (data) {
      setPhases((prev) => [...prev, data]);
    }
  }

  async function handleDeletePhase(phaseId: string) {
    await supabase.from("bpm_phases").delete().eq("id", phaseId);
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
  }

  if (loading || permissions.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pipe) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-muted-foreground">Processo não encontrado</p>
        <Link href="/processes" className="text-primary hover:underline text-sm">Voltar</Link>
      </div>
    );
  }

  const tabs: { key: SettingsTab; label: string; icon: any }[] = [
    { key: "phases", label: "Fases", icon: Layers },
    { key: "fields", label: "Campos", icon: FileText },
    { key: "automations", label: "Automações", icon: Zap },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/processes/${pipeId}`}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: pipe.color + "20" }}
        >
          <Workflow className="w-5 h-5" style={{ color: pipe.color }} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{pipe.name}</h1>
          <p className="text-sm text-muted-foreground">Configurações do processo</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-muted rounded-lg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center cursor-pointer",
                activeTab === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "phases" && (
        <PhaseEditor
          phases={phases}
          members={members}
          onSave={handleSavePhases}
          onAdd={handleAddPhase}
          onDelete={handleDeletePhase}
        />
      )}

      {activeTab === "fields" && (
        <div className="space-y-4">
          {phases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Layers className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Crie fases primeiro na aba "Fases"</p>
            </div>
          ) : (
            <>
              {/* Phase selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Selecione a fase para configurar campos:</label>
                <div className="flex flex-wrap gap-2">
                  {phases.map((phase) => (
                    <button
                      key={phase.id}
                      onClick={() => selectPhase(phase.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
                        selectedPhaseId === phase.id
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: phase.color }} />
                      {phase.name}
                      {selectedPhaseId === phase.id && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          {fields.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field configurator */}
              {selectedPhaseId ? (
                loadingFields ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <FieldConfigurator
                    fields={fields}
                    phaseName={phases.find((p) => p.id === selectedPhaseId)?.name || ""}
                    onSave={handleSaveFields}
                    onAdd={handleAddField}
                    onDelete={handleDeleteField}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Selecione uma fase acima para configurar seus campos</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "automations" && (
        <AutomationBuilder
          automations={automations}
          phases={phases}
          members={members}
          onSave={handleSaveAutomation}
          onAdd={handleAddAutomation}
          onDelete={handleDeleteAutomation}
          onToggle={handleToggleAutomation}
        />
      )}
    </div>
  );
}
