"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, Clock, User, MessageSquare, History,
  Send, ChevronRight, AlertTriangle, CheckCircle2, Pencil, Check,
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
}

export function BpmCardModal({ card, phases, members, currentUserId, canEdit, onClose, onUpdate }: Props) {
  const supabase = createClient();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [allPhaseFields, setAllPhaseFields] = useState<Record<string, FieldDef[]>>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [activeSection, setActiveSection] = useState<"fields" | "history" | "comments">("fields");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const currentPhase = phases.find((p) => p.id === card.current_phase_id);

  useEffect(() => {
    // Reset state when card changes to avoid stale data
    setFields([]);
    setValues({});
    setHistory([]);
    setComments([]);
    setFieldErrors({});
    setNewComment("");
    setActiveSection("fields");
    loadCardData();
  }, [card.id]);

  async function loadCardData() {
    setLoading(true);

    // Get all phase IDs for this pipe
    const pipePhaseIds = phases.map((p) => p.id);

    const [allFieldsRes, valuesRes, historyRes, commentsRes] = await Promise.all([
      // Load fields for ALL phases (not just current)
      pipePhaseIds.length > 0
        ? supabase
            .from("bpm_fields")
            .select("*")
            .in("phase_id", pipePhaseIds)
            .order("position")
        : Promise.resolve({ data: [] }),
      supabase
        .from("bpm_card_values")
        .select("*")
        .eq("card_id", card.id),
      supabase
        .from("bpm_card_history")
        .select("*")
        .eq("card_id", card.id)
        .order("moved_at", { ascending: false })
        .limit(50),
      supabase
        .from("bpm_card_comments")
        .select("*")
        .eq("card_id", card.id)
        .order("created_at", { ascending: true }),
    ]);

    const allFields = (allFieldsRes.data || []).map((f: any) => ({
      ...f,
      options: f.options || [],
      validations: f.validations || {},
    }));

    // Group fields by phase
    const phaseFieldsMap: Record<string, FieldDef[]> = {};
    for (const f of allFields) {
      if (!phaseFieldsMap[f.phase_id]) phaseFieldsMap[f.phase_id] = [];
      phaseFieldsMap[f.phase_id].push(f);
    }
    setAllPhaseFields(phaseFieldsMap);

    // Current phase fields for validation
    const currentFields = allFields.filter((f: any) => f.phase_id === card.current_phase_id);
    setFields(currentFields);

    // Map values by field_id
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

  function validateRequiredFields(): boolean {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.is_required) {
        const val = values[field.id];
        if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
          errors[field.id] = "Campo obrigatório";
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId) return;
    setSendingComment(true);

    await supabase.from("bpm_card_comments").insert({
      card_id: card.id,
      user_id: currentUserId,
      content: newComment.trim(),
    });

    setNewComment("");
    setSendingComment(false);
    // Reload comments
    const { data } = await supabase
      .from("bpm_card_comments")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: true });
    if (data) setComments(data);
  }

  async function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === card.title) {
      setTitleDraft(card.title);
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    await supabase.from("bpm_cards").update({ title: trimmed }).eq("id", card.id);
    setSavingTitle(false);
    setEditingTitle(false);
    onUpdate();
  }

  function getMember(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId) || null;
  }

  function getPhaseName(phaseId: string | null) {
    if (!phaseId) return "—";
    return phases.find((p) => p.id === phaseId)?.name || "—";
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-2xl p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const totalFieldCount = Object.values(allPhaseFields).reduce((sum, arr) => sum + arr.length, 0);
  const sectionTabs = [
    { key: "fields" as const, label: "Campos", icon: CheckCircle2, count: totalFieldCount },
    { key: "history" as const, label: "Histórico", icon: History, count: history.length },
    { key: "comments" as const, label: "Comentários", icon: MessageSquare, count: comments.length },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") { setTitleDraft(card.title); setEditingTitle(false); }
                  }}
                  className="flex-1 text-lg font-semibold text-foreground bg-background border border-input rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  disabled={savingTitle}
                />
                <button onClick={handleSaveTitle} disabled={savingTitle} className="p-1 rounded-lg hover:bg-accent transition-colors cursor-pointer">
                  {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />}
                </button>
                <button onClick={() => { setTitleDraft(card.title); setEditingTitle(false); }} className="p-1 rounded-lg hover:bg-accent transition-colors cursor-pointer">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <h2
                className={cn("text-lg font-semibold text-foreground truncate", canEdit && "cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 transition-colors")}
                onDoubleClick={() => { if (canEdit) { setTitleDraft(card.title); setEditingTitle(true); } }}
                title={canEdit ? "Clique duas vezes para editar" : undefined}
              >
                {card.title}
              </h2>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              {currentPhase && (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentPhase.color }} />
                  {currentPhase.name}
                </span>
              )}
              {card.assignee_id && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {getMember(card.assignee_id)?.full_name?.split(" ")[0] || "—"}
                </span>
              )}
              {card.sla_deadline && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(card.sla_deadline) < new Date() ? (
                    <span className="text-red-500">SLA vencido</span>
                  ) : (
                    formatDateTime(card.sla_deadline)
                  )}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-border shrink-0">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  activeSection === tab.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                <span className="bg-muted px-1.5 py-0.5 rounded-full text-[10px]">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Fields section — grouped by phase like Pipefy */}
          {activeSection === "fields" && (
            <div className="space-y-6">
              {(() => {
                // Determine which phases to show: all phases up to current (based on position)
                const currentPhaseIdx = phases.findIndex((p) => p.id === card.current_phase_id);
                const visiblePhases = phases.filter((p, idx) => idx <= currentPhaseIdx && allPhaseFields[p.id]?.length);

                if (visiblePhases.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-8">Nenhum campo configurado para esta fase.</p>;
                }

                return (
                  <>
                    {visiblePhases.map((phase) => {
                      const phaseFields = allPhaseFields[phase.id] || [];
                      const isCurrentPhase = phase.id === card.current_phase_id;
                      return (
                        <div key={phase.id}>
                          {/* Phase header */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: phase.color }} />
                            <h3 className="text-sm font-semibold text-foreground">{phase.name}</h3>
                            {!isCurrentPhase && (
                              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">concluída</span>
                            )}
                            {isCurrentPhase && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">atual</span>
                            )}
                          </div>
                          <div className="space-y-4 pl-4 border-l-2 border-border ml-0.5">
                            {phaseFields.map((field) => (
                              <DynamicField
                                key={field.id}
                                field={field}
                                value={values[field.id] ?? null}
                                onChange={(val) => saveFieldValue(field.id, val)}
                                members={members}
                                disabled={!canEdit || !isCurrentPhase}
                                error={fieldErrors[field.id] || null}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {canEdit && (
                      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        <button
                          onClick={() => {
                            if (validateRequiredFields()) {
                              onUpdate();
                              onClose();
                            }
                          }}
                          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Salvar e fechar
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* History section */}
          {activeSection === "history" && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada.</p>
              ) : (
                history.map((entry) => {
                  const mover = getMember(entry.moved_by);
                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        {entry.action === "created" ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          {entry.action === "created" && "Card criado"}
                          {entry.action === "moved" && (
                            <>
                              Movido de <strong>{getPhaseName(entry.from_phase_id)}</strong> para <strong>{getPhaseName(entry.to_phase_id)}</strong>
                            </>
                          )}
                          {entry.action === "completed" && "Card concluído"}
                          {entry.action === "assigned" && "Responsável alterado"}
                          {entry.action === "field_updated" && "Campo atualizado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {mover?.full_name || mover?.email || "Sistema"} · {formatDateTime(entry.moved_at)}
                        </p>
                        {entry.notes && <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Comments section */}
          {activeSection === "comments" && (
            <div className="space-y-3">
              {comments.map((comment) => {
                const author = getMember(comment.user_id);
                const isOwn = comment.user_id === currentUserId;
                return (
                  <div key={comment.id} className="flex items-start gap-2.5">
                    {author?.avatar_url ? (
                      <img src={author.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: generateColor(author?.full_name || author?.email || "?") }}
                      >
                        {getInitials(author?.full_name || author?.email || "?")}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{author?.full_name || author?.email}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground mt-0.5">{comment.content}</p>
                    </div>
                  </div>
                );
              })}

              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum comentário ainda.</p>
              )}

              {/* Add comment */}
              <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2 border-t border-border mt-4">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Escrever comentário..."
                  className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={sendingComment || !newComment.trim()}
                  className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
