"use client";

import { useState } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { KanbanCard } from "./KanbanCard";
import { Plus, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { cn } from "@/lib/utils/helpers";
import type { Column, Card } from "@/lib/types/database";

interface Props {
  column: Column;
  cards: (Card & { card_assignees: any[] })[];
  currentUserId: string;
  boardId: string;
}

export function KanbanColumn({ column, cards, currentUserId, boardId }: Props) {
  const supabase = createClient();
  const { addCard } = useKanbanStore();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");

  const isOverLimit = column.wip_limit !== null && cards.length >= column.wip_limit;

  async function handleAddCard() {
    if (!newCardTitle.trim()) return;
    const position = cards.length;
    const { data } = await supabase
      .from("cards")
      .insert({
        column_id: column.id,
        board_id: boardId,
        title: newCardTitle.trim(),
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
    setAddingCard(false);
  }

  return (
    <div className={cn("shrink-0 w-72 flex flex-col rounded-xl bg-muted/50 border", isOverLimit ? "border-destructive/50" : "border-border")}>
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="font-semibold text-sm text-foreground">{column.name}</h3>
          <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", isOverLimit ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
            {cards.length}{column.wip_limit ? `/${column.wip_limit}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddingCard(true)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <Plus className="w-4 h-4" />
          </button>
          <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <MoreHorizontal className="w-4 h-4" />
          </button>
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
                  >
                    <KanbanCard card={card} isDragging={snapshot.isDragging} />
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
              placeholder="Título do card..."
              rows={2}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(); }
                if (e.key === "Escape") setAddingCard(false);
              }}
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleAddCard} className="flex-1 bg-primary text-primary-foreground py-1 rounded-md text-xs font-medium hover:bg-primary/90">
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
