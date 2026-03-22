"use client";

import { useState } from "react";
import {
  Plus, Clock, User, AlertTriangle, CheckCircle2, Loader2,
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
}

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface Props {
  phases: Phase[];
  cards: BpmCard[];
  members: OrgMember[];
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

export function ProcessKanban({ phases, cards, members, onMoveCard, onCardClick, onCreateCard, canEdit }: Props) {
  const [movingCardId, setMovingCardId] = useState<string | null>(null);

  function getMember(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId) || null;
  }

  function getPhaseCards(phaseId: string) {
    return cards.filter((c) => c.current_phase_id === phaseId && !c.is_archived);
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-200px)]">
        {phases.map((phase) => {
          const phaseCards = getPhaseCards(phase.id);
          return (
            <div key={phase.id} className="flex-shrink-0 w-72">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                <h3 className="text-sm font-semibold text-foreground truncate flex-1">{phase.name}</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {phaseCards.length}
                </span>
              </div>

              {/* Droppable column */}
              <Droppable droppableId={phase.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "bg-muted/30 rounded-xl p-2 min-h-[120px] space-y-2 transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20"
                    )}
                  >
                    {phaseCards.map((card, index) => {
                      const assignee = getMember(card.assignee_id);
                      const slaStatus = getSlaStatus(card.sla_deadline);
                      const slaText = formatSla(card.sla_deadline);

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

                              {/* Title */}
                              <p className="text-sm font-medium text-foreground mb-2 line-clamp-2">{card.title}</p>

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
  );
}
