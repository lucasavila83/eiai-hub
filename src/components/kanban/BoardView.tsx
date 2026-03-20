"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { CardDetailModal } from "./CardDetailModal";
import { LabelManagerModal } from "./LabelManagerModal";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { Plus, Settings, Tags } from "lucide-react";
import { BoardSettingsModal } from "./BoardSettingsModal";
import type { Board, Column, Card } from "@/lib/types/database";

interface Props {
  board: Board;
  initialColumns: Column[];
  initialCards: (Card & { card_assignees: any[] })[];
  currentUserId: string;
}

export function BoardView({ board, initialColumns, initialCards, currentUserId }: Props) {
  const supabase = createClient();
  const { columns, cards, setColumns, setCards, moveCard, updateCard, removeCard } = useKanbanStore();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [selectedCard, setSelectedCard] = useState<(Card & { card_assignees: any[] }) | null>(null);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [boardLabels, setBoardLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [cardLabelsMap, setCardLabelsMap] = useState<Record<string, { id: string; name: string; color: string }[]>>({});
  const [subtaskCounts, setSubtaskCounts] = useState<Record<string, { total: number; completed: number }>>({});

  useEffect(() => {
    setColumns(board.id, initialColumns);
    for (const col of initialColumns) {
      const colCards = initialCards.filter((c) => c.column_id === col.id);
      setCards(col.id, colCards);
    }
    loadLabels();
    loadSubtaskCounts();
  }, [board.id]);

  async function loadLabels() {
    // Load board labels
    const { data: labels } = await supabase
      .from("labels")
      .select("*")
      .eq("board_id", board.id);
    if (labels) setBoardLabels(labels);

    // Load card labels
    const cardIds = initialCards.map((c) => c.id);
    if (cardIds.length === 0) return;
    const { data: cardLabelsData } = await supabase
      .from("card_labels")
      .select("card_id, labels(id, name, color)")
      .in("card_id", cardIds);
    if (cardLabelsData) {
      const map: Record<string, { id: string; name: string; color: string }[]> = {};
      for (const row of cardLabelsData as any[]) {
        if (!map[row.card_id]) map[row.card_id] = [];
        if (row.labels) map[row.card_id].push(row.labels);
      }
      setCardLabelsMap(map);
    }
  }

  async function loadSubtaskCounts() {
    const cardIds = initialCards.map((c) => c.id);
    if (cardIds.length === 0) return;
    const { data } = await supabase
      .from("subtasks")
      .select("card_id, is_completed")
      .in("card_id", cardIds);
    if (data) {
      const counts: Record<string, { total: number; completed: number }> = {};
      for (const row of data) {
        if (!counts[row.card_id]) counts[row.card_id] = { total: 0, completed: 0 };
        counts[row.card_id].total++;
        if (row.is_completed) counts[row.card_id].completed++;
      }
      setSubtaskCounts(counts);
    }
  }

  useEffect(() => {
    supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email)")
      .eq("org_id", board.org_id)
      .then(({ data }) => {
        if (data) setOrgMembers(data);
      });
  }, [board.org_id]);

  const boardColumns = columns[board.id] || [];

  function handleColumnUpdated(updatedColumn: Column) {
    const updated = boardColumns.map((c) => (c.id === updatedColumn.id ? updatedColumn : c));
    setColumns(board.id, updated);
  }

  function handleColumnDeleted(columnId: string) {
    const filtered = boardColumns.filter((c) => c.id !== columnId);
    setColumns(board.id, filtered);
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLabelManager(true)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <Tags className="w-4 h-4" />
            Labels
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-6 overflow-x-auto h-full">
          {boardColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={(cards[column.id] || []).map((c) => ({
                ...c,
                labels: cardLabelsMap[c.id] || [],
                subtaskCount: subtaskCounts[c.id]?.total,
                subtaskCompleted: subtaskCounts[c.id]?.completed,
              }))}
              currentUserId={currentUserId}
              boardId={board.id}
              onCardClick={(card) => setSelectedCard(card)}
              onColumnUpdated={handleColumnUpdated}
              onColumnDeleted={handleColumnDeleted}
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

      {showSettings && (
        <BoardSettingsModal
          board={board}
          currentUserId={currentUserId}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showLabelManager && (
        <LabelManagerModal
          boardId={board.id}
          labels={boardLabels}
          onClose={() => setShowLabelManager(false)}
          onLabelsChanged={loadLabels}
        />
      )}

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          boardId={board.id}
          columns={boardColumns.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
          orgMembers={orgMembers}
          boardLabels={boardLabels}
          currentUserId={currentUserId}
          onClose={() => setSelectedCard(null)}
          onUpdated={(updatedCard) => {
            updateCard(updatedCard.id, updatedCard);
            setSelectedCard(updatedCard);
          }}
          onDeleted={(cardId) => {
            removeCard(cardId, selectedCard.column_id);
            setSelectedCard(null);
          }}
          onLabelsChanged={loadLabels}
        />
      )}
    </div>
  );
}
