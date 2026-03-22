"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { ProcessKanban, type BpmCard } from "@/components/bpm/ProcessKanban";
import { BpmCardModal } from "@/components/bpm/BpmCardModal";
import type { Phase } from "@/components/bpm/PhaseEditor";
import {
  ArrowLeft, Loader2, Workflow, Settings2, Plus, X,
} from "lucide-react";

export default function PipeKanbanPage() {
  return (
    <PermissionGuard permission="isAdmin" fallbackMessage="Você não tem permissão para acessar este processo.">
      <PipeKanbanContent />
    </PermissionGuard>
  );
}

function PipeKanbanContent() {
  const { pipeId } = useParams<{ pipeId: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const { user } = useAuth();
  const permissions = usePermissions();

  const [pipe, setPipe] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [cards, setCards] = useState<BpmCard[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [selectedCard, setSelectedCard] = useState<BpmCard | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!pipeId || !activeOrgId) return;
    setLoading(true);

    const [pipeRes, phasesRes, cardsRes, membersRes] = await Promise.all([
      supabase.from("bpm_pipes").select("*").eq("id", pipeId).single(),
      supabase.from("bpm_phases").select("*").eq("pipe_id", pipeId).order("position"),
      supabase.from("bpm_cards").select("*").eq("pipe_id", pipeId).eq("is_archived", false).order("created_at"),
      supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("org_id", activeOrgId),
    ]);

    if (pipeRes.data) setPipe(pipeRes.data);
    if (phasesRes.data) setPhases(phasesRes.data);
    if (cardsRes.data) setCards(cardsRes.data);
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
  }, [pipeId, activeOrgId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleMoveCard(cardId: string, fromPhaseId: string, toPhaseId: string): Promise<boolean> {
    setMoveError(null);

    // Check required fields of current phase
    const { data: currentFields } = await supabase
      .from("bpm_fields")
      .select("id, label, is_required")
      .eq("phase_id", fromPhaseId)
      .eq("is_required", true);

    if (currentFields && currentFields.length > 0) {
      const { data: fieldValues } = await supabase
        .from("bpm_card_values")
        .select("field_id, value")
        .eq("card_id", cardId)
        .in("field_id", currentFields.map((f) => f.id));

      const valueMap = new Map((fieldValues || []).map((v) => [v.field_id, v.value]));
      const missing = currentFields.filter((f) => {
        const val = valueMap.get(f.id);
        return val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
      });

      if (missing.length > 0) {
        const names = missing.map((f) => f.label).join(", ");
        setMoveError(`Campos obrigatórios não preenchidos: ${names}. Clique no card para preencher.`);
        setTimeout(() => setMoveError(null), 5000);
        return false;
      }
    }

    // Get target phase for SLA calculation
    const targetPhase = phases.find((p) => p.id === toPhaseId);
    const slaDeadline = targetPhase?.sla_hours
      ? new Date(Date.now() + targetPhase.sla_hours * 3600000).toISOString()
      : null;

    // Check if target is end phase
    const isEnd = targetPhase?.is_end ?? false;

    // Update card
    await supabase
      .from("bpm_cards")
      .update({
        current_phase_id: toPhaseId,
        assignee_id: targetPhase?.default_assignee_id || null,
        sla_deadline: slaDeadline,
        completed_at: isEnd ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    // Add history entry
    await supabase.from("bpm_card_history").insert({
      card_id: cardId,
      from_phase_id: fromPhaseId,
      to_phase_id: toPhaseId,
      moved_by: user?.id,
      action: isEnd ? "completed" : "moved",
    });

    // Update local state
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              current_phase_id: toPhaseId,
              assignee_id: targetPhase?.default_assignee_id || null,
              sla_deadline: slaDeadline,
              completed_at: isEnd ? new Date().toISOString() : null,
            }
          : c
      )
    );

    return true;
  }

  async function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim() || !activeOrgId) return;
    setCreating(true);

    const startPhase = phases.find((p) => p.is_start) || phases[0];
    if (!startPhase) {
      setCreating(false);
      return;
    }

    const slaDeadline = startPhase.sla_hours
      ? new Date(Date.now() + startPhase.sla_hours * 3600000).toISOString()
      : null;

    const { data: newCard } = await supabase
      .from("bpm_cards")
      .insert({
        pipe_id: pipeId,
        org_id: activeOrgId,
        current_phase_id: startPhase.id,
        title: createTitle.trim(),
        created_by: user?.id,
        assignee_id: startPhase.default_assignee_id || null,
        sla_deadline: slaDeadline,
        priority: "medium",
      })
      .select()
      .single();

    if (newCard) {
      // Add history
      await supabase.from("bpm_card_history").insert({
        card_id: newCard.id,
        to_phase_id: startPhase.id,
        moved_by: user?.id,
        action: "created",
      });

      setCards((prev) => [...prev, newCard]);
      setCreateTitle("");
      setShowCreate(false);
    }
    setCreating(false);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Link
          href="/processes"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: pipe.color + "20" }}
        >
          <Workflow className="w-4 h-4" style={{ color: pipe.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">{pipe.name}</h1>
          <p className="text-xs text-muted-foreground">
            {cards.filter((c) => !c.completed_at).length} cards ativos · {phases.length} fases
          </p>
        </div>
        <Link
          href={`/processes/${pipeId}/settings`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Configurar
        </Link>
      </div>

      {/* Move error */}
      {moveError && (
        <div className="mx-6 mt-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2 text-sm text-destructive">
          {moveError}
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {phases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Workflow className="w-12 h-12 text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-1">Nenhuma fase configurada</h2>
            <p className="text-muted-foreground text-sm mb-4">Configure as fases do processo primeiro</p>
            <Link
              href={`/processes/${pipeId}/settings`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              Configurar fases
            </Link>
          </div>
        ) : (
          <ProcessKanban
            phases={phases}
            cards={cards}
            members={members}
            onMoveCard={handleMoveCard}
            onCardClick={(card) => setSelectedCard(card)}
            onCreateCard={() => setShowCreate(true)}
            canEdit={permissions.processes.edit}
          />
        )}
      </div>

      {/* Create card modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Novo Card</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-accent cursor-pointer">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleCreateCard} className="space-y-3">
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Título do card"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">
                Será criado na fase: <strong>{phases.find((p) => p.is_start)?.name || phases[0]?.name}</strong>
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-foreground bg-muted rounded-lg hover:bg-accent cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !createTitle.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card detail modal */}
      {selectedCard && (
        <BpmCardModal
          card={selectedCard}
          phases={phases}
          members={members}
          currentUserId={user?.id || null}
          canEdit={permissions.processes.edit}
          onClose={() => setSelectedCard(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
