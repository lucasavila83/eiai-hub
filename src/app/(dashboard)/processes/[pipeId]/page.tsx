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
import { createBoardTaskFromBpm, deactivatePreviousTaskLinks } from "@/lib/bpm/task-sync";
import {
  ArrowLeft, Loader2, Workflow, Settings2, Plus, X,
  Link2, Copy, Check, Globe, Lock, Users, ExternalLink, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

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
  const [bpmCardProgress, setBpmCardProgress] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<any[]>([]);
  const [allFields, setAllFields] = useState<any[]>([]);
  const [cardValues, setCardValues] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [selectedCard, setSelectedCard] = useState<BpmCard | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!pipeId || !activeOrgId) return;
    setLoading(true);

    const [pipeRes, phasesRes, cardsRes, membersRes, fieldsRes] = await Promise.all([
      supabase.from("bpm_pipes").select("*").eq("id", pipeId).single(),
      supabase.from("bpm_phases").select("*").eq("pipe_id", pipeId).order("position"),
      supabase.from("bpm_cards").select("*").eq("pipe_id", pipeId).eq("is_archived", false).order("created_at"),
      supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("org_id", activeOrgId),
      supabase.from("bpm_fields").select("*").order("position"),
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

    // Load fields for all phases in this pipe
    const pipePhaseIds = (phasesRes.data || []).map((p: any) => p.id);
    const pipeFields = (fieldsRes.data || []).filter((f: any) => pipePhaseIds.includes(f.phase_id));
    setAllFields(pipeFields);

    // Load card values for all cards
    const cardIds = (cardsRes.data || []).map((c: any) => c.id);
    if (cardIds.length > 0) {
      const { data: values } = await supabase
        .from("bpm_card_values")
        .select("card_id, field_id, value")
        .in("card_id", cardIds);

      const valMap: Record<string, Record<string, any>> = {};
      (values || []).forEach((v: any) => {
        if (!valMap[v.card_id]) valMap[v.card_id] = {};
        valMap[v.card_id][v.field_id] = v.value;
      });
      setCardValues(valMap);
    }

    // Load board task progress for each BPM card
    if (cardIds.length > 0) {
      const { data: taskLinks } = await supabase
        .from("bpm_task_links")
        .select("bpm_card_id, board_card_id, is_active")
        .in("bpm_card_id", cardIds);

      if (taskLinks && taskLinks.length > 0) {
        const boardCardIds = taskLinks.map((tl: any) => tl.board_card_id);

        // Get subtask counts and metadata for board cards
        const [subtasksRes, checklistsRes, boardCardsRes] = await Promise.all([
          supabase.from("subtasks").select("card_id, is_completed").in("card_id", boardCardIds),
          supabase.from("checklists").select("id, card_id, checklist_items(id, is_completed)").in("card_id", boardCardIds),
          supabase.from("cards").select("id, metadata, completed_at").in("id", boardCardIds),
        ]);

        // Calculate progress per board card
        const boardCardProgress: Record<string, number> = {};
        for (const bcId of boardCardIds) {
          const manualProg = (boardCardsRes.data || []).find((c: any) => c.id === bcId);
          const mp = typeof manualProg?.metadata?.manual_progress === "number" ? manualProg.metadata.manual_progress : null;

          const subs = (subtasksRes.data || []).filter((s: any) => s.card_id === bcId);
          const clItems = (checklistsRes.data || [])
            .filter((cl: any) => cl.card_id === bcId)
            .flatMap((cl: any) => cl.checklist_items || []);

          const totalItems = subs.length + clItems.length;
          const completedItems = subs.filter((s: any) => s.is_completed).length + clItems.filter((i: any) => i.is_completed).length;
          const autoProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

          // If completed_at is set, treat as 100%
          if (manualProg?.completed_at) {
            boardCardProgress[bcId] = 100;
          } else {
            boardCardProgress[bcId] = mp !== null ? mp : autoProgress;
          }
        }

        // Aggregate: BPM card progress = average of its board card progresses
        const progressMap: Record<string, number> = {};
        for (const cardId of cardIds) {
          const links = taskLinks.filter((tl: any) => tl.bpm_card_id === cardId);
          if (links.length === 0) continue;
          const progresses = links.map((tl: any) => boardCardProgress[tl.board_card_id] ?? 0);
          progressMap[cardId] = Math.round(progresses.reduce((a: number, b: number) => a + b, 0) / progresses.length);
        }
        setBpmCardProgress(progressMap);
      }
    }

    setLoading(false);
  }, [pipeId, activeOrgId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleMoveCard(cardId: string, fromPhaseId: string, toPhaseId: string): Promise<boolean> {
    setMoveError(null);

    // Check if current phase requires approval
    const fromPhase = phases.find((p) => p.id === fromPhaseId);
    if (fromPhase?.requires_approval) {
      // Check if the card has been approved
      const card = cards.find((c) => c.id === cardId);
      if (card?.approval_status !== "approved") {
        // Request approval
        if (card?.approval_status !== "pending") {
          await supabase
            .from("bpm_cards")
            .update({
              approval_status: "pending",
              approval_requested_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", cardId);

          setCards((prev) =>
            prev.map((c) =>
              c.id === cardId ? { ...c, approval_status: "pending", approval_requested_at: new Date().toISOString() } : c
            )
          );

          const approverName = fromPhase.approver_id
            ? members.find((m) => m.user_id === fromPhase.approver_id)?.full_name || "aprovador"
            : "um aprovador";
          setMoveError(`Fase "${fromPhase.name}" requer aprovação de ${approverName}. Solicitação enviada.`);
        } else {
          setMoveError(`Aguardando aprovação para sair da fase "${fromPhase.name}".`);
        }
        setTimeout(() => setMoveError(null), 5000);
        return false;
      }

      // Reset approval status after approved move
      await supabase
        .from("bpm_cards")
        .update({ approval_status: null, approved_by: null, approved_at: null, approval_requested_at: null })
        .eq("id", cardId);
    }

    // Check required fields of current phase
    const { data: currentFields } = await supabase
      .from("bpm_fields")
      .select("id, label, is_required, field_type, options")
      .eq("phase_id", fromPhaseId);

    const requiredFields = (currentFields || []).filter((f: any) => f.is_required);
    const checklistFields = (currentFields || []).filter((f: any) => f.field_type === "checklist");
    const fieldsToCheck = [...new Set([...requiredFields, ...checklistFields])];

    if (fieldsToCheck.length > 0) {
      const { data: fieldValues } = await supabase
        .from("bpm_card_values")
        .select("field_id, value")
        .eq("card_id", cardId)
        .in("field_id", fieldsToCheck.map((f: any) => f.id));

      const valueMap = new Map((fieldValues || []).map((v: any) => [v.field_id, v.value]));
      const errors: string[] = [];

      for (const f of fieldsToCheck) {
        const val = valueMap.get(f.id);
        // Check if required field is empty
        if (f.is_required) {
          if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
            errors.push(f.label);
            continue;
          }
        }
        // Check individual required items in checklists
        if (f.field_type === "checklist" && Array.isArray(val) && Array.isArray(f.options)) {
          const requiredLabels = f.options.filter((o: any) => o.required).map((o: any) => o.label);
          const unchecked = requiredLabels.filter((label: string) => {
            const item = val.find((i: any) => i.label === label);
            return !item || !item.checked;
          });
          if (unchecked.length > 0) {
            errors.push(`${f.label}: ${unchecked.join(", ")}`);
          }
        }
      }

      if (errors.length > 0) {
        setMoveError(`Campos obrigatórios não preenchidos: ${errors.join("; ")}. Clique no card para preencher.`);
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

    // Deactivate previous board task links
    await deactivatePreviousTaskLinks(supabase, cardId);

    // Create board tasks — group fields by assignee
    if (targetPhase?.default_assignee_id && !isEnd) {
      const { data: phaseFields } = await supabase
        .from("bpm_fields")
        .select("id, label, field_type, is_required, options, assignee_id")
        .eq("phase_id", toPhaseId)
        .order("position");

      const allPhaseFields = phaseFields || [];
      const checklistFieldIds = allPhaseFields.filter((f) => f.field_type === "checklist").map((f) => f.id);

      // Get current checklist values for mirroring
      let checklistValues: Record<string, any> = {};
      if (checklistFieldIds.length > 0) {
        const { data: vals } = await supabase
          .from("bpm_card_values")
          .select("field_id, value")
          .eq("card_id", cardId)
          .in("field_id", checklistFieldIds);
        for (const v of vals || []) checklistValues[v.field_id] = v.value;
      }

      // Group fields by assignee: field.assignee_id || phase default
      const defaultAssignee = targetPhase.default_assignee_id;
      const grouped: Record<string, typeof allPhaseFields> = {};
      for (const f of allPhaseFields) {
        const key = f.assignee_id || defaultAssignee;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(f);
      }

      const movedCard = cards.find((c) => c.id === cardId);

      // Create one board task per assignee group
      for (const [assigneeId, groupFields] of Object.entries(grouped)) {
        const reqFields = groupFields.filter((f) => f.is_required);
        const checklistFields = groupFields.filter((f) => f.field_type === "checklist");
        const nonChecklistFields = groupFields.filter((f) => f.field_type !== "checklist");

        await createBoardTaskFromBpm(supabase, {
          bpmCardId: cardId,
          bpmCardTitle: movedCard?.title || "Card BPM",
          pipeId: pipeId,
          pipeName: pipe?.name || "Processo",
          phaseName: targetPhase.name,
          phaseId: toPhaseId,
          assigneeId: assigneeId,
          orgId: activeOrgId!,
          slaDeadline,
          requiredFields: nonChecklistFields.map((f) => ({ label: f.label })),
          checklistFields: checklistFields.map((f) => ({
            label: f.label,
            items: Array.isArray(checklistValues[f.id])
              ? checklistValues[f.id]
              : (f.options || []).map((o: any) => ({ label: o.label, checked: false })),
          })),
          fieldIds: groupFields.map((f) => f.id),
        });
      }
    }

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

    // Fire automation triggers (fire-and-forget)
    fetch("/api/automations/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger_type: "card_moved_to_phase",
        pipe_id: pipeId,
        phase_id: toPhaseId,
        bpm_card_id: cardId,
        org_id: activeOrgId,
      }),
    }).catch(() => {});

    if (isEnd) {
      fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: "card_completed",
          pipe_id: pipeId,
          phase_id: toPhaseId,
          bpm_card_id: cardId,
          org_id: activeOrgId,
        }),
      }).catch(() => {});
    }

    return true;
  }

  async function handleDeleteCard(cardId: string) {
    // Delete related data: values, history, comments, task links
    await Promise.all([
      supabase.from("bpm_card_values").delete().eq("card_id", cardId),
      supabase.from("bpm_card_history").delete().eq("card_id", cardId),
      supabase.from("bpm_card_comments").delete().eq("card_id", cardId),
      supabase.from("bpm_task_links").delete().eq("bpm_card_id", cardId),
    ]);
    await supabase.from("bpm_cards").delete().eq("id", cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard(null);
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

      // Create board task for start phase assignee
      if (startPhase.default_assignee_id) {
        const { data: phaseFields } = await supabase
          .from("bpm_fields")
          .select("id, label, field_type, is_required, options, assignee_id")
          .eq("phase_id", startPhase.id)
          .order("position");

        const allPhaseFields = phaseFields || [];
        const defaultAssignee = startPhase.default_assignee_id;
        const grouped: Record<string, typeof allPhaseFields> = {};
        for (const f of allPhaseFields) {
          const key = (f as any).assignee_id || defaultAssignee;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(f);
        }

        for (const [assigneeId, groupFields] of Object.entries(grouped)) {
          const nonChecklistFields = groupFields.filter((f: any) => f.field_type !== "checklist");
          const checklistFields = groupFields.filter((f: any) => f.field_type === "checklist");

          await createBoardTaskFromBpm(supabase, {
            bpmCardId: newCard.id,
            bpmCardTitle: newCard.title,
            pipeId: pipeId,
            pipeName: pipe?.name || "Processo",
            phaseName: startPhase.name,
            phaseId: startPhase.id,
            assigneeId: assigneeId,
            orgId: activeOrgId!,
            slaDeadline,
            requiredFields: nonChecklistFields.map((f: any) => ({ label: f.label })),
            checklistFields: checklistFields.map((f: any) => ({
              label: f.label,
              items: (f.options || []).map((o: any) => ({ label: o.label, checked: false })),
            })),
            fieldIds: groupFields.map((f: any) => f.id),
          });
        }
      }

      setCards((prev) => [...prev, newCard]);
      setCreateTitle("");
      setShowCreate(false);
      // Open the card modal immediately so user can fill fields
      setSelectedCard(newCard);

      // Fire card_created automation (fire-and-forget)
      fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: "card_created",
          pipe_id: pipeId,
          phase_id: startPhase.id,
          bpm_card_id: newCard.id,
          org_id: activeOrgId,
        }),
      }).catch(() => {});
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
        <button
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
        >
          <Link2 className="w-3.5 h-3.5" />
          Compartilhar formulário
        </button>
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
            fields={allFields}
            cardValues={cardValues}
            cardProgress={bpmCardProgress}
            previewFieldIds={(pipe?.card_preview_fields as string[]) || []}
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
          onMoveCard={handleMoveCard}
          onDelete={handleDeleteCard}
        />
      )}

      {/* Share form modal */}
      {showShareModal && (
        <ShareFormModal
          pipe={pipe}
          members={members}
          supabase={supabase}
          onClose={() => setShowShareModal(false)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}

/* ─── Share Form Modal ─── */
function ShareFormModal({
  pipe,
  members,
  supabase,
  onClose,
  onUpdate,
}: {
  pipe: any;
  members: any[];
  supabase: any;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [enabled, setEnabled] = useState(pipe.public_form_enabled || false);
  const [accessType, setAccessType] = useState(pipe.form_access_type || "restricted");
  const [allowedUsers, setAllowedUsers] = useState<string[]>(pipe.form_allowed_users || []);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const slug = pipe.public_form_slug;

  // Field selection for public form
  const [startPhaseFields, setStartPhaseFields] = useState<{ id: string; label: string; field_type: string; is_required: boolean }[]>([]);
  const [publicFieldIds, setPublicFieldIds] = useState<string[]>(pipe.public_form_fields || []);
  const [loadingFields, setLoadingFields] = useState(false);

  // Load fields from start phase
  useEffect(() => {
    (async () => {
      setLoadingFields(true);
      const { data: phases } = await supabase
        .from("bpm_phases")
        .select("id, is_start, position")
        .eq("pipe_id", pipe.id)
        .order("position");
      const startPhase = phases?.find((p: any) => p.is_start) || phases?.[0];
      if (!startPhase) { setLoadingFields(false); return; }

      const { data: fields } = await supabase
        .from("bpm_fields")
        .select("id, label, field_type, is_required")
        .eq("phase_id", startPhase.id)
        .order("position");
      setStartPhaseFields(fields || []);

      // If no public_form_fields set yet, default to all
      if (!pipe.public_form_fields || pipe.public_form_fields.length === 0) {
        setPublicFieldIds((fields || []).map((f: any) => f.id));
      }
      setLoadingFields(false);
    })();
  }, [pipe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function togglePublicField(fieldId: string) {
    const updated = publicFieldIds.includes(fieldId)
      ? publicFieldIds.filter((id) => id !== fieldId)
      : [...publicFieldIds, fieldId];
    setPublicFieldIds(updated);
    await supabase.from("bpm_pipes").update({ public_form_fields: updated }).eq("id", pipe.id);
  }

  async function selectAllFields() {
    const allIds = startPhaseFields.map((f) => f.id);
    setPublicFieldIds(allIds);
    await supabase.from("bpm_pipes").update({ public_form_fields: allIds }).eq("id", pipe.id);
  }

  async function deselectAllFields() {
    // Keep only required fields
    const requiredIds = startPhaseFields.filter((f) => f.is_required).map((f) => f.id);
    setPublicFieldIds(requiredIds);
    await supabase.from("bpm_pipes").update({ public_form_fields: requiredIds }).eq("id", pipe.id);
  }

  const formUrl = typeof window !== "undefined"
    ? `${window.location.origin}/form/${slug}`
    : `/form/${slug}`;

  async function toggleEnabled() {
    const newVal = !enabled;
    setSaving(true);
    // Generate slug if missing
    let updates: any = { public_form_enabled: newVal };
    if (newVal && !slug) {
      const newSlug = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      updates.public_form_slug = newSlug;
    }
    await supabase.from("bpm_pipes").update(updates).eq("id", pipe.id);
    setEnabled(newVal);
    setSaving(false);
    onUpdate();
  }

  async function updateAccessType(type: string) {
    setAccessType(type);
    await supabase.from("bpm_pipes").update({ form_access_type: type }).eq("id", pipe.id);
  }

  async function toggleUser(userId: string) {
    const updated = allowedUsers.includes(userId)
      ? allowedUsers.filter((u) => u !== userId)
      : [...allowedUsers, userId];
    setAllowedUsers(updated);
    await supabase.from("bpm_pipes").update({ form_allowed_users: updated }).eq("id", pipe.id);
  }

  function copyUrl() {
    navigator.clipboard.writeText(formUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Compartilhar formulário</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Compartilhe este formulário com um link para que pessoas externas possam criar cards neste processo.
          </p>

          {/* Toggle enabled */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Formulário online</span>
            </div>
            <button
              onClick={toggleEnabled}
              disabled={saving}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors cursor-pointer",
                enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <div className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                enabled && "translate-x-5"
              )} />
            </button>
          </div>

          {enabled && slug && (
            <>
              {/* Form URL */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                  <input
                    value={formUrl}
                    readOnly
                    className="flex-1 bg-transparent text-sm text-foreground truncate focus:outline-none"
                  />
                  <button onClick={copyUrl} className="p-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer" title="Copiar link">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <a href={formUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Abrir formulário">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                </div>
              </div>

              {/* Access type */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Acesso</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => updateAccessType("public")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer text-left",
                      accessType === "public" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                    )}
                  >
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Público</p>
                      <p className="text-xs text-muted-foreground">Qualquer pessoa com o link pode enviar</p>
                    </div>
                  </button>
                  <button
                    onClick={() => updateAccessType("restricted")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer text-left",
                      accessType === "restricted" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                    )}
                  >
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Restrito a pessoas selecionadas</p>
                      <p className="text-xs text-muted-foreground">Apenas membros autorizados podem enviar</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Members list (when restricted) */}
              {accessType === "restricted" && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Pessoas com acesso
                  </h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {members.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedUsers.includes(m.user_id)}
                          onChange={() => toggleUser(m.user_id)}
                          className="accent-primary w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.full_name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Field selection for public form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    Campos do formulário
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={selectAllFields}
                      className="text-[10px] text-primary hover:underline cursor-pointer"
                    >
                      Todos
                    </button>
                    <span className="text-[10px] text-muted-foreground">|</span>
                    <button
                      onClick={deselectAllFields}
                      className="text-[10px] text-muted-foreground hover:underline cursor-pointer"
                    >
                      Apenas obrigatórios
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione quais campos serão exibidos no formulário público. Campos obrigatórios não podem ser removidos.
                </p>
                {loadingFields ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : startPhaseFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Nenhum campo configurado na fase inicial. Configure campos em Configurar → Campos.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {startPhaseFields.map((field) => (
                      <label
                        key={field.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                          field.is_required ? "opacity-80" : "hover:bg-accent cursor-pointer"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={publicFieldIds.includes(field.id)}
                          onChange={() => togglePublicField(field.id)}
                          disabled={field.is_required}
                          className="accent-primary w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {field.label}
                            {field.is_required && <span className="text-destructive ml-1">*</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{field.field_type}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
