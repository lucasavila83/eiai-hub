"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { createPortal } from "react-dom";
import {
  X, Calendar, Flag, Clock, CheckCircle2, Circle,
  Sun, AlertTriangle, ChevronRight,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils/helpers";
import { useRouter } from "next/navigation";

interface AgendaCard {
  id: string;
  title: string;
  due_date: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  completed_at: string | null;
  column_name: string;
  board_name: string;
  board_id: string;
}

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const priorityConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  urgent: { label: "Urgente", color: "text-red-600", bg: "bg-red-50 dark:bg-red-500/10", icon: "🔴" },
  high: { label: "Alta", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-500/10", icon: "🟠" },
  medium: { label: "Média", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-500/10", icon: "🟡" },
  low: { label: "Baixa", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-500/10", icon: "🔵" },
  none: { label: "Normal", color: "text-muted-foreground", bg: "bg-muted", icon: "⚪" },
};

function getStorageKey(userId: string) {
  return `eiai_daily_agenda_${userId}`;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours === 0 && mins === 0) return ""; // No time set
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function DailyAgenda() {
  const { user, supabase: authSupabase } = useAuth();
  const [show, setShow] = useState(false);
  const [cards, setCards] = useState<AgendaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!user?.id) return;

    const key = getStorageKey(user.id);
    const lastShown = localStorage.getItem(key);
    const today = getTodayStr();

    // Only show once per day
    if (lastShown === today) return;

    // Check if it's after 7:00 AM
    const now = new Date();
    if (now.getHours() < 7) return;

    // Mark as shown for today
    localStorage.setItem(key, today);

    // Load user name
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) {
          setUserName(data.full_name.split(" ")[0]);
        }
      });

    // Load today's cards assigned to user
    loadAgenda(user.id);
  }, [user?.id]);

  async function loadAgenda(userId: string) {
    setLoading(true);
    const supabase = createClient();
    const today = getTodayStr();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Get cards assigned to user with due_date today or overdue
    const { data: assignedCardIds } = await supabase
      .from("card_assignees")
      .select("card_id")
      .eq("user_id", userId);

    if (!assignedCardIds || assignedCardIds.length === 0) {
      setCards([]);
      setLoading(false);
      setShow(true);
      return;
    }

    const cardIds = assignedCardIds.map((a) => a.card_id);

    const { data: cardsData } = await supabase
      .from("cards")
      .select("id, title, due_date, priority, completed_at, is_archived, column_id, board_id")
      .in("id", cardIds)
      .eq("is_archived", false)
      .or(`due_date.lte.${tomorrowStr},due_date.is.null`)
      .order("due_date", { ascending: true });

    if (!cardsData || cardsData.length === 0) {
      setCards([]);
      setLoading(false);
      setShow(true);
      return;
    }

    // Filter: only today, overdue, or no date (pending)
    const relevant = cardsData.filter((c) => {
      if (c.completed_at) return false; // Skip completed
      if (!c.due_date) return true; // No date = pending
      const dueDate = c.due_date.slice(0, 10);
      return dueDate <= today; // Today or overdue
    });

    // Get column and board names
    const columnIds = [...new Set(relevant.map((c) => c.column_id))];
    const boardIds = [...new Set(relevant.map((c) => c.board_id))];

    const [colsRes, boardsRes] = await Promise.all([
      supabase.from("columns").select("id, name").in("id", columnIds),
      supabase.from("boards").select("id, name").in("id", boardIds),
    ]);

    const colMap: Record<string, string> = {};
    const boardMap: Record<string, string> = {};
    colsRes.data?.forEach((c) => { colMap[c.id] = c.name; });
    boardsRes.data?.forEach((b) => { boardMap[b.id] = b.name; });

    const agendaCards: AgendaCard[] = relevant.map((c) => ({
      id: c.id,
      title: c.title,
      due_date: c.due_date || "",
      priority: c.priority as any,
      completed_at: c.completed_at,
      column_name: colMap[c.column_id] || "",
      board_name: boardMap[c.board_id] || "",
      board_id: c.board_id,
    }));

    // Sort: overdue first, then by priority, then by time
    agendaCards.sort((a, b) => {
      // Overdue first
      const aOverdue = a.due_date && a.due_date.slice(0, 10) < today ? 0 : 1;
      const bOverdue = b.due_date && b.due_date.slice(0, 10) < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      // Then by priority
      const aPri = priorityOrder[a.priority] ?? 4;
      const bPri = priorityOrder[b.priority] ?? 4;
      if (aPri !== bPri) return aPri - bPri;
      // Then by time
      return (a.due_date || "").localeCompare(b.due_date || "");
    });

    setCards(agendaCards);
    setLoading(false);
    setShow(true);
  }

  function handleCardClick(card: AgendaCard) {
    setShow(false);
    router.push(`/boards/${card.board_id}`);
  }

  if (!show) return null;

  const today = getTodayStr();
  const overdueCards = cards.filter((c) => c.due_date && c.due_date.slice(0, 10) < today);
  const todayCards = cards.filter((c) => c.due_date && c.due_date.slice(0, 10) === today);
  const noDueCards = cards.filter((c) => !c.due_date);

  // Use a dedicated portal root so browser extensions / translation
  // tools that mutate document.body can't break React's reconciliation.
  const portalTarget =
    (typeof document !== "undefined" && document.getElementById("portal-root")) ||
    (typeof document !== "undefined" ? document.body : null);
  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShow(false)} />

      <div className="relative bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Sun className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {getGreeting()}{userName ? `, ${userName}` : ""}! 👋
                </h2>
                <p className="text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShow(false)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Dia livre! 🎉</h3>
              <p className="text-sm text-muted-foreground">
                Nenhuma tarefa pendente ou com prazo para hoje.
              </p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-primary/10 text-primary font-medium px-2 py-1 rounded-full">
                  {cards.length} tarefa{cards.length > 1 ? "s" : ""}
                </span>
                {overdueCards.length > 0 && (
                  <span className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-medium px-2 py-1 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {overdueCards.length} atrasada{overdueCards.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Overdue section */}
              {overdueCards.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Atrasadas
                  </h4>
                  <div className="space-y-2">
                    {overdueCards.map((card) => (
                      <AgendaItem key={card.id} card={card} isOverdue onClick={() => handleCardClick(card)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Today section */}
              {todayCards.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Hoje
                  </h4>
                  <div className="space-y-2">
                    {todayCards.map((card) => (
                      <AgendaItem key={card.id} card={card} onClick={() => handleCardClick(card)} />
                    ))}
                  </div>
                </div>
              )}

              {/* No due date section */}
              {noDueCards.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Circle className="w-3.5 h-3.5" />
                    Sem prazo definido
                  </h4>
                  <div className="space-y-2">
                    {noDueCards.map((card) => (
                      <AgendaItem key={card.id} card={card} onClick={() => handleCardClick(card)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border shrink-0">
          <button
            onClick={() => setShow(false)}
            className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {cards.length === 0 ? "Começar o dia" : "Entendido, vamos trabalhar!"}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

function AgendaItem({ card, isOverdue, onClick }: { card: AgendaCard; isOverdue?: boolean; onClick: () => void }) {
  const config = priorityConfig[card.priority] || priorityConfig.none;
  const time = formatTime(card.due_date);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-sm group",
        isOverdue
          ? "border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 hover:border-red-300"
          : "border-border hover:border-primary/30 bg-card"
      )}
    >
      {/* Time or priority icon */}
      <div className="shrink-0 w-14 text-center">
        {time ? (
          <div className="flex flex-col items-center">
            <Clock className={cn("w-3.5 h-3.5 mb-0.5", isOverdue ? "text-red-500" : "text-muted-foreground")} />
            <span className={cn("text-xs font-bold tabular-nums", isOverdue ? "text-red-600" : "text-foreground")}>
              {time}
            </span>
          </div>
        ) : (
          <span className="text-lg">{config.icon}</span>
        )}
      </div>

      {/* Card info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground truncate">{card.board_name}</span>
          {card.column_name && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground truncate">{card.column_name}</span>
            </>
          )}
        </div>
      </div>

      {/* Priority badge */}
      <div className={cn("shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded", config.bg, config.color)}>
        {config.label}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}
