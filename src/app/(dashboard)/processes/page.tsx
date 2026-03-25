"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import Link from "next/link";
import {
  Workflow,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Settings2,
  X,
  Archive,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

const PIPE_ICONS = [
  "workflow", "git-branch", "repeat", "shuffle", "route",
  "clipboard-list", "file-check", "user-plus", "shopping-cart", "megaphone",
];

const PIPE_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6",
];

interface BpmPipe {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  card_count?: number;
  phase_count?: number;
}

export default function ProcessesPage() {
  return (
    <PermissionGuard permission="isAdmin" fallbackMessage="Você não tem permissão para acessar Processos. Solicite acesso a um administrador.">
      <ProcessesContent />
    </PermissionGuard>
  );
}

function ProcessesContent() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const { user } = useAuth();
  const permissions = usePermissions();
  const [pipes, setPipes] = useState<BpmPipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPipe, setEditingPipe] = useState<BpmPipe | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formIcon, setFormIcon] = useState(PIPE_ICONS[0]);
  const [formColor, setFormColor] = useState(PIPE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrgId) loadPipes();
  }, [activeOrgId]);

  // Realtime: auto-refresh when pipes change
  useEffect(() => {
    if (!activeOrgId) return;
    const sub = supabase
      .channel("pipes-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bpm_pipes", filter: `org_id=eq.${activeOrgId}` }, () => {
        loadPipes();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeOrgId]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenuId]);

  async function loadPipes() {
    setLoading(true);
    const { data } = await supabase
      .from("bpm_pipes")
      .select("*")
      .eq("org_id", activeOrgId!)
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (data) {
      // Count cards and phases for each pipe
      const pipesWithCounts = await Promise.all(
        data.map(async (pipe) => {
          const [cardsRes, phasesRes] = await Promise.all([
            supabase
              .from("bpm_cards")
              .select("id", { count: "exact", head: true })
              .eq("pipe_id", pipe.id)
              .eq("is_archived", false),
            supabase
              .from("bpm_phases")
              .select("id", { count: "exact", head: true })
              .eq("pipe_id", pipe.id),
          ]);
          return {
            ...pipe,
            card_count: cardsRes.count || 0,
            phase_count: phasesRes.count || 0,
          };
        })
      );
      setPipes(pipesWithCounts);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingPipe(null);
    setFormName("");
    setFormDesc("");
    setFormIcon(PIPE_ICONS[0]);
    setFormColor(PIPE_COLORS[0]);
    setError(null);
    setShowCreate(true);
  }

  function openEdit(pipe: BpmPipe) {
    setEditingPipe(pipe);
    setFormName(pipe.name);
    setFormDesc(pipe.description || "");
    setFormIcon(pipe.icon);
    setFormColor(pipe.color);
    setError(null);
    setShowCreate(true);
    setOpenMenuId(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !activeOrgId) return;
    setSaving(true);
    setError(null);

    try {
      if (editingPipe) {
        const { error: err } = await supabase
          .from("bpm_pipes")
          .update({
            name: formName.trim(),
            description: formDesc.trim() || null,
            icon: formIcon,
            color: formColor,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPipe.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("bpm_pipes")
          .insert({
            org_id: activeOrgId,
            name: formName.trim(),
            description: formDesc.trim() || null,
            icon: formIcon,
            color: formColor,
            created_by: user?.id,
          });
        if (err) throw err;
      }
      setShowCreate(false);
      loadPipes();
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function archivePipe(pipeId: string) {
    if (!confirm("Tem certeza que deseja arquivar este processo?")) return;
    setOpenMenuId(null);
    await supabase
      .from("bpm_pipes")
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq("id", pipeId);
    loadPipes();
  }

  async function seedProcesses() {
    setSeeding(true);
    setSeedSuccess(null);
    const session = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session.data.session?.access_token) {
      headers["Authorization"] = `Bearer ${session.data.session.access_token}`;
    }
    const res = await fetch("/api/bpm/seed", {
      method: "POST",
      headers,
      body: JSON.stringify({ orgId: activeOrgId }),
    });
    const json = await res.json();
    if (res.ok) {
      setSeedSuccess(json.message);
      loadPipes();
    } else {
      setError(json.error);
    }
    setSeeding(false);
  }

  if (loading || permissions.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Processos</h1>
          <p className="text-sm text-muted-foreground">Gerencie os processos da organização</p>
        </div>
        {permissions.processes.edit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Processo
          </button>
        )}
      </div>

      {/* Success message */}
      {seedSuccess && (
        <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 text-sm text-green-500">
          {seedSuccess}
        </div>
      )}

      {/* Pipe list */}
      {pipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Workflow className="w-12 h-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Nenhum processo criado</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Crie seu primeiro processo para começar
          </p>
          {permissions.processes.edit && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Processo
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipes.map((pipe) => (
            <div
              key={pipe.id}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-lg transition-all relative group"
            >
              {/* Action menu */}
              {permissions.processes.edit && (
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === pipe.id ? null : pipe.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {openMenuId === pipe.id && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/processes/${pipe.id}/settings`}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        onClick={() => setOpenMenuId(null)}
                      >
                        <Settings2 className="w-4 h-4 text-muted-foreground" />
                        Configurar fases
                      </Link>
                      <button
                        onClick={() => openEdit(pipe)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                        Editar processo
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => archivePipe(pipe.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      >
                        <Archive className="w-4 h-4" />
                        Arquivar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Card content - click goes to kanban */}
              <Link href={`/processes/${pipe.id}`} className="block">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: pipe.color + "20" }}
                  >
                    <Workflow className="w-5 h-5" style={{ color: pipe.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{pipe.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{pipe.phase_count} fase{pipe.phase_count !== 1 ? "s" : ""}</span>
                      <span>{pipe.card_count} card{pipe.card_count !== 1 ? "s" : ""} ativo{pipe.card_count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                {pipe.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{pipe.description}</p>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {editingPipe ? "Editar Processo" : "Novo Processo"}
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-accent transition-colors cursor-pointer">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Onboarding de Colaborador"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Descrição</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Descreva o objetivo deste processo..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Cor</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PIPE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={cn(
                        "w-7 h-7 rounded-full transition-all cursor-pointer",
                        formColor === color ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110" : "hover:scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !formName.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPipe ? "Salvar" : "Criar processo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
