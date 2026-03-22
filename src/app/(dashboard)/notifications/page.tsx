"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckSquare,
  AtSign,
  MessageSquare,
  ExternalLink,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatDateTime } from "@/lib/utils/helpers";

type TabKey = "all" | "tasks" | "mentions";

interface NotificationItem {
  id: string;
  type: "task" | "mention" | "unread";
  title: string;
  description: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function getIcon(type: string) {
  switch (type) {
    case "task":
      return <CheckSquare className="w-5 h-5 text-primary" />;
    case "mention":
      return <AtSign className="w-5 h-5 text-purple-500" />;
    case "unread":
      return <MessageSquare className="w-5 h-5 text-green-500" />;
    default:
      return <Bell className="w-5 h-5 text-muted-foreground" />;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [loading, setLoading] = useState(true);
  const { user, supabase } = useAuth();

  useEffect(() => {
    (async () => {
      const items: NotificationItem[] = [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [assignmentsRes, mentionsRes, dbNotifRes] = await Promise.all([
        supabase
          .from("card_assignees")
          .select(`id, assigned_at, card_id, cards!inner (id, title, board_id, column_id, columns!inner ( name ), boards!inner ( name ))`)
          .eq("user_id", user.id)
          .gte("assigned_at", thirtyDaysAgo.toISOString())
          .order("assigned_at", { ascending: false })
          .limit(30),
        supabase
          .from("messages")
          .select(`id, content, created_at, channel_id, user_id, channels!inner ( id, name, type ), profiles!inner ( full_name )`)
          .contains("mentions", [user.id])
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (assignmentsRes.data) {
        for (const a of assignmentsRes.data) {
          const card = a.cards as any;
          items.push({
            id: `task-${a.id}`,
            type: "task",
            title: `Tarefa atribuida: ${card?.title || "Sem titulo"}`,
            description: `${card?.boards?.name || "Board"}${card?.columns?.name ? ` / ${card.columns.name}` : ""}`,
            link: `/boards/${card?.board_id}`,
            is_read: false,
            created_at: a.assigned_at,
          });
        }
      }

      if (mentionsRes.data) {
        for (const m of mentionsRes.data) {
          const channel = m.channels as any;
          const sender = m.profiles as any;
          items.push({
            id: `mention-${m.id}`,
            type: "mention",
            title: `@${sender?.full_name || "Alguem"} mencionou voce em #${channel?.name || "canal"}`,
            description: m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content,
            link: `/chat/${m.channel_id}`,
            is_read: false,
            created_at: m.created_at,
          });
        }
      }

      if (dbNotifRes.data) {
        for (const n of dbNotifRes.data) {
          items.push({
            id: `notif-${n.id}`,
            type: n.type === "task_assigned" ? "task" : n.type === "mention" ? "mention" : "unread",
            title: n.title,
            description: n.body,
            link: n.link,
            is_read: n.is_read,
            created_at: n.created_at,
          });
        }
      }

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotifications(items);
      setLoading(false);
    })();
  }, []);

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const filtered =
    activeTab === "all"
      ? notifications
      : activeTab === "tasks"
      ? notifications.filter((n) => n.type === "task")
      : notifications.filter((n) => n.type === "mention");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: notifications.length },
    { key: "tasks", label: "Tarefas", count: notifications.filter((n) => n.type === "task").length },
    { key: "mentions", label: "Mencoes", count: notifications.filter((n) => n.type === "mention").length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Notificações</h1>
        </div>
        <button
          onClick={markAllRead}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:underline transition-colors"
        >
          <Check className="w-4 h-4" />
          Marcar todas como lidas
        </button>
      </div>

      <div className="flex items-center gap-1 mb-6 bg-muted rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="p-4 bg-muted rounded-full mb-4">
            <Bell className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Nenhuma notificacao</h2>
          <p className="text-muted-foreground text-sm">Voce esta em dia!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`bg-card border rounded-xl p-4 transition-colors hover:border-border ${
                !n.is_read ? "border-primary/30 bg-primary/[0.02]" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  </div>
                  {n.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                    {n.link && (
                      <Link href={n.link} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />
                        Ver
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
