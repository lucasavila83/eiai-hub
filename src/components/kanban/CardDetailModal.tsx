"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDate,
  formatDateTime,
  getInitials,
  generateColor,
} from "@/lib/utils/helpers";
import type { Card } from "@/lib/types/database";
import {
  X,
  Calendar,
  Users,
  Flag,
  Columns3,
  Trash2,
  CheckCircle2,
  MessageSquare,
  Clock,
  Loader2,
  Send,
} from "lucide-react";

interface Props {
  card: Card & { card_assignees: any[] };
  boardId: string;
  columns: { id: string; name: string; color: string }[];
  orgMembers: {
    user_id: string;
    profiles: {
      id: string;
      full_name: string;
      email: string;
      avatar_url: string | null;
    };
  }[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (updatedCard: any) => void;
  onDeleted: (cardId: string) => void;
}

interface Comment {
  id: string;
  card_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string;
  };
}

const priorityConfig = {
  urgent: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", label: "Urgente" },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Alta" },
  medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Media" },
  low: { color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", label: "Baixa" },
  none: { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", label: "Nenhuma" },
};

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

export function CardDetailModal({
  card,
  boardId,
  columns,
  orgMembers,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const supabase = createClient();

  // Card state
  const [title, setTitle] = useState(card.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(card.description || "");
  const [editingDescription, setEditingDescription] = useState(false);
  const [priority, setPriority] = useState<Card["priority"]>(card.priority);
  const [dueDate, setDueDate] = useState(card.due_date || "");
  const [columnId, setColumnId] = useState(card.column_id);
  const [completedAt, setCompletedAt] = useState<string | null>(card.completed_at);
  const [assignees, setAssignees] = useState<any[]>(card.card_assignees || []);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
  }, []);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [editingDescription]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingTitle && !editingDescription) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTitle, editingDescription, onClose]);

  async function loadComments() {
    setLoadingComments(true);
    const { data } = await supabase
      .from("card_comments")
      .select("*, profiles:user_id(id, full_name, avatar_url, email)")
      .eq("card_id", card.id)
      .order("created_at", { ascending: true });
    if (data) {
      setComments(data as unknown as Comment[]);
    }
    setLoadingComments(false);
  }

  async function updateCard(fields: Partial<Card>) {
    setSaving(true);
    const { data, error } = await supabase
      .from("cards")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", card.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      onUpdated({ ...data, card_assignees: assignees });
    }
  }

  // Title
  function handleTitleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      setEditingTitle(false);
      return;
    }
    if (trimmed !== card.title) {
      updateCard({ title: trimmed });
    }
    setEditingTitle(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setTitle(card.title);
      setEditingTitle(false);
    }
  }

  // Description
  function handleDescriptionSave() {
    const trimmed = description.trim();
    const current = card.description || "";
    if (trimmed !== current) {
      updateCard({ description: trimmed || null });
    }
    setEditingDescription(false);
  }

  // Priority
  async function handlePriorityChange(p: Card["priority"]) {
    setPriority(p);
    setShowPriorityDropdown(false);
    await updateCard({ priority: p });
  }

  // Due date
  async function handleDueDateChange(value: string) {
    setDueDate(value);
    await updateCard({ due_date: value || null });
  }

  // Column
  async function handleColumnChange(newColumnId: string) {
    setColumnId(newColumnId);
    await updateCard({ column_id: newColumnId });
  }

  // Completed toggle
  async function handleToggleCompleted() {
    const newVal = completedAt ? null : new Date().toISOString();
    setCompletedAt(newVal);
    await updateCard({ completed_at: newVal });
  }

  // Assignees
  async function addAssignee(userId: string) {
    const { error } = await supabase
      .from("card_assignees")
      .insert({ card_id: card.id, user_id: userId });
    if (!error) {
      const member = orgMembers.find((m) => m.user_id === userId);
      const newAssignees = [...assignees, { user_id: userId, profiles: member?.profiles }];
      setAssignees(newAssignees);
      onUpdated({ ...card, card_assignees: newAssignees });
    }
    setShowAssigneeDropdown(false);
  }

  async function removeAssignee(userId: string) {
    const { error } = await supabase
      .from("card_assignees")
      .delete()
      .eq("card_id", card.id)
      .eq("user_id", userId);
    if (!error) {
      const newAssignees = assignees.filter((a: any) => a.user_id !== userId);
      setAssignees(newAssignees);
      onUpdated({ ...card, card_assignees: newAssignees });
    }
  }

  // Comments
  async function handleAddComment() {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setSendingComment(true);
    const { error } = await supabase
      .from("card_comments")
      .insert({ card_id: card.id, user_id: currentUserId, content: trimmed });
    if (!error) {
      setNewComment("");
      await loadComments();
    }
    setSendingComment(false);
  }

  function handleCommentKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  }

  // Delete
  async function handleDelete() {
    setDeleting(true);
    await supabase.from("card_assignees").delete().eq("card_id", card.id);
    await supabase.from("card_comments").delete().eq("card_id", card.id);
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    setDeleting(false);
    if (!error) {
      onDeleted(card.id);
      onClose();
    }
  }

  const isOverdue = dueDate && new Date(dueDate) < new Date() && !completedAt;
  const currentColumn = columns.find((c) => c.id === columnId);
  const assignedUserIds = new Set(assignees.map((a: any) => a.user_id));
  const availableMembers = orgMembers.filter((m) => !assignedUserIds.has(m.user_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Cover color bar */}
        {card.cover_color && (
          <div className="h-2 rounded-t-xl" style={{ backgroundColor: card.cover_color }} />
        )}

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-0">
          <div className="flex-1 min-w-0 mr-3">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="w-full text-xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none pb-1"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className={cn(
                  "text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors",
                  completedAt && "line-through text-muted-foreground"
                )}
              >
                {title}
              </h2>
            )}
            {currentColumn && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: currentColumn.color }}
                />
                {currentColumn.name}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Completed toggle */}
          <button
            onClick={handleToggleCompleted}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full",
              completedAt
                ? "bg-green-500/10 text-green-500 border border-green-500/30"
                : "bg-muted text-muted-foreground border border-border hover:border-primary/30"
            )}
          >
            <CheckCircle2 className={cn("w-4 h-4", completedAt && "fill-current")} />
            {completedAt ? "Tarefa concluida" : "Marcar como concluida"}
          </button>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Descricao
            </label>
            {editingDescription ? (
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDescription(card.description || "");
                    setEditingDescription(false);
                  }
                }}
                rows={4}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Adicione uma descricao..."
              />
            ) : (
              <div
                onClick={() => setEditingDescription(true)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm min-h-[60px] cursor-pointer transition-colors",
                  description
                    ? "text-foreground hover:bg-accent/50"
                    : "text-muted-foreground bg-muted/50 hover:bg-muted"
                )}
              >
                {description || "Clique para adicionar uma descricao..."}
              </div>
            )}
          </div>

          {/* Properties grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-muted-foreground" />
                Prioridade
              </label>
              <button
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border w-full transition-colors",
                  priorityConfig[priority].bg,
                  priorityConfig[priority].color,
                  priorityConfig[priority].border
                )}
              >
                <Flag className="w-3.5 h-3.5" />
                {priorityConfig[priority].label}
              </button>
              {showPriorityDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors",
                        priorityConfig[p].color,
                        p === priority && "bg-accent"
                      )}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {priorityConfig[p].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Due date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Prazo
              </label>
              <input
                type="date"
                value={dueDate ? dueDate.split("T")[0] : ""}
                onChange={(e) => handleDueDateChange(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                  isOverdue
                    ? "border-destructive text-destructive"
                    : "border-input text-foreground"
                )}
              />
              {isOverdue && (
                <p className="text-xs text-destructive font-medium">Atrasada!</p>
              )}
            </div>

            {/* Column */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Columns3 className="w-4 h-4 text-muted-foreground" />
                Coluna
              </label>
              <select
                value={columnId}
                onChange={(e) => handleColumnChange(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" />
                Atribuidos
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  disabled={availableMembers.length === 0}
                  className="text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Adicionar
                </button>
                {showAssigneeDropdown && availableMembers.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                    {availableMembers.map((m) => {
                      const name = m.profiles?.full_name || m.profiles?.email || "?";
                      return (
                        <button
                          key={m.user_id}
                          onClick={() => addAssignee(m.user_id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          {m.profiles?.avatar_url ? (
                            <img
                              src={m.profiles.avatar_url}
                              alt={name}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                              style={{ backgroundColor: generateColor(name) }}
                            >
                              {getInitials(name)}
                            </div>
                          )}
                          <span className="truncate">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {assignees.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum membro atribuido</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignees.map((a: any) => {
                  const name = a.profiles?.full_name || a.profiles?.email || "?";
                  return (
                    <div
                      key={a.user_id}
                      className="flex items-center gap-2 px-2 py-1 bg-accent/50 rounded-lg group"
                    >
                      {a.profiles?.avatar_url ? (
                        <img
                          src={a.profiles.avatar_url}
                          alt={name}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ backgroundColor: generateColor(name) }}
                        >
                          {getInitials(name)}
                        </div>
                      )}
                      <span className="text-xs text-foreground">{name}</span>
                      <button
                        onClick={() => removeAssignee(a.user_id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Comments */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Comentarios
            </label>

            {/* Add comment */}
            <div className="flex items-start gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                style={{
                  backgroundColor: generateColor(
                    orgMembers.find((m) => m.user_id === currentUserId)?.profiles?.full_name ||
                      currentUserId
                  ),
                }}
              >
                {getInitials(
                  orgMembers.find((m) => m.user_id === currentUserId)?.profiles?.full_name ||
                    "Eu"
                )}
              </div>
              <div className="flex-1 flex gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleCommentKeyDown}
                  placeholder="Escreva um comentario..."
                  rows={1}
                  className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || sendingComment}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                >
                  {sendingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Comments list */}
            {loadingComments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum comentario ainda</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const authorName =
                    comment.profiles?.full_name || comment.profiles?.email || "?";
                  return (
                    <div key={comment.id} className="flex items-start gap-2">
                      {comment.profiles?.avatar_url ? (
                        <img
                          src={comment.profiles.avatar_url}
                          alt={authorName}
                          className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                          style={{ backgroundColor: generateColor(authorName) }}
                        >
                          {getInitials(authorName)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {authorName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Footer: Created info + Delete */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Criado em {formatDate(card.created_at)}
            </div>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Deletar tarefa
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
