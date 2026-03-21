"use client";

import { useState, useRef, useEffect } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { KanbanCard, type VisibleFields } from "./KanbanCard";
import { Plus, MoreHorizontal, Pencil, Palette, Gauge, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { cn } from "@/lib/utils/helpers";
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

interface Props {
  column: Column;
  cards: CardWithRelations[];
  currentUserId: string;
  boardId: string;
  visibleFields?: VisibleFields;
  onCardClick?: (card: CardWithRelations) => void;
  onColumnUpdated?: (column: Column) => void;
  onColumnDeleted?: (columnId: string) => void;
}

export function KanbanColumn({ column, cards, currentUserId, boardId, visibleFields, onCardClick, onColumnUpdated, onColumnDeleted }: Props) {
  const supabase = createClient();
  const { addCard } = useKanbanStore();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDueDate, setNewCardDueDate] = useState("");

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
    if (!newCardTitle.trim() || !newCardDueDate) return;
    const position = cards.length;
    const { data } = await supabase
      .from("cards")
      .insert({
        column_id: column.id,
        board_id: boardId,
        title: newCardTitle.trim(),
        due_date: newCardDueDate,
        position,
        priority: "medium",
        created_by: currentUserId,
      })
      .select()
      .single();

    if (data) {
      addCard({ ...data, card_assignees: [] });
    }
    setNewCardTitle("");
    setNewCardDueDate("");
    setAddingCard(false);
  }

  return (
    <div className={cn("shrink-0 w-72 flex flex-col rounded-xl bg-muted/50 border", isOverLimit ? "border-destructive/50" : "border-border")}>
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
            className={cn("flex-1 px-2 pb-2 space-y-2 min-h-16 transition-colors", snapshot.isDraggingOver && "bg-primary/5")}
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
      <div className="px-2 pb-2">
        {addingCard ? (
          <div className="bg-card border border-border rounded-lg p-2">
            <textarea
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Titulo do card..."
              rows={2}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(); }
                if (e.key === "Escape") setAddingCard(false);
              }}
            />
            <input
              type="date"
              value={newCardDueDate}
              onChange={(e) => setNewCardDueDate(e.target.value)}
              className="w-full mt-1 px-2 py-1 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Prazo de entrega"
              required
            />
            {!newCardDueDate && (
              <p className="text-xs text-destructive mt-0.5">Prazo obrigatório</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddCard}
                disabled={!newCardTitle.trim() || !newCardDueDate}
                className="flex-1 bg-primary text-primary-foreground py-1 rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Adicionar
              </button>
              <button onClick={() => setAddingCard(false)} className="px-2 py-1 text-muted-foreground hover:text-foreground text-xs">
                Cancelar
              </button>
            </div>
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
