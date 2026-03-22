"use client";

import { Clock, AlertTriangle, CheckCircle2, Timer } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface Props {
  deadline: string | null;
  completedAt?: string | null;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function getSlaStatus(deadline: string | null, completedAt?: string | null): "ok" | "warning" | "expired" | "completed" | "none" {
  if (completedAt) return "completed";
  if (!deadline) return "none";
  const now = new Date();
  const dl = new Date(deadline);
  if (dl < now) return "expired";
  const msLeft = dl.getTime() - now.getTime();
  const hoursLeft = msLeft / (1000 * 60 * 60);
  if (hoursLeft < 4) return "warning";
  return "ok";
}

export function formatSlaRemaining(deadline: string | null): string {
  if (!deadline) return "";
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();

  if (diff < 0) {
    const mins = Math.abs(Math.floor(diff / (1000 * 60)));
    if (mins < 60) return `${mins}min atrasado`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrasado`;
    return `${Math.floor(hours / 24)}d atrasado`;
  }

  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 60) return `${mins}min restantes`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h restantes`;
  return `${Math.floor(hours / 24)}d restantes`;
}

const STATUS_CONFIG = {
  ok: { icon: Clock, color: "text-green-500", bg: "bg-green-500/10", label: "No prazo" },
  warning: { icon: Timer, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Atenção" },
  expired: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10", label: "Vencido" },
  completed: { icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500/10", label: "Concluído" },
  none: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "" },
};

export function SlaIndicator({ deadline, completedAt, size = "sm", showLabel = true }: Props) {
  const status = getSlaStatus(deadline, completedAt);
  if (status === "none") return null;

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const remaining = status === "completed" ? "Concluído" : formatSlaRemaining(deadline);

  return (
    <div className={cn(
      "inline-flex items-center gap-1 rounded-full font-medium",
      config.bg, config.color,
      size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
    )}>
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {showLabel && <span>{remaining}</span>}
    </div>
  );
}
