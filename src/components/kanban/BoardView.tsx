"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { Plus, Settings } from "lucide-react";
import type { Board, Column, Card } from "@/lib/types/database";

interface Props {
  board: Board;
  initialColumns: Column[];
  initialCards: (Card & { card_assignees: any[] })[];
  currentUserId: string;
}

export function BoardView({ board, initialColumns, initialCards, currentUserId }: Props) {
  const supabase = createClient();
  const { columns, cards, setColumns, setCards, moveCard } = useKanbanStore();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  useEffect(() => {
    setColumns(board.id, initialColumns);
    for (const col of initialColumns) {
      const colCards = initialCards.filter((c) => c.column_id === col.id);
      setCards(col.id, colCards);
    }
  }, [board.id]);

  const boardColumns = columns[board.id] || [];

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    moveCard(draggableId, source.droppableId, destination.droppableId, destination.index);

    await supabase.from("cards").update({
      column_id: destination.droppableId,
      position: destination.index,
    }).eq("id", draggableId);
  }

  async function addColumn() {
    if (!newColumnName.trim()) return;
    const position = boardColumns.length;
    const { data } = await supabase.from("columns").insert({
      board_id: board.id,
      name: newColumnName.trim(),
      position,
    }).select().single();
    if (data) {
      setColumns(board.id, [...boardColumns, data]);
      setCards(data.id, []);
    }
    setNewColumnName("");
    setAddingColumn(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="font-bold text-foreground text-lg">{board.name}</h2>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-6 overflow-x-auto h-full">
          {boardColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={cards[column.id] || []}
              currentUserId={currentUserId}
              boardId={board.id}
            />
          ))}

          {/* Add Column */}
          <div className="shrink-0 w-72">
            {addingColumn ? (
              <div className="bg-card border border-border rounded-xl p-3">
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Nome da coluna"
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addColumn();
                    if (e.key === "Escape") setAddingColumn(false);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={addColumn}
                    className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90"
                  >
                    Adicionar
                  </button>
                  <button
                    onClick={() => setAddingColumn(false)}
                    className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent px-3 py-2.5 rounded-xl text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar coluna
              </button>
            )}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
