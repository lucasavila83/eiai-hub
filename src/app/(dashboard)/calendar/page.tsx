"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Clock,
  MapPin,
  Trash2,
  Pencil,
  CalendarDays,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

const EVENT_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#14b8a6",
];

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CalEvent {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  location: string | null;
  created_by: string | null;
  card_id: string | null;
  created_at: string;
}

interface CardDue {
  id: string;
  title: string;
  due_date: string;
  board_id: string;
  priority: string;
}

export default function CalendarPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [cardDues, setCardDues] = useState<CardDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<CalEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formColor, setFormColor] = useState(EVENT_COLORS[0]);
  const [formLocation, setFormLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);

    try {
      // Get month range
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

      // Events
      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .eq("org_id", activeOrgId)
        .gte("start_at", startOfMonth.toISOString())
        .lte("start_at", endOfMonth.toISOString())
        .order("start_at");

      setEvents(eventsData || []);

      // Cards with due dates in this month
      const { data: cardsData } = await supabase
        .from("cards")
        .select("id, title, due_date, board_id, priority")
        .eq("is_archived", false)
        .not("due_date", "is", null)
        .gte("due_date", startOfMonth.toISOString().split("T")[0])
        .lte("due_date", endOfMonth.toISOString().split("T")[0]);

      setCardDues(cardsData || []);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, currentMonth, currentYear, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function goToday() {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  }

  // Calendar grid
  function getCalendarDays() {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (number | null)[] = [];
    // Fill blanks before first day
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    // Fill actual days
    for (let d = 1; d <= totalDays; d++) days.push(d);
    // Fill remaining to complete rows
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }

  function getEventsForDay(day: number) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.start_at.startsWith(dateStr));
  }

  function getCardDuesForDay(day: number) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return cardDues.filter((c) => c.due_date === dateStr);
  }

  function isToday(day: number) {
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  }

  function openCreateForDate(day: number) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setFormTitle("");
    setFormDesc("");
    setFormDate(dateStr);
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormAllDay(false);
    setFormColor(EVENT_COLORS[0]);
    setFormLocation("");
    setEditingEvent(null);
    setShowCreate(true);
    setError(null);
  }

  function openEditEvent(event: CalEvent) {
    const startDate = new Date(event.start_at);
    setFormTitle(event.title);
    setFormDesc(event.description || "");
    setFormDate(startDate.toISOString().split("T")[0]);
    setFormStartTime(
      `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`
    );
    if (event.end_at) {
      const endDate = new Date(event.end_at);
      setFormEndTime(
        `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`
      );
    } else {
      setFormEndTime("10:00");
    }
    setFormAllDay(event.all_day);
    setFormColor(event.color);
    setFormLocation(event.location || "");
    setEditingEvent(event);
    setShowDetail(null);
    setShowCreate(true);
    setError(null);
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formDate || !activeOrgId || !currentUserId) return;

    setSaving(true);
    setError(null);

    try {
      const startAt = formAllDay
        ? new Date(`${formDate}T00:00:00`).toISOString()
        : new Date(`${formDate}T${formStartTime}:00`).toISOString();

      const endAt = formAllDay
        ? new Date(`${formDate}T23:59:59`).toISOString()
        : new Date(`${formDate}T${formEndTime}:00`).toISOString();

      if (editingEvent) {
        // Update
        const { error: updateErr } = await supabase
          .from("events")
          .update({
            title: formTitle.trim(),
            description: formDesc.trim() || null,
            start_at: startAt,
            end_at: endAt,
            all_day: formAllDay,
            color: formColor,
            location: formLocation.trim() || null,
          })
          .eq("id", editingEvent.id);

        if (updateErr) throw updateErr;
      } else {
        // Insert
        const { error: insertErr } = await supabase
          .from("events")
          .insert({
            org_id: activeOrgId,
            title: formTitle.trim(),
            description: formDesc.trim() || null,
            start_at: startAt,
            end_at: endAt,
            all_day: formAllDay,
            color: formColor,
            location: formLocation.trim() || null,
            created_by: currentUserId,
            card_id: null,
          });

        if (insertErr) throw insertErr;
      }

      setShowCreate(false);
      setEditingEvent(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar evento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm("Tem certeza que deseja deletar este evento?")) return;

    try {
      await supabase.from("events").delete().eq("id", eventId);
      setShowDetail(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao deletar.");
    }
  }

  const calendarDays = getCalendarDays();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-4 shrink-0">
        <CalendarDays className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Calendário</h1>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {MONTHS_PT[currentMonth]} {currentYear}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-3 py-1 text-xs font-medium rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            Hoje
          </button>
        </div>

        <div className="ml-auto">
          <button
            onClick={() => openCreateForDate(today.getDate())}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-7 border border-border rounded-xl overflow-hidden bg-card">
            {/* Day headers */}
            {DAYS_PT.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center bg-muted/50 border-b border-border"
              >
                {d}
              </div>
            ))}

            {/* Day cells */}
            {calendarDays.map((day, i) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const dayCards = day ? getCardDuesForDay(day) : [];
              const totalItems = dayEvents.length + dayCards.length;
              const _isToday = day ? isToday(day) : false;

              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[100px] border-b border-r border-border p-1 transition-colors",
                    day ? "cursor-pointer hover:bg-accent/30" : "bg-muted/20",
                    i % 7 === 6 && "border-r-0"
                  )}
                  onClick={() => day && openCreateForDate(day)}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={cn(
                            "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                            _isToday
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground"
                          )}
                        >
                          {day}
                        </span>
                        {totalItems > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {totalItems}
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        {/* Events */}
                        {dayEvents.slice(0, 3).map((evt) => (
                          <button
                            key={evt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDetail(evt);
                            }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: `${evt.color}20`,
                              color: evt.color,
                              borderLeft: `2px solid ${evt.color}`,
                            }}
                          >
                            {!evt.all_day && (
                              <span className="opacity-70">
                                {new Date(evt.start_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}{" "}
                              </span>
                            )}
                            {evt.title}
                          </button>
                        ))}

                        {/* Card due dates */}
                        {dayCards.slice(0, 3 - Math.min(dayEvents.length, 3)).map((card) => (
                          <div
                            key={card.id}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate bg-orange-500/10 text-orange-600 border-l-2 border-orange-500"
                          >
                            📋 {card.title}
                          </div>
                        ))}

                        {totalItems > 3 && (
                          <p className="text-[10px] text-muted-foreground pl-1">
                            +{totalItems - 3} mais
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            Eventos
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
            Prazos de tarefas
          </div>
        </div>
      </div>

      {/* Create/Edit Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">
                {editingEvent ? "Editar Evento" : "Novo Evento"}
              </h3>
              <button
                onClick={() => { setShowCreate(false); setEditingEvent(null); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Nome do evento"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Data *
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDay"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="allDay" className="text-sm text-foreground">
                  Dia inteiro
                </label>
              </div>

              {!formAllDay && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Início
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Fim
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Local
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Sala de reunião, link do Meet..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Descrição
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Detalhes do evento"
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Cor
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={cn(
                        "w-6 h-6 rounded-full transition-all",
                        formColor === c
                          ? "ring-2 ring-offset-2 ring-offset-card ring-primary scale-110"
                          : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setEditingEvent(null); }}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !formTitle.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingEvent ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: showDetail.color }}
              />
              <h3 className="font-semibold text-foreground flex-1 truncate">
                {showDetail.title}
              </h3>
              <button
                onClick={() => openEditEvent(showDetail)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteEvent(showDetail.id)}
                className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowDetail(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                {showDetail.all_day ? (
                  <span>
                    {new Date(showDetail.start_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    — Dia inteiro
                  </span>
                ) : (
                  <span>
                    {new Date(showDetail.start_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                    })}{" "}
                    {new Date(showDetail.start_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {showDetail.end_at && (
                      <>
                        {" — "}
                        {new Date(showDetail.end_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </>
                    )}
                  </span>
                )}
              </div>

              {showDetail.location && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  {showDetail.location}
                </div>
              )}

              {showDetail.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {showDetail.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
