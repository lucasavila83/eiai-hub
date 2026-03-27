"use client";

import { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { CardDetailModal } from "./CardDetailModal";
import { LabelManagerModal } from "./LabelManagerModal";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/lib/stores/kanban-store";
import { Plus, Settings, Tags, SlidersHorizontal, Filter, X, FileText, LayoutGrid, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import Link from "next/link";
import { BoardSettingsModal } from "./BoardSettingsModal";
import { DocumentsTab } from "./DocumentsTab";
import { defaultVisibleFields, type VisibleFields } from "./KanbanCard";
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
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});

  // Field visibility state
  const [visibleFields, setVisibleFields] = useState<VisibleFields>({ ...defaultVisibleFields });
  const [showFieldsPopover, setShowFieldsPopover] = useState(false);
  const fieldsPopoverRef = useRef<HTMLDivElement>(null);

  // Active view tab
  const [activeView, setActiveView] = useState<"kanban" | "documents">("kanban");

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterDue, setFilterDue] = useState<string>(""); // "overdue" | "today" | "this_week" | ""
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = filterPriority || filterAssignee || filterDue;

  function filterCards(columnCards: (Card & { card_assignees: any[] })[]) {
    let filtered = columnCards;
    if (filterPriority) {
      filtered = filtered.filter((c) => c.priority === filterPriority);
    }
    if (filterAssignee) {
      if (filterAssignee === "__me__") {
        filtered = filtered.filter((c) =>
          c.card_assignees?.some((a: any) => a.user_id === currentUserId)
        );
      } else {
        filtered = filtered.filter((c) =>
          c.card_assignees?.some((a: any) => a.user_id === filterAssignee)
        );
      }
    }
    if (filterDue) {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      if (filterDue === "overdue") {
        filtered = filtered.filter((c) => c.due_date && c.due_date < todayStr && !c.completed_at);
      } else if (filterDue === "today") {
        filtered = filtered.filter((c) => c.due_date === todayStr);
      } else if (filterDue === "this_week") {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
        const weekEndStr = weekEnd.toISOString().split("T")[0];
        filtered = filtered.filter((c) => c.due_date && c.due_date >= todayStr && c.due_date <= weekEndStr);
      }
    }
    return filtered;
  }

  function clearFilters() {
    setFilterPriority("");
    setFilterAssignee("");
    setFilterDue("");
  }

  // Close fields popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fieldsPopoverRef.current && !fieldsPopoverRef.current.contains(e.target as Node)) {
        setShowFieldsPopover(false);
      }
    }
    if (showFieldsPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showFieldsPopover]);

  function toggleField(field: keyof VisibleFields) {
    setVisibleFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  useEffect(() => {
    setColumns(board.id, initialColumns);
    for (const col of initialColumns) {
      const colCards = initialCards.filter((c) => c.column_id === col.id);
      setCards(col.id, colCards);
    }
    loadLabels();
    loadSubtaskCounts();
    loadAttachmentCounts();
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

    // Load from both subtasks AND checklist_items
    const [subtasksRes, checklistItemsRes] = await Promise.all([
      supabase.from("subtasks").select("card_id, is_completed").in("card_id", cardIds),
      supabase.from("checklist_items").select("checklist_id, is_completed, checklists!inner(card_id)").in("checklists.card_id", cardIds),
    ]);

    const counts: Record<string, { total: number; completed: number }> = {};

    // Count subtasks
    if (subtasksRes.data) {
      for (const row of subtasksRes.data) {
        if (!counts[row.card_id]) counts[row.card_id] = { total: 0, completed: 0 };
        counts[row.card_id].total++;
        if (row.is_completed) counts[row.card_id].completed++;
      }
    }

    // Count checklist items
    if (checklistItemsRes.data) {
      for (const row of checklistItemsRes.data as any[]) {
        const cardId = row.checklists?.card_id;
        if (!cardId) continue;
        if (!counts[cardId]) counts[cardId] = { total: 0, completed: 0 };
        counts[cardId].total++;
        if (row.is_completed) counts[cardId].completed++;
      }
    }

    setSubtaskCounts(counts);
  }

  async function loadAttachmentCounts() {
    const cardIds = initialCards.map((c) => c.id);
    if (cardIds.length === 0) return;
    const { data } = await supabase
      .from("card_attachments")
      .select("card_id")
      .in("card_id", cardIds);
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.card_id] = (counts[row.card_id] || 0) + 1;
      }
      setAttachmentCounts(counts);
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

    // Trigger automations if card moved to different column
    if (source.droppableId !== destination.droppableId) {
      fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: "card_moved_to_column",
          board_id: board.id,
          card_id: draggableId,
          data: { column_id: destination.droppableId },
        }),
      }).catch(() => {});
    }
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

  const fieldToggleItems: { key: keyof VisibleFields; label: string; disabled?: boolean }[] = [
    { key: "labels", label: "Labels" },
    { key: "assignees", label: "Responsavel" },
    { key: "dates", label: "Datas" },
    { key: "priority", label: "Prioridade" },
    { key: "subtasks", label: "Subtarefas" },
    { key: "description", label: "Descricao" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/boards"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Voltar aos boards"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="font-bold text-foreground text-lg">{board.name}</h2>
          {/* View tabs */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setActiveView("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
                activeView === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
            </button>
            <button
              onClick={() => setActiveView("documents")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
                activeView === "documents"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Documentos
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeView === "kanban" && <>
          {/* Filters button (kanban only) */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 text-sm transition-colors px-2 py-1 rounded-md ${
              hasActiveFilters
                ? "text-primary bg-primary/10"
                : showFilters
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>

          {/* Field visibility button */}
          <div className="relative" ref={fieldsPopoverRef}>
            <button
              onClick={() => setShowFieldsPopover((v) => !v)}
              className={`flex items-center gap-1.5 text-sm transition-colors px-2 py-1 rounded-md ${
                showFieldsPopover
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Campos
            </button>

            {showFieldsPopover && (
              <div className="absolute right-0 top-9 z-50 w-56 bg-popover border border-border rounded-lg shadow-lg py-2">
                <div className="px-3 pb-2 mb-1 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campos visiveis</span>
                </div>

                {/* Task name - always on */}
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-sm text-muted-foreground">Nome da tarefa</span>
                  <button
                    disabled
                    className="relative inline-flex h-5 w-9 items-center rounded-full bg-primary cursor-not-allowed opacity-60"
                  >
                    <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform translate-x-[18px]" />
                  </button>
                </div>

                {/* Toggleable fields */}
                {fieldToggleItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-sm text-popover-foreground">{item.label}</span>
                    <button
                      onClick={() => toggleField(item.key)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        visibleFields[item.key] ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          visibleFields[item.key] ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowLabelManager(true)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <Tags className="w-4 h-4" />
            Labels
          </button>
          </>}
          <button
            onClick={() => setShowSettings(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && activeView === "kanban" && (
        <div className="px-6 py-2 border-b border-border bg-accent/20 flex items-center gap-3 flex-wrap shrink-0">
          {/* Filter by assignee */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Responsável:</span>
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[140px]"
            >
              <option value="">Todos</option>
              <option value="__me__">Minhas tarefas</option>
              {orgMembers.map((m: any) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || m.profiles?.email}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by priority */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Prioridade:</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[110px]"
            >
              <option value="">Todas</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
              <option value="none">Sem prioridade</option>
            </select>
          </div>

          {/* Filter by due date */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Vencimento:</span>
            <select
              value={filterDue}
              onChange={(e) => setFilterDue(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[120px]"
            >
              <option value="">Todos</option>
              <option value="overdue">Atrasadas</option>
              <option value="today">Hoje</option>
              <option value="this_week">Esta semana</option>
            </select>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded-md transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {activeView === "documents" ? (
        <DocumentsTab boardId={board.id} currentUserId={currentUserId} />
      ) : (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-6 overflow-x-auto flex-1 min-h-0">
          {boardColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={filterCards(cards[column.id] || []).map((c) => ({
                ...c,
                labels: cardLabelsMap[c.id] || [],
                subtaskCount: subtaskCounts[c.id]?.total,
                subtaskCompleted: subtaskCounts[c.id]?.completed,
                attachmentCount: attachmentCounts[c.id] || 0,
              }))}
              currentUserId={currentUserId}
              boardId={board.id}
              visibleFields={visibleFields}
              boardMembers={orgMembers}
              boardLabels={boardLabels}
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
      )}

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
          onClose={() => { setSelectedCard(null); loadSubtaskCounts(); loadAttachmentCounts(); }}
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
