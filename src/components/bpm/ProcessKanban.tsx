"use client";

import { useState } from "react";
import {
  Plus, Clock, User, AlertTriangle, CheckCircle2, Loader2, Filter, X, ChevronDown,
  Calendar, Mail, Phone, AtSign, FileText,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type { Phase } from "./PhaseEditor";

export interface BpmCard {
  id: string;
  pipe_id: string;
  org_id: string;
  current_phase_id: string | null;
  title: string;
  created_by: string | null;
  assignee_id: string | null;
  sla_deadline: string | null;
  priority: string;
  started_at: string;
  completed_at: string | null;
  is_archived: boolean;
  created_at: string;
  approval_status?: string | null;
  approval_requested_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface BpmField {
  id: string;
  phase_id: string;
  field_key: string;
  field_type: string;
  label: string;
  is_required: boolean;
  options: any;
  position: number;
}

interface Props {
  phases: Phase[];
  cards: BpmCard[];
  members: OrgMember[];
  fields?: BpmField[];
  cardValues?: Record<string, Record<string, any>>;
  cardProgress?: Record<string, number>; // BPM card ID → % from linked board tasks
  previewFieldIds?: string[];
  onMoveCard: (cardId: string, fromPhaseId: string, toPhaseId: string) => Promise<boolean>;
  onCardClick: (card: BpmCard) => void;
  onCreateCard: () => void;
  canEdit: boolean;
}

function getSlaStatus(deadline: string | null): "ok" | "warning" | "expired" | "none" {
  if (!deadline) return "none";
  const now = new Date();
  const dl = new Date(deadline);
  if (dl < now) return "expired";
  const hoursLeft = (dl.getTime() - now.getTime()) / (1000 * 60 * 60);
  const totalHours = (dl.getTime() - now.getTime() + 1) / (1000 * 60 * 60);
  if (hoursLeft < totalHours * 0.25 || hoursLeft < 4) return "warning";
  return "ok";
}

function formatSla(deadline: string | null): string {
  if (!deadline) return "";
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  if (diff < 0) {
    const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
    return hours < 24 ? `${hours}h atrasado` : `${Math.floor(hours / 24)}d atrasado`;
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return hours < 24 ? `${hours}h restantes` : `${Math.floor(hours / 24)}d restantes`;
}

const SLA_COLORS = {
  ok: "text-green-500 bg-green-500/10",
  warning: "text-yellow-500 bg-yellow-500/10",
  expired: "text-red-500 bg-red-500/10",
  none: "",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  none: "bg-gray-400",
};

const FIELD_ICONS: Record<string, any> = {
  email: Mail,
  phone: Phone,
  date: Calendar,
  text: FileText,
  textarea: FileText,
  select: ChevronDown,
};

function formatFieldValue(value: any, fieldType: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (fieldType === "date") {
    const d = new Date(value);
    return d.toLocaleDateString("pt-BR");
  }
  if (fieldType === "currency") {
    const num = typeof value === "number" ? value : parseFloat(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (fieldType === "checkbox") return value ? "Sim" : "Não";
  if (fieldType === "checklist" && Array.isArray(value)) {
    const checked = value.filter((i: any) => i.checked).length;
    return `${checked}/${value.length} concluídos`;
  }
  if (Array.isArray(value)) return value.map((v: any) => typeof v === "object" ? v.label || JSON.stringify(v) : v).join(", ");
  return String(value);
}

export function ProcessKanban({ phases, cards, members, fields = [], cardValues = {}, cardProgress = {}, previewFieldIds = [], onMoveCard, onCardClick, onCreateCard, canEdit }: Props) {
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSla, setFilterSla] = useState<string>("all");
  // Per-column date filters: phaseId -> "all" | "today" | "week" | "month" | "overdue"
  const [columnDateFilters, setColumnDateFilters] = useState<Record<string, string>>({});

  const hasActiveFilters = filterAssignee !== "all" || filterPriority !== "all" || filterSla !== "all";

  function clearFilters() {
    setFilterAssignee("all");
    setFilterPriority("all");
    setFilterSla("all");
    setColumnDateFilters({});
  }

  function getMember(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId) || null;
  }

  // Get fields that should show on card preview
  function getPreviewFields(cardId: string): { label: string; value: string; type: string; icon: any }[] {
    const values = cardValues[cardId];
    if (!values || fields.length === 0) return [];

    // If previewFieldIds configured, use those; otherwise show first 3 filled fields
    let fieldsToShow: BpmField[];
    if (previewFieldIds.length > 0) {
      fieldsToShow = previewFieldIds
        .map((fid) => fields.find((f) => f.id === fid))
        .filter(Boolean) as BpmField[];
    } else {
      fieldsToShow = fields
        .filter((f) => values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== "")
        .slice(0, 3);
    }

    return fieldsToShow
      .map((f) => {
        const val = values[f.id];
        const formatted = formatFieldValue(val, f.field_type);
        if (!formatted) return null;
        return {
          label: f.label,
          value: formatted,
          type: f.field_type,
          icon: FIELD_ICONS[f.field_type] || FileText,
        };
      })
      .filter(Boolean) as any[];
  }

  function matchesDateFilter(card: BpmCard, filterValue: string): boolean {
    if (filterValue === "all") return true;
    const deadline = card.sla_deadline;
    if (!deadline) return filterValue === "no-date";

    const now = new Date();
    const dl = new Date(deadline);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today.getTime() + 86400000);
    const weekEnd = new Date(today.getTime() + 7 * 86400000);
    const monthEnd = new Date(today.getTime() + 30 * 86400000);

    switch (filterValue) {
      case "overdue": return dl < now;
      case "today": return dl >= today && dl < todayEnd;
      case "week": return dl >= today && dl < weekEnd;
      case "month": return dl >= today && dl < monthEnd;
      case "no-date": return false;
      default: return true;
    }
  }

  function getPhaseCards(phaseId: string) {
    const dateFilter = columnDateFilters[phaseId] || "all";
    return cards
      .filter((c) => c.current_phase_id === phaseId && !c.is_archived)
      .filter((c) => {
        // Assignee filter
        if (filterAssignee !== "all") {
          if (filterAssignee === "unassigned") {
            if (c.assignee_id) return false;
          } else if (c.assignee_id !== filterAssignee) return false;
        }
        // Priority filter
        if (filterPriority !== "all" && c.priority !== filterPriority) return false;
        // SLA filter
        if (filterSla !== "all") {
          const status = getSlaStatus(c.sla_deadline);
          if (filterSla === "expired" && status !== "expired") return false;
          if (filterSla === "warning" && status !== "warning") return false;
          if (filterSla === "ok" && status !== "ok") return false;
          if (filterSla === "none" && status !== "none") return false;
        }
        // Per-column date filter
        if (!matchesDateFilter(c, dateFilter)) return false;
        return true;
      });
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination || !canEdit) return;
    const fromPhaseId = result.source.droppableId;
    const toPhaseId = result.destination.droppableId;
    if (fromPhaseId === toPhaseId) return;

    const cardId = result.draggableId;
    setMovingCardId(cardId);
    await onMoveCard(cardId, fromPhaseId, toPhaseId);
    setMovingCardId(null);
  }

  const hasColumnDateFilters = Object.values(columnDateFilters).some((v) => v !== "all");

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
            hasActiveFilters
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {hasActiveFilters && (
            <span className="bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {[filterAssignee !== "all", filterPriority !== "all", filterSla !== "all"].filter(Boolean).length}
            </span>
          )}
        </button>

        {(hasActiveFilters || hasColumnDateFilters) && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}

        {showFilters && (
          <>
            {/* Responsável */}
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Responsável: Todos</option>
              <option value="unassigned">Sem responsável</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>

            {/* Prioridade */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Prioridade: Todas</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
              <option value="none">Sem prioridade</option>
            </select>

            {/* SLA */}
            <select
              value={filterSla}
              onChange={(e) => setFilterSla(e.target.value)}
              className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">SLA: Todos</option>
              <option value="expired">Atrasado</option>
              <option value="warning">Vence em breve</option>
              <option value="ok">No prazo</option>
              <option value="none">Sem SLA</option>
            </select>
          </>
        )}
      </div>

    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
        {phases.map((phase) => {
          const phaseCards = getPhaseCards(phase.id);
          const dateFilter = columnDateFilters[phase.id] || "all";
          return (
            <div key={phase.id} className="flex-shrink-0 w-72 flex flex-col max-h-full">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                <h3 className="text-sm font-semibold text-foreground truncate flex-1">{phase.name}</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {phaseCards.length}
                </span>
              </div>

              {/* Per-column date filter */}
              <div className="mb-2 px-1">
                <select
                  value={dateFilter}
                  onChange={(e) => setColumnDateFilters((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                  className={cn(
                    "w-full px-2 py-1 text-[11px] rounded-md border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30",
                    dateFilter !== "all"
                      ? "bg-primary/5 border-primary/30 text-primary font-medium"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:border-border"
                  )}
                >
                  <option value="all">Vencimento: Todos</option>
                  <option value="overdue">Atrasados</option>
                  <option value="today">Vence hoje</option>
                  <option value="week">Próximos 7 dias</option>
                  <option value="month">Próximos 30 dias</option>
                  <option value="no-date">Sem data</option>
                </select>
              </div>

              {/* Droppable column */}
              <Droppable droppableId={phase.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "bg-muted/30 rounded-xl p-2 min-h-[120px] space-y-2 transition-colors flex-1 overflow-y-auto scrollbar-thin",
                      snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20"
                    )}
                  >
                    {phaseCards.map((card, index) => {
                      const assignee = getMember(card.assignee_id);
                      const slaStatus = getSlaStatus(card.sla_deadline);
                      const slaText = formatSla(card.sla_deadline);
                      const previewFields = getPreviewFields(card.id);

                      return (
                        <Draggable
                          key={card.id}
                          draggableId={card.id}
                          index={index}
                          isDragDisabled={!canEdit || movingCardId === card.id}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => onCardClick(card)}
                              className={cn(
                                "bg-card border border-border rounded-lg p-3 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md",
                                snapshot.isDragging && "shadow-xl ring-2 ring-primary/30",
                                movingCardId === card.id && "opacity-50"
                              )}
                            >
                              {/* Priority bar */}
                              <div className={cn("w-full h-1 rounded-full mb-2", PRIORITY_COLORS[card.priority])} />

                              {/* Approval badge */}
                              {card.approval_status === "pending" && (
                                <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit mb-1.5 bg-amber-500/10 text-amber-600">
                                  <Clock className="w-3 h-3" />
                                  Aguardando aprovação
                                </div>
                              )}

                              {/* Title */}
                              <p className="text-sm font-medium text-foreground mb-2 line-clamp-2">{card.title}</p>

                              {/* Card progress bar (from linked board tasks) */}
                              {cardProgress[card.id] !== undefined && (
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all duration-300",
                                        cardProgress[card.id] === 100 ? "bg-green-500"
                                          : cardProgress[card.id] >= 50 ? "bg-primary" : "bg-orange-400"
                                      )}
                                      style={{ width: `${cardProgress[card.id]}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-semibold tabular-nums min-w-[28px] text-right",
                                    cardProgress[card.id] === 100 ? "text-green-600" : "text-muted-foreground"
                                  )}>
                                    {cardProgress[card.id]}%
                                  </span>
                                </div>
                              )}

                              {/* Dynamic field preview (Pipefy-style) */}
                              {previewFields.length > 0 && (
                                <div className="space-y-1 mb-2">
                                  {previewFields.map((pf, i) => {
                                    const Icon = pf.icon;
                                    return (
                                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                        <Icon className="w-3 h-3 shrink-0 mt-0.5" />
                                        <span className="truncate">
                                          <span className="font-medium text-foreground/70">{pf.label}:</span>{" "}
                                          {pf.value}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* SLA */}
                              {slaStatus !== "none" && (
                                <div className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit mb-2", SLA_COLORS[slaStatus])}>
                                  {slaStatus === "expired" ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {slaText}
                                </div>
                              )}

                              {/* Footer: assignee */}
                              {assignee && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  {assignee.avatar_url ? (
                                    <img src={assignee.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                                  ) : (
                                    <div
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                                      style={{ backgroundColor: generateColor(assignee.full_name || assignee.email) }}
                                    >
                                      {getInitials(assignee.full_name || assignee.email)}
                                    </div>
                                  )}
                                  <span className="text-xs text-muted-foreground truncate">
                                    {(assignee.full_name || assignee.email).split(" ")[0]}
                                  </span>
                                </div>
                              )}

                              {movingCardId === card.id && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Movendo...
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {/* Add card button on start phase */}
              {phase.is_start && canEdit && (
                <button
                  onClick={onCreateCard}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo card
                </button>
              )}
            </div>
          );
        })}
      </div>
    </DragDropContext>
    </div>
  );
}
