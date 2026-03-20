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
  Tags,
  Plus,
  ListChecks,
  Square,
  CheckSquare,
  GripVertical,
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
  boardLabels?: { id: string; name: string; color: string }[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (updatedCard: any) => void;
  onDeleted: (cardId: string) => void;
  onLabelsChanged?: () => void;
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

interface Subtask {
  id: string;
  card_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
}

const priorityConfig = {
  urgent: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", label: "Urgente" },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Alta" },
  medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Media" },
  low: { color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", label: "Baixa" },
  none: { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", label: "Nenhuma" },
};

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

export function CardDetailModal({
  card,
  boardId,
  columns,
  orgMembers,
  boardLabels = [],
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
  onLabelsChanged,
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

  // Labels
  const [cardLabels, setCardLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);

  // Subtasks
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(true);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");

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
    loadCardLabels();
    loadSubtasks();
  }, []);

  async function loadCardLabels() {
    const { data } = await supabase
      .from("card_labels")
      .select("label_id, labels(id, name, color)")
      .eq("card_id", card.id);
    if (data) {
      setCardLabels((data as any[]).map((r) => r.labels).filter(Boolean));
    }
  }

  async function addLabelToCard(label: { id: string; name: string; color: string }) {
    const { error } = await supabase
      .from("card_labels")
      .insert({ card_id: card.id, label_id: label.id });
    if (!error) {
      setCardLabels((prev) => [...prev, label]);
      onLabelsChanged?.();
    }
  }

  async function removeLabelFromCard(labelId: string) {
    const { error } = await supabase
      .from("card_labels")
      .delete()
      .eq("card_id", card.id)
      .eq("label_id", labelId);
    if (!error) {
      setCardLabels((prev) => prev.filter((l) => l.id !== labelId));
      onLabelsChanged?.();
    }
  }

  async function handleCreateLabel() {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("labels")
      .insert({ board_id: boardId, name: trimmed, color: newLabelColor })
      .select()
      .single();
    if (!error && data) {
      setNewLabelName("");
      setNewLabelColor(LABEL_COLORS[0]);
      setCreatingLabel(false);
      onLabelsChanged?.();
      // Auto-add to card
      await addLabelToCard(data);
    }
  }

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

  async function loadSubtasks() {
    setLoadingSubtasks(true);
    const { data } = await supabase
      .from("subtasks")
      .select("*")
      .eq("card_id", card.id)
      .order("position", { ascending: true });
    if (data) setSubtasks(data as Subtask[]);
    setLoadingSubtasks(false);
  }

  async function handleAddSubtask() {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    setAddingSubtask(true);
    const nextPos = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.position)) + 1 : 0;
    const { error } = await supabase.from("subtasks").insert({
      card_id: card.id,
      title: trimmed,
      is_completed: false,
      position: nextPos,
      assigned_to: null,
      created_by: currentUserId,
    });
    if (!error) {
      setNewSubtaskTitle("");
      await loadSubtasks();
    }
    setAddingSubtask(false);
  }

  async function handleToggleSubtask(subtaskId: string, currentState: boolean) {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, is_completed: !currentState } : s))
    );
    await supabase
      .from("subtasks")
      .update({ is_completed: !currentState })
      .eq("id", subtaskId);
  }

  async function handleDeleteSubtask(subtaskId: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    await supabase.from("subtasks").delete().eq("id", subtaskId);
  }

  async function handleEditSubtaskSave(subtaskId: string) {
    const trimmed = editingSubtaskTitle.trim();
    if (!trimmed) {
      setEditingSubtaskId(null);
      return;
    }
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, title: trimmed } : s))
    );
    setEditingSubtaskId(null);
    await supabase.from("subtasks").update({ title: trimmed }).eq("id", subtaskId);
  }

  const completedSubtasks = subtasks.filter((s) => s.is_completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

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
    await supabase.from("subtasks").delete().eq("card_id", card.id);
    await supabase.from("card_labels").delete().eq("card_id", card.id);
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

          {/* Labels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Tags className="w-4 h-4 text-muted-foreground" />
                Labels
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  + Adicionar label
                </button>
                {showLabelDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-20 max-h-72 overflow-y-auto">
                    <div className="p-2 space-y-1">
                      {boardLabels.map((label) => {
                        const isActive = cardLabels.some((cl) => cl.id === label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => isActive ? removeLabelFromCard(label.id) : addLabelToCard(label)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                              isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
                            )}
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: label.color }}
                            />
                            <span className="truncate flex-1 text-left">{label.name}</span>
                            {isActive && <span className="text-xs text-primary">&#10003;</span>}
                          </button>
                        );
                      })}
                      {boardLabels.length === 0 && !creatingLabel && (
                        <p className="text-xs text-muted-foreground px-3 py-2">Nenhuma label criada</p>
                      )}
                    </div>
                    <div className="border-t border-border p-2">
                      {creatingLabel ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newLabelName}
                            onChange={(e) => setNewLabelName(e.target.value)}
                            placeholder="Nome da label"
                            className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateLabel();
                              if (e.key === "Escape") setCreatingLabel(false);
                            }}
                          />
                          <div className="flex gap-1.5">
                            {LABEL_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => setNewLabelColor(color)}
                                className={cn(
                                  "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                                  newLabelColor === color ? "border-foreground" : "border-transparent"
                                )}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateLabel}
                              className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:bg-primary/90"
                            >
                              Criar
                            </button>
                            <button
                              onClick={() => setCreatingLabel(false)}
                              className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingLabel(true)}
                          className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-accent transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Criar nova label
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {cardLabels.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma label</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cardLabels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-1 font-medium text-white group"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                    <button
                      onClick={() => removeLabelFromCard(label.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white/70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Subtasks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-muted-foreground" />
                Subtarefas
                {subtasks.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({completedSubtasks}/{subtasks.length})
                  </span>
                )}
              </label>
            </div>

            {/* Progress bar */}
            {subtasks.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      subtaskProgress === 100 ? "bg-green-500" : "bg-primary"
                    )}
                    style={{ width: `${subtaskProgress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {subtaskProgress}%
                </span>
              </div>
            )}

            {/* Subtask list */}
            {loadingSubtasks ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1">
                {subtasks.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 group py-1 px-1 rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <button
                      onClick={() => handleToggleSubtask(st.id, st.is_completed)}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {st.is_completed ? (
                        <CheckSquare className="w-4 h-4 text-green-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {editingSubtaskId === st.id ? (
                      <input
                        type="text"
                        value={editingSubtaskTitle}
                        onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                        onBlur={() => handleEditSubtaskSave(st.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSubtaskSave(st.id);
                          if (e.key === "Escape") setEditingSubtaskId(null);
                        }}
                        className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                    ) : (
                      <span
                        onClick={() => {
                          setEditingSubtaskId(st.id);
                          setEditingSubtaskTitle(st.title);
                        }}
                        className={cn(
                          "flex-1 text-sm cursor-pointer",
                          st.is_completed
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        )}
                      >
                        {st.title}
                      </span>
                    )}

                    <button
                      onClick={() => handleDeleteSubtask(st.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add subtask input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubtask();
                }}
                placeholder="Adicionar subtarefa..."
                className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim() || addingSubtask}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                {addingSubtask ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>
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
