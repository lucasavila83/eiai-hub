"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
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
  ArrowLeft,
  Users,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { cn, getInitials, generateColor, formatDateTime } from "@/lib/utils/helpers";
import { usePermissions } from "@/lib/hooks/usePermissions";

const EVENT_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#14b8a6",
];

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_FULL_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

type ViewMode = "month" | "week" | "day";

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

interface OrgMember {
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export default function CalendarPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const { user } = useAuth();
  const router = useRouter();
  const permissions = usePermissions();

  const today = new Date();
  const [currentDate, setCurrentDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [cardDues, setCardDues] = useState<CardDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Filter: show only my events or all
  const [showOnlyMine, setShowOnlyMine] = useState(true);
  const [sharedMembers, setSharedMembers] = useState<Set<string>>(new Set());

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<CalEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);

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
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) setCurrentUserId(u.id);
    });
  }, []);

  // Load org members
  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
        .eq("org_id", activeOrgId);
      if (data) setOrgMembers(data as any);
    })();
  }, [activeOrgId]);

  // Computed date ranges
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  function getWeekStart(date: Date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDays(date: Date) {
    const start = getWeekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  const weekDays = getWeekDays(currentDate);

  const loadData = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);

    try {
      let startRange: Date;
      let endRange: Date;

      if (viewMode === "month") {
        startRange = new Date(currentYear, currentMonth, 1);
        endRange = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      } else if (viewMode === "week") {
        startRange = getWeekStart(currentDate);
        endRange = new Date(startRange);
        endRange.setDate(endRange.getDate() + 6);
        endRange.setHours(23, 59, 59);
      } else {
        startRange = new Date(currentDate);
        startRange.setHours(0, 0, 0, 0);
        endRange = new Date(currentDate);
        endRange.setHours(23, 59, 59);
      }

      const isAdmin = permissions.isAdmin;

      // Build events query
      let evQuery = supabase
        .from("events")
        .select("*")
        .eq("org_id", activeOrgId)
        .gte("start_at", startRange.toISOString())
        .lte("start_at", endRange.toISOString())
        .order("start_at");

      // Non-admins: ALWAYS filter to own events only
      // Admins: can toggle showOnlyMine
      if (!isAdmin && currentUserId) {
        evQuery = evQuery.eq("created_by", currentUserId);
      } else if (isAdmin && showOnlyMine && currentUserId) {
        evQuery = evQuery.eq("created_by", currentUserId);
      }

      const { data: eventsData } = await evQuery;
      let allEvents = eventsData || [];

      // Shared members' events — ONLY for admins
      if (isAdmin && sharedMembers.size > 0) {
        const { data: sharedData } = await supabase
          .from("events")
          .select("*")
          .eq("org_id", activeOrgId)
          .gte("start_at", startRange.toISOString())
          .lte("start_at", endRange.toISOString())
          .in("created_by", Array.from(sharedMembers))
          .order("start_at");
        if (sharedData) {
          const existingIds = new Set(allEvents.map((e) => e.id));
          allEvents = [...allEvents, ...sharedData.filter((e) => !existingIds.has(e.id))];
        }
      }

      setEvents(allEvents);

      // Cards with due dates — non-admins: only cards assigned to them
      const startStr = startRange.toISOString().split("T")[0];
      const endStr = endRange.toISOString().split("T")[0];

      let cardsQuery = supabase
        .from("cards")
        .select("id, title, due_date, board_id, priority")
        .eq("is_archived", false)
        .not("due_date", "is", null)
        .gte("due_date", startStr)
        .lte("due_date", endStr);

      const { data: cardsData } = await cardsQuery;

      // Filter cards: non-admins only see cards assigned to them
      if (!isAdmin && currentUserId) {
        const { data: assignedCardIds } = await supabase
          .from("card_assignees")
          .select("card_id")
          .eq("user_id", currentUserId);
        const myCardIds = new Set((assignedCardIds || []).map((a) => a.card_id));
        setCardDues((cardsData || []).filter((c) => myCardIds.has(c.id)));
      } else {
        setCardDues(cardsData || []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, currentDate, viewMode, currentUserId, showOnlyMine, sharedMembers, supabase, currentMonth, currentYear, permissions.isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigation
  function goToday() {
    setCurrentDate(new Date());
  }

  function goPrev() {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  }

  function goNext() {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  }

  function isToday(date: Date) {
    return date.toDateString() === today.toDateString();
  }

  function getEventsForDate(date: Date) {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => e.start_at.startsWith(dateStr));
  }

  function getCardDuesForDate(date: Date) {
    const dateStr = date.toISOString().split("T")[0];
    return cardDues.filter((c) => c.due_date === dateStr);
  }

  function getEventsForHour(date: Date, hour: number) {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => {
      if (!e.start_at.startsWith(dateStr)) return false;
      if (e.all_day) return false;
      const h = new Date(e.start_at).getHours();
      return h === hour;
    });
  }

  function getAllDayEventsForDate(date: Date) {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => e.start_at.startsWith(dateStr) && e.all_day);
  }

  // Event handlers
  function openCreateForDate(dateStr: string, time?: string) {
    setFormTitle("");
    setFormDesc("");
    setFormDate(dateStr);
    setFormStartTime(time || "09:00");
    setFormEndTime(time ? `${String(parseInt(time.split(":")[0]) + 1).padStart(2, "0")}:00` : "10:00");
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
    setFormStartTime(`${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`);
    if (event.end_at) {
      const endDate = new Date(event.end_at);
      setFormEndTime(`${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`);
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

  function handleEventClick(event: CalEvent) {
    if (event.card_id) {
      // Find which board the card belongs to
      const card = cardDues.find((c) => c.id === event.card_id);
      if (card) {
        router.push(`/boards/${card.board_id}`);
        return;
      }
    }
    setShowDetail(event);
  }

  function handleCardClick(card: CardDue) {
    router.push(`/boards/${card.board_id}`);
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
        const { error: err } = await supabase.from("events").update({
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          start_at: startAt,
          end_at: endAt,
          all_day: formAllDay,
          color: formColor,
          location: formLocation.trim() || null,
        }).eq("id", editingEvent.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("events").insert({
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
        if (err) throw err;
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
    await supabase.from("events").delete().eq("id", eventId);
    setShowDetail(null);
    await loadData();
  }

  function toggleSharedMember(userId: string) {
    setSharedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // Header label
  function getHeaderLabel() {
    if (viewMode === "month") return `${MONTHS_PT[currentMonth]} ${currentYear}`;
    if (viewMode === "week") {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} de ${MONTHS_PT[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${start.getDate()} ${MONTHS_PT[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${MONTHS_PT[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    }
    return `${currentDate.getDate()} de ${MONTHS_PT[currentDate.getMonth()]} ${currentDate.getFullYear()} (${DAYS_FULL_PT[currentDate.getDay()]})`;
  }

  // Month view calendar grid
  function getMonthDays() {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(currentYear, currentMonth, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  const [showSharePanel, setShowSharePanel] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0 flex-wrap">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <CalendarDays className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Calendário</h1>

        {/* Navigation */}
        <div className="flex items-center gap-1 ml-3">
          <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-foreground min-w-[200px] text-center">
            {getHeaderLabel()}
          </h2>
          <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="ml-2 px-3 py-1 text-xs font-medium rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            Hoje
          </button>
        </div>

        {/* View mode tabs */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 ml-3">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                viewMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>

        {/* Filter and share — ONLY for admins */}
        <div className="flex items-center gap-2 ml-auto">
          {permissions.isAdmin && (
            <>
              <button
                onClick={() => setShowOnlyMine(!showOnlyMine)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                  showOnlyMine
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {showOnlyMine ? <Eye className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                {showOnlyMine ? "Minha agenda" : "Todos"}
              </button>

              <button
                onClick={() => setShowSharePanel(!showSharePanel)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                  showSharePanel
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                Compartilhar
              </button>
            </>
          )}

          <button
            onClick={() => openCreateForDate(today.toISOString().split("T")[0])}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </button>
        </div>
      </div>

      {/* Share panel */}
      {showSharePanel && (
        <div className="px-6 py-2 border-b border-border bg-accent/20 flex items-center gap-3 flex-wrap shrink-0">
          <span className="text-xs text-muted-foreground">Ver agenda de:</span>
          {orgMembers
            .filter((m) => m.user_id !== currentUserId)
            .map((m) => {
              const name = m.profiles?.full_name || m.profiles?.email || "?";
              const isShared = sharedMembers.has(m.user_id);
              return (
                <button
                  key={m.user_id}
                  onClick={() => toggleSharedMember(m.user_id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors border",
                    isShared
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: generateColor(name) }}
                  >
                    {getInitials(name)}
                  </div>
                  {name.split(" ")[0]}
                </button>
              );
            })}
        </div>
      )}

      {/* Calendar content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "month" ? (
          /* ── MONTH VIEW ── */
          <div className="p-4">
            <div className="grid grid-cols-7 border border-border rounded-xl overflow-hidden bg-card">
              {DAYS_PT.map((d) => (
                <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center bg-muted/50 border-b border-border">
                  {d}
                </div>
              ))}
              {getMonthDays().map((date, i) => {
                const dayEvents = date ? getEventsForDate(date) : [];
                const dayCards = date ? getCardDuesForDate(date) : [];
                const totalItems = dayEvents.length + dayCards.length;
                const _isToday = date ? isToday(date) : false;

                return (
                  <div
                    key={i}
                    className={cn(
                      "min-h-[100px] border-b border-r border-border p-1 transition-colors",
                      date ? "cursor-pointer hover:bg-accent/30" : "bg-muted/20",
                      i % 7 === 6 && "border-r-0"
                    )}
                    onClick={() => date && openCreateForDate(date.toISOString().split("T")[0])}
                  >
                    {date && (
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={cn(
                            "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                            _isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                          )}>
                            {date.getDate()}
                          </span>
                          {totalItems > 0 && <span className="text-[10px] text-muted-foreground">{totalItems}</span>}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map((evt) => (
                            <button
                              key={evt.id}
                              onClick={(e) => { e.stopPropagation(); handleEventClick(evt); }}
                              className="w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate transition-opacity hover:opacity-80"
                              style={{ backgroundColor: `${evt.color}20`, color: evt.color, borderLeft: `2px solid ${evt.color}` }}
                            >
                              {!evt.all_day && (
                                <span className="opacity-70">
                                  {new Date(evt.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{" "}
                                </span>
                              )}
                              {evt.title}
                            </button>
                          ))}
                          {dayCards.slice(0, 3 - Math.min(dayEvents.length, 3)).map((card) => (
                            <button
                              key={card.id}
                              onClick={(e) => { e.stopPropagation(); handleCardClick(card); }}
                              className="w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate bg-orange-500/10 text-orange-600 border-l-2 border-orange-500 hover:opacity-80 transition-opacity"
                            >
                              📋 {card.title}
                            </button>
                          ))}
                          {totalItems > 3 && <p className="text-[10px] text-muted-foreground pl-1">+{totalItems - 3} mais</p>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── WEEK / DAY VIEW (Google Calendar style with hours) ── */
          <div className="flex flex-col">
            {/* All-day events row */}
            <div className="flex border-b border-border bg-muted/30 shrink-0">
              <div className="w-16 shrink-0 border-r border-border px-2 py-1 text-[10px] text-muted-foreground">
                dia todo
              </div>
              {(viewMode === "week" ? weekDays : [currentDate]).map((date, i) => {
                const allDayEvts = getAllDayEventsForDate(date);
                const dayCards = getCardDuesForDate(date);
                return (
                  <div key={i} className={cn("flex-1 min-w-[120px] border-r border-border px-1 py-1 last:border-r-0", isToday(date) && "bg-primary/5")}>
                    {allDayEvts.map((evt) => (
                      <button
                        key={evt.id}
                        onClick={() => handleEventClick(evt)}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate mb-0.5 hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: `${evt.color}30`, color: evt.color }}
                      >
                        {evt.title}
                      </button>
                    ))}
                    {dayCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handleCardClick(card)}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate mb-0.5 bg-orange-500/10 text-orange-600 hover:opacity-80 transition-opacity"
                      >
                        📋 {card.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Day headers */}
            <div className="flex border-b border-border sticky top-0 bg-card z-10 shrink-0">
              <div className="w-16 shrink-0 border-r border-border" />
              {(viewMode === "week" ? weekDays : [currentDate]).map((date, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 min-w-[120px] border-r border-border px-2 py-2 text-center last:border-r-0",
                    isToday(date) && "bg-primary/5"
                  )}
                >
                  <span className="text-[10px] text-muted-foreground uppercase">{DAYS_PT[date.getDay()]}</span>
                  <br />
                  <span className={cn(
                    "text-lg font-bold inline-flex items-center justify-center w-8 h-8 rounded-full",
                    isToday(date) ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}>
                    {date.getDate()}
                  </span>
                </div>
              ))}
            </div>

            {/* Hour grid */}
            <div className="flex-1 overflow-y-auto">
              {HOURS.map((hour) => (
                <div key={hour} className="flex border-b border-border/50 min-h-[48px]">
                  <div className="w-16 shrink-0 border-r border-border px-2 py-1 text-[10px] text-muted-foreground text-right">
                    {String(hour).padStart(2, "0")}:00
                  </div>
                  {(viewMode === "week" ? weekDays : [currentDate]).map((date, i) => {
                    const hourEvents = getEventsForHour(date, hour);
                    const dateStr = date.toISOString().split("T")[0];
                    const timeStr = `${String(hour).padStart(2, "0")}:00`;

                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 min-w-[120px] border-r border-border/50 last:border-r-0 px-0.5 py-0.5 cursor-pointer hover:bg-accent/20 transition-colors relative",
                          isToday(date) && "bg-primary/[0.02]"
                        )}
                        onClick={() => openCreateForDate(dateStr, timeStr)}
                      >
                        {hourEvents.map((evt) => {
                          const startH = new Date(evt.start_at).getHours();
                          const startM = new Date(evt.start_at).getMinutes();
                          const endH = evt.end_at ? new Date(evt.end_at).getHours() : startH + 1;
                          const durationHours = Math.max(endH - startH, 1);
                          const memberName = orgMembers.find((m) => m.user_id === evt.created_by)?.profiles?.full_name;
                          const isOwnEvent = evt.created_by === currentUserId;

                          return (
                            <button
                              key={evt.id}
                              onClick={(e) => { e.stopPropagation(); handleEventClick(evt); }}
                              className="w-full text-left rounded-md px-1.5 py-1 text-[11px] font-medium truncate mb-0.5 hover:opacity-80 transition-opacity border-l-2"
                              style={{
                                backgroundColor: `${evt.color}15`,
                                color: evt.color,
                                borderLeftColor: evt.color,
                                minHeight: `${durationHours * 44}px`,
                              }}
                            >
                              <div className="font-semibold truncate">{evt.title}</div>
                              <div className="opacity-70 text-[10px]">
                                {new Date(evt.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                {evt.end_at && ` - ${new Date(evt.end_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                              </div>
                              {!isOwnEvent && memberName && (
                                <div className="opacity-60 text-[9px] truncate">{memberName}</div>
                              )}
                              {evt.card_id && (
                                <div className="opacity-60 text-[9px] flex items-center gap-0.5">
                                  <ExternalLink className="w-2.5 h-2.5" /> Tarefa vinculada
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-2 border-t border-border flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Eventos
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Prazos de tarefas
        </div>
      </div>

      {/* Create/Edit Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">{editingEvent ? "Editar Evento" : "Novo Evento"}</h3>
              <button onClick={() => { setShowCreate(false); setEditingEvent(null); }} className="text-muted-foreground hover:text-foreground hover:bg-accent p-1 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEvent} className="p-5 space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Nome do evento" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" required autoFocus />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Data *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" required />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="allDay" checked={formAllDay} onChange={(e) => setFormAllDay(e.target.checked)} className="rounded border-border" />
                <label htmlFor="allDay" className="text-sm text-foreground">Dia inteiro</label>
              </div>

              {!formAllDay && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">Início</label>
                    <input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">Fim</label>
                    <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Local</label>
                <input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Sala de reunião, link do Meet..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Descrição</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Detalhes do evento" rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Cor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {EVENT_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setFormColor(c)} className={cn("w-6 h-6 rounded-full transition-all", formColor === c ? "ring-2 ring-offset-2 ring-offset-card ring-primary scale-110" : "hover:scale-110")} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setEditingEvent(null); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || !formTitle.trim()} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
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
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: showDetail.color }} />
              <h3 className="font-semibold text-foreground flex-1 truncate">{showDetail.title}</h3>
              <button onClick={() => openEditEvent(showDetail)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDeleteEvent(showDetail.id)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowDetail(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                {showDetail.all_day ? (
                  <span>{new Date(showDetail.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })} — Dia inteiro</span>
                ) : (
                  <span>
                    {new Date(showDetail.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}{" "}
                    {new Date(showDetail.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {showDetail.end_at && <> — {new Date(showDetail.end_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>}
                  </span>
                )}
              </div>
              {showDetail.location && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  {showDetail.location}
                </div>
              )}
              {showDetail.card_id && (
                <button
                  onClick={() => {
                    const card = cardDues.find((c) => c.id === showDetail.card_id);
                    if (card) router.push(`/boards/${card.board_id}`);
                  }}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:bg-primary/5 px-2 py-1 rounded-md transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver tarefa vinculada
                </button>
              )}
              {showDetail.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{showDetail.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
