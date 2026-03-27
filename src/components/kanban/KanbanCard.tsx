import { cn, formatDate, getInitials, generateColor } from "@/lib/utils/helpers";
import { Calendar, Flag, ListChecks, AlignLeft, Paperclip, Workflow, Clock } from "lucide-react";
import type { Card } from "@/lib/types/database";
import { isBpmTask } from "@/lib/bpm/task-sync";

export interface VisibleFields {
  assignees: boolean;
  dates: boolean;
  priority: boolean;
  labels: boolean;
  subtasks: boolean;
  description: boolean;
}

export const defaultVisibleFields: VisibleFields = {
  assignees: true,
  dates: true,
  priority: true,
  labels: true,
  subtasks: true,
  description: true,
};

interface Props {
  card: Card & { card_assignees: any[] };
  labels?: { id: string; name: string; color: string }[];
  subtaskCount?: number;
  subtaskCompleted?: number;
  attachmentCount?: number;
  isDragging?: boolean;
  visibleFields?: VisibleFields;
}

const priorityConfig = {
  urgent: { color: "text-red-600", bg: "bg-red-50 dark:bg-red-500/10", flagColor: "text-red-500", label: "Urgente" },
  high: { color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-500/10", flagColor: "text-orange-500", label: "Alta" },
  medium: { color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-500/10", flagColor: "text-yellow-500", label: "Media" },
  low: { color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-500/10", flagColor: "text-blue-500", label: "Baixa" },
  none: { color: "text-muted-foreground", bg: "bg-muted", flagColor: "text-muted-foreground", label: "" },
};

export function KanbanCard({
  card,
  labels,
  subtaskCount,
  subtaskCompleted,
  attachmentCount,
  isDragging,
  visibleFields = defaultVisibleFields,
}: Props) {
  const priority = priorityConfig[card.priority];
  const isOverdue = card.due_date && new Date(card.due_date) < new Date() && !card.completed_at;
  const showLabels = visibleFields.labels && labels && labels.length > 0;
  const showPriority = visibleFields.priority && card.priority !== "none";
  const showDueDate = visibleFields.dates && card.due_date;
  const showSubtasks = visibleFields.subtasks && subtaskCount != null && subtaskCount > 0;
  const showDescription = visibleFields.description && card.description;
  const showAttachments = attachmentCount != null && attachmentCount > 0;
  const showAssignees = visibleFields.assignees && card.card_assignees?.length > 0;

  const hasBottomRow = showPriority || showDueDate || showSubtasks || showDescription || showAttachments || showAssignees;
  const isBpm = isBpmTask(card.metadata);
  const bpmPhaseName = (card.metadata as any)?.bpm_phase_name;
  const bpmPipeName = (card.metadata as any)?.bpm_pipe_name;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group overflow-hidden",
        isDragging && "shadow-lg rotate-1 scale-105 border-primary/50",
        card.cover_color && "border-t-[3px]",
        isBpm && "border-l-[3px] border-l-indigo-500"
      )}
      style={card.cover_color ? { borderTopColor: card.cover_color } : undefined}
    >
      {/* BPM process badge */}
      {isBpm && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-indigo-500 bg-indigo-500/10 rounded px-2 py-0.5 w-fit">
          <Workflow className="w-3 h-3" />
          <span className="font-medium">{bpmPipeName}</span>
          {bpmPhaseName && <span className="text-indigo-400">· {bpmPhaseName}</span>}
        </div>
      )}

      {/* Labels row - small colored pills at top */}
      {showLabels && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels!.slice(0, 4).map((label) => (
            <span
              key={label.id}
              className="rounded-full h-1.5 w-8 inline-block"
              style={{ backgroundColor: label.color }}
              title={label.name}
            />
          ))}
          {labels!.length > 4 && (
            <span className="text-[10px] text-muted-foreground leading-none self-center">
              +{labels!.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Title - main prominent element */}
      <p className="text-sm font-medium text-foreground leading-snug mb-1.5">{card.title}</p>

      {/* Bottom row: icons/badges */}
      {hasBottomRow && (
        <div className="mt-1.5 space-y-1.5">
          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Due date */}
            {showDueDate && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5",
                  isOverdue
                    ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-medium"
                    : "text-muted-foreground"
                )}
              >
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="truncate">{formatDate(card.due_date!)}</span>
              </div>
            )}

            {/* Priority flag with label */}
            {showPriority && (
              <div className={cn("flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5", priority.bg, priority.color)} title={priority.label}>
                <Flag className={cn("w-3 h-3 shrink-0", priority.flagColor)} />
                <span className="font-medium">{priority.label}</span>
              </div>
            )}

            {/* Subtask count */}
            {showSubtasks && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[11px]",
                  subtaskCompleted === subtaskCount ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                )}
              >
                <ListChecks className="w-3 h-3 shrink-0" />
                <span>{subtaskCompleted}/{subtaskCount}</span>
              </div>
            )}

            {/* Description indicator */}
            {showDescription && (
              <div className="text-muted-foreground" title="Tem descricao">
                <AlignLeft className="w-3 h-3" />
              </div>
            )}

            {/* Attachment count */}
            {showAttachments && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Paperclip className="w-3 h-3 shrink-0" />
                <span>{attachmentCount}</span>
              </div>
            )}
          </div>

          {/* Assignee avatars - separate row to avoid squishing */}
          {showAssignees && (
            <div className="flex items-center justify-end">
              <div className="flex -space-x-1.5">
                {card.card_assignees.slice(0, 3).map((a: any) => {
                  const name = a.profiles?.full_name || a.profiles?.email || "?";
                  return a.profiles?.avatar_url ? (
                    <img
                      key={a.user_id}
                      src={a.profiles.avatar_url}
                      alt={name}
                      title={name}
                      className="w-6 h-6 rounded-full border-2 border-card object-cover"
                    />
                  ) : (
                    <div
                      key={a.user_id}
                      title={name}
                      className="w-6 h-6 rounded-full border-2 border-card flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: generateColor(name) }}
                    >
                      {getInitials(name)}
                    </div>
                  );
                })}
                {card.card_assignees.length > 3 && (
                  <div className="w-6 h-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                    +{card.card_assignees.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
