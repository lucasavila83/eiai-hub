import { cn, formatDate, getInitials, generateColor } from "@/lib/utils/helpers";
import { Calendar, AlertCircle, ArrowUp, Minus, ListChecks } from "lucide-react";
import type { Card } from "@/lib/types/database";

interface Props {
  card: Card & { card_assignees: any[] };
  labels?: { id: string; name: string; color: string }[];
  subtaskCount?: number;
  subtaskCompleted?: number;
  isDragging?: boolean;
}

const priorityConfig = {
  urgent: { color: "text-red-500", bg: "bg-red-500/10", icon: AlertCircle, label: "Urgente" },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", icon: ArrowUp, label: "Alta" },
  medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Minus, label: "Média" },
  low: { color: "text-primary", bg: "bg-primary/50/10", icon: Minus, label: "Baixa" },
  none: { color: "text-muted-foreground", bg: "bg-muted", icon: Minus, label: "Sem prioridade" },
};

export function KanbanCard({ card, labels, subtaskCount, subtaskCompleted, isDragging }: Props) {
  const priority = priorityConfig[card.priority];
  const PriorityIcon = priority.icon;
  const isOverdue = card.due_date && new Date(card.due_date) < new Date() && !card.completed_at;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-all",
        isDragging && "shadow-lg rotate-1 scale-105",
        card.cover_color && "border-t-4"
      )}
      style={card.cover_color ? { borderTopColor: card.cover_color } : undefined}
    >
      {labels && labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="rounded-full text-[10px] px-1.5 py-0.5 font-medium text-white leading-tight"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="rounded-full text-[10px] px-1.5 py-0.5 font-medium text-muted-foreground bg-muted leading-tight">
              +{labels.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-foreground leading-tight">{card.title}</p>
        <div className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs shrink-0", priority.bg, priority.color)}>
          <PriorityIcon className="w-3 h-3" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {card.due_date && (
            <div className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-destructive" : "text-muted-foreground")}>
              <Calendar className="w-3 h-3" />
              {formatDate(card.due_date)}
            </div>
          )}
          {subtaskCount != null && subtaskCount > 0 && (
            <div className={cn(
              "flex items-center gap-1 text-xs",
              subtaskCompleted === subtaskCount ? "text-green-500" : "text-muted-foreground"
            )}>
              <ListChecks className="w-3 h-3" />
              {subtaskCompleted}/{subtaskCount}
            </div>
          )}
        </div>

        {card.card_assignees?.length > 0 && (
          <div className="flex -space-x-1.5">
            {card.card_assignees.slice(0, 3).map((a: any) => {
              const name = a.profiles?.full_name || a.profiles?.email || "?";
              return (
                <div
                  key={a.user_id}
                  title={name}
                  className="w-5 h-5 rounded-full border border-card flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: generateColor(name) }}
                >
                  {getInitials(name)}
                </div>
              );
            })}
            {card.card_assignees.length > 3 && (
              <div className="w-5 h-5 rounded-full border border-card bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                +{card.card_assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
