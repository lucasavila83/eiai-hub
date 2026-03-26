"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, Clock, User, MessageSquare, History,
  Send, ChevronRight, AlertTriangle, CheckCircle2, Check,
  ArrowRight, ArrowLeft, Trash2,
} from "lucide-react";
import { cn, getInitials, generateColor, formatDateTime } from "@/lib/utils/helpers";
import { DynamicField, type FieldDef } from "./DynamicField";
import type { BpmCard } from "./ProcessKanban";
import type { Phase } from "./PhaseEditor";

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface HistoryEntry {
  id: string;
  from_phase_id: string | null;
  to_phase_id: string | null;
  moved_by: string | null;
  moved_at: string;
  notes: string | null;
  action: string;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface Props {
  card: BpmCard;
  phases: Phase[];
  members: OrgMember[];
  currentUserId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onMoveCard?: (cardId: string, fromPhaseId: string, toPhaseId: string) => Promise<boolean>;
  onDelete?: (cardId: string) => Promise<void>;
}

export function BpmCardModal({ card, phases, members, currentUserId, canEdit, onClose, onUpdate, onMoveCard, onDelete }: Props) {
  const supabase = createClient();
  const [allPhaseFields, setAllPhaseFields] = useState<Record<string, FieldDef[]>>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(card.title);
  const [titleDraft, setTitleDraft] = useState(card.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentPhase = phases.find((p) => p.id === card.current_phase_id);
  const currentPhaseIdx = phases.findIndex((p) => p.id === card.current_phase_id);

  // Phases with fields up to current
  const pastPhases = phases.filter((p, idx) => idx < currentPhaseIdx && allPhaseFields[p.id]?.length);

  useEffect(() => {
    setAllPhaseFields({});
    setValues({});
    setHistory([]);
    setComments([]);
    setFieldErrors({});
    setNewComment("");
    setEditingTitle(false);
    setDisplayTitle(card.title);
    setTitleDraft(card.title);
    loadCardData();
  }, [card.id]);

  async function loadCardData() {
    setLoading(true);
    const pipePhaseIds = phases.map((p) => p.id);

    const [allFieldsRes, valuesRes, historyRes, commentsRes] = await Promise.all([
      pipePhaseIds.length > 0
        ? supabase.from("bpm_fields").select("*").in("phase_id", pipePhaseIds).order("position")
        : Promise.resolve({ data: [] }),
      supabase.from("bpm_card_values").select("*").eq("card_id", card.id),
      supabase.from("bpm_card_history").select("*").eq("card_id", card.id).order("moved_at", { ascending: false }).limit(50),
      supabase.from("bpm_card_comments").select("*").eq("card_id", card.id).order("created_at", { ascending: true }),
    ]);

    const allFields = (allFieldsRes.data || []).map((f: any) => ({
      ...f, options: f.options || [], validations: f.validations || {},
    }));

    const phaseFieldsMap: Record<string, FieldDef[]> = {};
    for (const f of allFields) {
      if (!phaseFieldsMap[f.phase_id]) phaseFieldsMap[f.phase_id] = [];
      phaseFieldsMap[f.phase_id].push(f);
    }
    setAllPhaseFields(phaseFieldsMap);

    const valMap: Record<string, any> = {};
    for (const v of valuesRes.data || []) {
      valMap[v.field_id] = v.value;
    }
    setValues(valMap);
    setHistory(historyRes.data || []);
    setComments(commentsRes.data || []);
    setLoading(false);
  }

  async function saveFieldValue(fieldId: string, value: any) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    await supabase.from("bpm_card_values").upsert(
      { card_id: card.id, field_id: fieldId, value, updated_at: new Date().toISOString() },
      { onConflict: "card_id,field_id" }
    );
  }

  async function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === displayTitle) {
      setTitleDraft(displayTitle);
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    await supabase.from("bpm_cards").update({ title: trimmed }).eq("id", card.id);
    setDisplayTitle(trimmed);
    setSavingTitle(false);
    setEditingTitle(false);
    onUpdate();
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId) return;
    setSendingComment(true);
    await supabase.from("bpm_card_comments").insert({ card_id: card.id, user_id: currentUserId, content: newComment.trim() });
    setNewComment("");
    setSendingComment(false);
    const { data } = await supabase.from("bpm_card_comments").select("*").eq("card_id", card.id).order("created_at", { ascending: true });
    if (data) setComments(data);
  }

  async function handleMove(toPhaseId: string) {
    if (!onMoveCard || !card.current_phase_id) return;
    setMovingTo(toPhaseId);
    const ok = await onMoveCard(card.id, card.current_phase_id, toPhaseId);
    setMovingTo(null);
    if (ok) {
      onUpdate();
      onClose();
    }
  }

  function getMember(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId) || null;
  }

  function getPhaseName(phaseId: string | null) {
    if (!phaseId) return "—";
    return phases.find((p) => p.id === phaseId)?.name || "—";
  }

  function formatFieldDisplay(field: FieldDef, val: any): string {
    if (val === null || val === undefined || val === "") return "—";
    if (field.field_type === "checklist" && Array.isArray(val)) {
      const checked = val.filter((i: any) => i.checked).length;
      return `${checked}/${val.length}`;
    }
    if (field.field_type === "user") {
      const m = getMember(val);
      return m?.full_name || m?.email || val;
    }
    if (field.field_type === "select") {
      const opt = field.options?.find((o) => o.value === val);
      return opt?.label || val;
    }
    if (field.field_type === "checkbox") return val ? "Sim" : "Não";
    if (field.field_type === "date") return new Date(val).toLocaleDateString("pt-BR");
    if (field.field_type === "currency") {
      const num = typeof val === "number" ? val : parseFloat(val);
      return isNaN(num) ? val : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
    return String(val);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end justify-end z-50">
        <div className="bg-card h-full w-full max-w-5xl flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const currentFields = allPhaseFields[card.current_phase_id || ""] || [];
  // Next phase for "move forward"
  const nextPhase = currentPhaseIdx >= 0 && currentPhaseIdx < phases.length - 1 ? phases[currentPhaseIdx + 1] : null;
  // Previous phase for "move back"
  const prevPhase = currentPhaseIdx > 0 ? phases[currentPhaseIdx - 1] : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-card h-full w-full max-w-[1100px] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") { setTitleDraft(displayTitle); setEditingTitle(false); }
                  }}
                  className="flex-1 text-xl font-bold text-foreground bg-background border border-input rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  disabled={savingTitle}
                />
                <button onClick={handleSaveTitle} disabled={savingTitle} className="p-1 rounded-lg hover:bg-accent cursor-pointer">
                  {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />}
                </button>
              </div>
            ) : (
              <h1
                className={cn("text-xl font-bold text-foreground", canEdit && "cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 transition-colors")}
                onDoubleClick={() => { if (canEdit) { setTitleDraft(displayTitle); setEditingTitle(true); } }}
                title={canEdit ? "Duplo clique para editar" : undefined}
              >
                {displayTitle}
              </h1>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              {currentPhase && (
                <span className="flex items-center gap-1">
                  Fase atual <span className="font-semibold text-primary">{currentPhase.name}</span>
                </span>
              )}
              {card.sla_deadline && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(card.sla_deadline) < new Date() ? (
                    <span className="text-red-500">SLA vencido</span>
                  ) : formatDateTime(card.sla_deadline)}
                </span>
              )}
            </div>
          </div>
          {canEdit && onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-destructive font-medium">Excluir?</span>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    await onDelete(card.id);
                    setDeleting(false);
                  }}
                  disabled={deleting}
                  className="px-2 py-1 text-xs font-medium rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors cursor-pointer"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sim"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Excluir card"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 3-column body */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT — Formulário Inicial + Histórico + Comentários */}
          <div className="w-[340px] shrink-0 border-r border-border overflow-y-auto">
            {/* Past phases (read-only) */}
            {pastPhases.map((phase) => {
              const phaseFields = allPhaseFields[phase.id] || [];
              return (
                <div key={phase.id} className="px-5 py-4 border-b border-border">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-0.5">{phase.name}</h3>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    {card.created_by ? `Criado por ${getMember(card.created_by)?.full_name || "—"}` : ""}
                  </p>
                  <div className="space-y-3">
                    {phaseFields.map((field) => {
                      const val = values[field.id];
                      return (
                        <div key={field.id}>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {field.is_required && <span className="text-destructive">*</span>}
                            {field.label}
                          </p>
                          <p className="text-sm text-foreground mt-0.5">{formatFieldDisplay(field, val)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* If current phase is the start phase, show its fields read-only style too? No — show in center. */}
            {/* Show fields of start phase as read-only if it's not current */}
            {pastPhases.length === 0 && currentPhaseIdx === 0 && (
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-3">Formulário Inicial</h3>
                <div className="space-y-3">
                  {(allPhaseFields[phases[0]?.id] || []).map((field) => {
                    const val = values[field.id];
                    return (
                      <div key={field.id}>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {field.is_required && <span className="text-destructive">*</span>}
                          {field.label}
                        </p>
                        <p className="text-sm text-foreground mt-0.5">{formatFieldDisplay(field, val)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Histórico */}
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Histórico
              </h3>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma movimentação.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => {
                    const mover = getMember(entry.moved_by);
                    return (
                      <div key={entry.id} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          {entry.action === "created" ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                          ) : (
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-foreground">
                            {entry.action === "created" && <span className="text-primary font-medium">{getPhaseName(entry.to_phase_id)}</span>}
                            {entry.action === "moved" && (
                              <>De <strong>{getPhaseName(entry.from_phase_id)}</strong> → <strong>{getPhaseName(entry.to_phase_id)}</strong></>
                            )}
                            {entry.action === "completed" && "Concluído"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {mover?.full_name || "Sistema"} · {formatDateTime(entry.moved_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comentários */}
            <div className="px-5 py-4">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comentários ({comments.length})
              </h3>
              <div className="space-y-3">
                {comments.map((comment) => {
                  const author = getMember(comment.user_id);
                  return (
                    <div key={comment.id} className="flex items-start gap-2">
                      {author?.avatar_url ? (
                        <img src={author.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                          style={{ backgroundColor: generateColor(author?.full_name || author?.email || "?") }}
                        >
                          {getInitials(author?.full_name || author?.email || "?")}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">{author?.full_name?.split(" ")[0]}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                        </div>
                        <p className="text-xs text-foreground mt-0.5">{comment.content}</p>
                      </div>
                    </div>
                  );
                })}
                {comments.length === 0 && <p className="text-xs text-muted-foreground">Nenhum comentário.</p>}
              </div>

              <form onSubmit={handleAddComment} className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Comentar..."
                  className="flex-1 px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="submit" disabled={sendingComment || !newComment.trim()} className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
                  {sendingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </form>
            </div>
          </div>

          {/* CENTER — Current phase fields / checklists */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Fase atual</span>
                {currentPhase && (
                  <span className="text-sm font-semibold text-primary">{currentPhase.name}</span>
                )}
              </div>

              {currentFields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Nenhum campo configurado para esta fase.</p>
              ) : (
                <div className="space-y-5">
                  {currentFields.map((field) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={values[field.id] ?? null}
                      onChange={(val) => saveFieldValue(field.id, val)}
                      members={members}
                      disabled={!canEdit}
                      error={fieldErrors[field.id] || null}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Move card to phase */}
          <div className="w-[220px] shrink-0 border-l border-border overflow-y-auto">
            <div className="px-4 py-4">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-3">Mover card para fase</h3>

              {/* Next phase button (primary action) */}
              {nextPhase && canEdit && (
                <button
                  onClick={() => handleMove(nextPhase.id)}
                  disabled={!!movingTo}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors cursor-pointer mb-3"
                >
                  <span>{nextPhase.name}</span>
                  {movingTo === nextPhase.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              )}

              {/* Approval */}
              {card.approval_status === "pending" && (() => {
                const currentPhase = phases.find((p) => p.id === card.current_phase_id);
                const isApprover = currentPhase?.approver_id === currentUserId || !currentPhase?.approver_id;
                return isApprover ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Aprovação pendente
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await supabase.from("bpm_cards").update({
                            approval_status: "approved",
                            approved_by: currentUserId,
                            approved_at: new Date().toISOString(),
                          }).eq("id", card.id);
                          await supabase.from("bpm_card_history").insert({
                            card_id: card.id,
                            to_phase_id: card.current_phase_id,
                            moved_by: currentUserId,
                            action: "approved",
                          });
                          onUpdate();
                          onClose();
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={async () => {
                          await supabase.from("bpm_cards").update({
                            approval_status: "rejected",
                          }).eq("id", card.id);
                          await supabase.from("bpm_card_history").insert({
                            card_id: card.id,
                            to_phase_id: card.current_phase_id,
                            moved_by: currentUserId,
                            action: "rejected",
                          });
                          onUpdate();
                          onClose();
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Rejeitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Aguardando aprovação de {getMember(currentPhase?.approver_id || null)?.full_name || "aprovador"}
                    </p>
                  </div>
                );
              })()}

              {/* Divider */}
              <div className="border-t border-border my-3" />

              {/* All phases navigation */}
              <div className="space-y-1">
                {phases.map((phase, idx) => {
                  const isCurrent = phase.id === card.current_phase_id;
                  const isPast = idx < currentPhaseIdx;
                  return (
                    <button
                      key={phase.id}
                      onClick={() => {
                        if (!isCurrent && canEdit && onMoveCard) handleMove(phase.id);
                      }}
                      disabled={isCurrent || !canEdit || !!movingTo}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left",
                        isCurrent
                          ? "bg-primary/10 text-primary font-semibold"
                          : isPast
                            ? "text-muted-foreground hover:bg-accent cursor-pointer"
                            : "text-foreground hover:bg-accent cursor-pointer",
                        isCurrent && "cursor-default"
                      )}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                      <span className="flex-1 truncate">{phase.name}</span>
                      {isCurrent && <span className="text-[9px] bg-primary/20 px-1.5 py-0.5 rounded-full">atual</span>}
                      {movingTo === phase.id && <Loader2 className="w-3 h-3 animate-spin" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
