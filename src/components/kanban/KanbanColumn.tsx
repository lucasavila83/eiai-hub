"use client";

import { useState, useRef, useEffect } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { KanbanCard, type VisibleFields } from "./KanbanCard";
import { Plus, MoreHorizontal, Pencil, Palette, Gauge, Trash2, X, Calendar, Users, Flag, Tag, Clock, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import type { Column, Card } from "@/lib/types/database";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
];

type CardWithRelations = Card & {
  card_assignees: any[];
  labels?: { id: string; name: string; color: string }[];
  subtaskCount?: number;
  subtaskCompleted?: number;
};

const PRIORITIES = [
  { value: "none", label: "Nenhuma", color: "text-muted-foreground" },
  { value: "low", label: "Baixa", color: "text-blue-500" },
  { value: "medium", label: "Média", color: "text-yellow-500" },
  { value: "high", label: "Alta", color: "text-orange-500" },
  { value: "urgent", label: "Urgente", color: "text-red-500" },
];

interface Props {
  column: Column;
  cards: CardWithRelations[];
  currentUserId: string;
  boardId: string;
  visibleFields?: VisibleFields;
  boardMembers?: any[];
  boardLabels?: { id: string; name: string; color: string }[];
  onCardClick?: (card: CardWithRelations) => void;
  onColumnUpdated?: (column: Column) => void;
  onColumnDeleted?: (columnId: string) => void;
}

export function KanbanColumn({ column, cards, currentUserId, boardId, visibleFields, boardMembers = [], boardLabels = [], onCardClick, onColumnUpdated, onColumnDeleted }: Props) {
  const supabase = createClient();
  const { addCard } = useKanbanStore();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDueDate, setNewCardDueDate] = useState("");
  const [newCardDueTime, setNewCardDueTime] = useState("");
  const [newCardAssigneeIds, setNewCardAssigneeIds] = useState<string[]>([]);
  const [newCardPriority, setNewCardPriority] = useState("none");
  const [newCardLabelIds, setNewCardLabelIds] = useState<string[]>([]);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<"rename" | "color" | "wip" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Inline rename
  const [editName, setEditName] = useState(column.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // WIP limit
  const [wipValue, setWipValue] = useState(column.wip_limit?.toString() ?? "");

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOverLimit = column.wip_limit !== null && cards.length >= column.wip_limit;

  // Refs for click-outside on add-card dropdowns
  const addCardFormRef = useRef<HTMLDivElement>(null);
  const addCardFormEndRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Auto-scroll to add card form when it opens
  useEffect(() => {
    if (addingCard) {
      // Wait for render, then scroll the form into view
      requestAnimationFrame(() => {
        addCardFormEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [addingCard]);

  // Click-outside to close the entire add card form
  useEffect(() => {
    if (!addingCard) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        addCardFormRef.current &&
        !addCardFormRef.current.contains(target) &&
        (!assigneeDropdownRef.current || !assigneeDropdownRef.current.contains(target)) &&
        (!priorityDropdownRef.current || !priorityDropdownRef.current.contains(target)) &&
        (!labelDropdownRef.current || !labelDropdownRef.current.contains(target))
      ) {
        resetAddForm();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addingCard]);

  // Close add-card dropdowns on outside click
  useEffect(() => {
    const anyOpen = showAssigneeDropdown || showPriorityDropdown || showLabelDropdown;
    if (!anyOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (showAssigneeDropdown && assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(target)) {
        setShowAssigneeDropdown(false);
      }
      if (showPriorityDropdown && priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)) {
        setShowPriorityDropdown(false);
      }
      if (showLabelDropdown && labelDropdownRef.current && !labelDropdownRef.current.contains(target)) {
        setShowLabelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAssigneeDropdown, showPriorityDropdown, showLabelDropdown]);

  function closeMenu() {
    setMenuOpen(false);
    setActiveAction(null);
    setConfirmDelete(false);
  }

  function openAction(action: "rename" | "color" | "wip") {
    setActiveAction(action);
    if (action === "rename") {
      setEditName(column.name);
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
    if (action === "wip") {
      setWipValue(column.wip_limit?.toString() ?? "");
    }
  }

  async function handleRename() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === column.name) {
      setActiveAction(null);
      return;
    }
    const { data } = await supabase
      .from("columns")
      .update({ name: trimmed })
      .eq("id", column.id)
      .select()
      .single();
    if (data) onColumnUpdated?.(data);
    closeMenu();
  }

  async function handleColorChange(color: string) {
    const { data } = await supabase
      .from("columns")
      .update({ color })
      .eq("id", column.id)
      .select()
      .single();
    if (data) onColumnUpdated?.(data);
    closeMenu();
  }

  async function handleWipSave() {
    const parsed = wipValue.trim() === "" ? null : parseInt(wipValue, 10);
    if (wipValue.trim() !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) return;
    const { data } = await supabase
      .from("columns")
      .update({ wip_limit: parsed })
      .eq("id", column.id)
      .select()
      .single();
    if (data) onColumnUpdated?.(data);
    closeMenu();
  }

  async function handleDelete() {
    if (cards.length > 0) return;
    const { error } = await supabase.from("columns").delete().eq("id", column.id);
    if (!error) onColumnDeleted?.(column.id);
    closeMenu();
  }

  async function handleAddCard() {
    if (!newCardTitle.trim() || !newCardDueDate || newCardAssigneeIds.length === 0) return;
    const position = cards.length;
    const dueDateTime = newCardDueTime
      ? `${newCardDueDate}T${newCardDueTime}`
      : newCardDueDate;

    const { data } = await supabase
      .from("cards")
      .insert({
        column_id: column.id,
        board_id: boardId,
        title: newCardTitle.trim(),
        due_date: dueDateTime,
        position,
        priority: newCardPriority,
        created_by: currentUserId,
      } as any)
      .select()
      .single();

    if (data) {
      // Assign members
      if (newCardAssigneeIds.length > 0) {
        await supabase.from("card_assignees").insert(
          newCardAssigneeIds.map((uid) => ({ card_id: (data as any).id, user_id: uid })) as any
        );
      }
      // Assign labels
      if (newCardLabelIds.length > 0) {
        await supabase.from("card_labels").insert(
          newCardLabelIds.map((lid) => ({ card_id: (data as any).id, label_id: lid })) as any
        );
      }
      addCard({ ...data, card_assignees: newCardAssigneeIds.map((uid) => ({ user_id: uid })) } as any);
    }
    resetAddForm();
  }

  function resetAddForm() {
    setNewCardTitle("");
    setNewCardDueDate("");
    setNewCardDueTime("");
    setNewCardAssigneeIds([]);
    setNewCardPriority("none");
    setNewCardLabelIds([]);
    setShowAssigneeDropdown(false);
    setShowPriorityDropdown(false);
    setShowLabelDropdown(false);
    setAddingCard(false);
  }

  return (
    <div className={cn("shrink-0 w-72 flex flex-col rounded-xl bg-muted/50 border max-h-full", isOverLimit ? "border-destructive/50" : "border-border")}>
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
          {activeAction === "rename" ? (
            <input
              ref={renameInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") { setActiveAction(null); setMenuOpen(false); }
              }}
              onBlur={handleRename}
              className="font-semibold text-sm text-foreground bg-background border border-input rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <h3 className="font-semibold text-sm text-foreground truncate">{column.name}</h3>
          )}
          <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", isOverLimit ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
            {cards.length}{column.wip_limit ? `/${column.wip_limit}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 relative" ref={menuRef}>
          <button onClick={() => setAddingCard(true)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => { if (menuOpen) closeMenu(); else setMenuOpen(true); }}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && !activeAction && (
            <div className="absolute right-0 top-7 z-50 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 text-sm">
              <button
                onClick={() => openAction("rename")}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-popover-foreground hover:bg-accent transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Renomear
              </button>
              <button
                onClick={() => openAction("color")}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-popover-foreground hover:bg-accent transition-colors"
              >
                <Palette className="w-3.5 h-3.5" />
                Cor
              </button>
              <button
                onClick={() => openAction("wip")}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-popover-foreground hover:bg-accent transition-colors"
              >
                <Gauge className="w-3.5 h-3.5" />
                Limite WIP
              </button>
              <div className="border-t border-border my-1" />
              {cards.length > 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Mova os cards antes de deletar
                </div>
              ) : !confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Deletar coluna
                </button>
              ) : (
                <div className="px-3 py-2 space-y-2">
                  <p className="text-xs text-destructive font-medium">Confirmar exclusao?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 bg-destructive text-destructive-foreground text-xs py-1 rounded hover:bg-destructive/90"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 text-xs py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                    >
                      Nao
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Color Picker Panel */}
          {menuOpen && activeAction === "color" && (
            <div className="absolute right-0 top-7 z-50 w-48 bg-popover border border-border rounded-lg shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-popover-foreground">Escolha uma cor</span>
                <button onClick={closeMenu} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                      column.color === color ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* WIP Limit Panel */}
          {menuOpen && activeAction === "wip" && (
            <div className="absolute right-0 top-7 z-50 w-48 bg-popover border border-border rounded-lg shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-popover-foreground">Limite WIP</span>
                <button onClick={closeMenu} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="number"
                min={0}
                value={wipValue}
                onChange={(e) => setWipValue(e.target.value)}
                placeholder="Sem limite"
                className="w-full bg-background border border-input rounded-md px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleWipSave();
                  if (e.key === "Escape") closeMenu();
                }}
              />
              <button
                onClick={handleWipSave}
                className="w-full bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:bg-primary/90"
              >
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn("flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-16 transition-colors scrollbar-thin", snapshot.isDraggingOver && "bg-primary/5")}
          >
            {cards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => {
                      if (!snapshot.isDragging) onCardClick?.(card);
                    }}
                  >
                    <KanbanCard card={card} labels={card.labels} subtaskCount={card.subtaskCount} subtaskCompleted={card.subtaskCompleted} attachmentCount={card.attachmentCount} isDragging={snapshot.isDragging} visibleFields={visibleFields} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add Card */}
      <div className="px-2 pb-2 shrink-0">
        {addingCard ? (
          <div ref={addCardFormRef} className="bg-card border border-primary/30 rounded-lg p-3 shadow-sm space-y-2">
            {/* Title */}
            <div className="flex items-center gap-2">
              <input
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                placeholder="Nome da tarefa..."
                className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(); }
                  if (e.key === "Escape") resetAddForm();
                }}
              />
              <button
                onClick={handleAddCard}
                disabled={!newCardTitle.trim() || !newCardDueDate || newCardAssigneeIds.length === 0}
                className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50 shrink-0 flex items-center gap-1"
              >
                Salvar
              </button>
            </div>

            <div className="text-xs text-muted-foreground">{column.name}</div>

            {/* Assignee */}
            <div className="relative" ref={assigneeDropdownRef}>
              <button
                type="button"
                onClick={() => { setShowAssigneeDropdown(!showAssigneeDropdown); setShowPriorityDropdown(false); setShowLabelDropdown(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  newCardAssigneeIds.length > 0 ? "text-foreground bg-primary/5" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                {newCardAssigneeIds.length > 0
                  ? `${newCardAssigneeIds.length} responsável(is)`
                  : "Adicionar responsável *"}
              </button>
              {showAssigneeDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                  {boardMembers.map((m: any) => {
                    const name = m.profiles?.full_name || m.profiles?.email || "?";
                    const selected = newCardAssigneeIds.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => {
                          setNewCardAssigneeIds((prev) =>
                            selected ? prev.filter((id) => id !== m.user_id) : [...prev, m.user_id]
                          );
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                          selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                        )}
                      >
                        {m.profiles?.avatar_url ? (
                          <img src={m.profiles.avatar_url} alt={name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: generateColor(name) }}>
                            {getInitials(name)}
                          </div>
                        )}
                        <span className="truncate">{name}</span>
                        {selected && <span className="ml-auto text-primary">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date + Time */}
            <div className="flex gap-1.5">
              <div className="flex-1 relative">
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById(`date-${column.id}`) as HTMLInputElement;
                    input?.showPicker?.();
                    input?.focus();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                    newCardDueDate ? "text-foreground bg-primary/5" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {newCardDueDate
                    ? new Date(newCardDueDate + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                    : "Adicionar data *"}
                </button>
                <input
                  id={`date-${column.id}`}
                  type="date"
                  value={newCardDueDate}
                  onChange={(e) => setNewCardDueDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              {newCardDueDate && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById(`time-${column.id}`) as HTMLInputElement;
                      input?.showPicker?.();
                      input?.focus();
                    }}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
                      newCardDueTime ? "text-foreground bg-primary/5" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {newCardDueTime || "Hora"}
                  </button>
                  <input
                    id={`time-${column.id}`}
                    type="time"
                    value={newCardDueTime}
                    onChange={(e) => setNewCardDueTime(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Priority */}
            <div className="relative" ref={priorityDropdownRef}>
              <button
                type="button"
                onClick={() => { setShowPriorityDropdown(!showPriorityDropdown); setShowAssigneeDropdown(false); setShowLabelDropdown(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  newCardPriority !== "none" ? "text-foreground bg-primary/5" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Flag className="w-3.5 h-3.5 shrink-0" />
                {newCardPriority !== "none"
                  ? PRIORITIES.find((p) => p.value === newCardPriority)?.label
                  : "Adicionar prioridade"}
              </button>
              {showPriorityDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl z-50">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => { setNewCardPriority(p.value); setShowPriorityDropdown(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-accent",
                        p.color
                      )}
                    >
                      <Flag className="w-3 h-3" />
                      {p.label}
                      {newCardPriority === p.value && <span className="ml-auto">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Labels/Tags */}
            <div className="relative" ref={labelDropdownRef}>
              <button
                type="button"
                onClick={() => { setShowLabelDropdown(!showLabelDropdown); setShowAssigneeDropdown(false); setShowPriorityDropdown(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  newCardLabelIds.length > 0 ? "text-foreground bg-primary/5" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Tag className="w-3.5 h-3.5 shrink-0" />
                {newCardLabelIds.length > 0
                  ? `${newCardLabelIds.length} tag(s)`
                  : "Adicionar tags"}
              </button>
              {showLabelDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                  {boardLabels.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      Nenhuma label criada. Use o gerenciador de Labels.
                    </div>
                  ) : boardLabels.map((label) => {
                    const selected = newCardLabelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        onClick={() => {
                          setNewCardLabelIds((prev) =>
                            selected ? prev.filter((id) => id !== label.id) : [...prev, label.id]
                          );
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                          selected ? "bg-primary/10" : "hover:bg-accent"
                        )}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                        <span className="truncate text-foreground">{label.name}</span>
                        {selected && <span className="ml-auto text-primary">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div ref={addCardFormEndRef} />
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar card
          </button>
        )}
      </div>
    </div>
  );
}
