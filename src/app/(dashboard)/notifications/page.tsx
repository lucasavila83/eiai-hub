import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Bell,
  Check,
  CheckSquare,
  AtSign,
  MessageSquare,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils/helpers";
import Link from "next/link";

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

async function getNotifications(userId: string): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const items: NotificationItem[] = [];

  // 1. Task assignments (recent 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: assignments } = await supabase
    .from("card_assignees")
    .select(`
      id,
      assigned_at,
      card_id,
      cards!inner (
        id,
        title,
        board_id,
        column_id,
        columns!inner ( name ),
        boards!inner ( name )
      )
    `)
    .eq("user_id", userId)
    .gte("assigned_at", thirtyDaysAgo.toISOString())
    .order("assigned_at", { ascending: false })
    .limit(30);

  if (assignments) {
    for (const a of assignments) {
      const card = a.cards as any;
      const boardName = card?.boards?.name || "Board";
      const columnName = card?.columns?.name || "";
      items.push({
        id: `task-${a.id}`,
        type: "task",
        title: `Tarefa atribuida: ${card?.title || "Sem titulo"}`,
        description: `${boardName}${columnName ? ` / ${columnName}` : ""}`,
        link: `/boards/${card?.board_id}`,
        is_read: false,
        created_at: a.assigned_at,
      });
    }
  }

  // 2. Mentions in messages
  const { data: mentions } = await supabase
    .from("messages")
    .select(`
      id,
      content,
      created_at,
      channel_id,
      user_id,
      channels!inner ( id, name, type ),
      profiles!inner ( full_name )
    `)
    .contains("mentions", [userId])
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  if (mentions) {
    for (const m of mentions) {
      const channel = m.channels as any;
      const sender = m.profiles as any;
      const senderName = sender?.full_name || "Alguem";
      const channelName = channel?.name || "canal";
      items.push({
        id: `mention-${m.id}`,
        type: "mention",
        title: `@${senderName} mencionou voce em #${channelName}`,
        description:
          m.content.length > 100
            ? m.content.slice(0, 100) + "..."
            : m.content,
        link: `/chat?channel=${m.channel_id}`,
        is_read: false,
        created_at: m.created_at,
      });
    }
  }

  // 3. Unread messages per channel
  const { data: memberships } = await supabase
    .from("channel_members")
    .select(`
      channel_id,
      last_read_at,
      channels!inner ( id, name, type )
    `)
    .eq("user_id", userId);

  if (memberships) {
    for (const mem of memberships) {
      const channel = mem.channels as any;
      if (!channel) continue;

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", mem.channel_id)
        .gt("created_at", mem.last_read_at || "1970-01-01T00:00:00Z")
        .neq("user_id", userId)
        .is("deleted_at", null);

      if (count && count > 0) {
        items.push({
          id: `unread-${mem.channel_id}`,
          type: "unread",
          title: `${count} mensagen${count > 1 ? "s" : ""} nao lida${count > 1 ? "s" : ""} em #${channel.name}`,
          description: null,
          link: `/chat?channel=${mem.channel_id}`,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // 4. Stored notifications from DB
  const { data: dbNotifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (dbNotifications) {
    for (const n of dbNotifications) {
      // Avoid duplicates - only add if not already covered by type-specific queries
      const notifType = n.type === "task_assigned"
        ? "task"
        : n.type === "mention"
        ? "mention"
        : "unread";

      items.push({
        id: `notif-${n.id}`,
        type: notifType,
        title: n.title,
        description: n.body,
        link: n.link,
        is_read: n.is_read,
        created_at: n.created_at,
      });
    }
  }

  // Sort all by date descending
  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return items;
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
      return <Bell className="w-5 h-5 text-gray-400" />;
  }
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const activeTab: TabKey = (["all", "tasks", "mentions"].includes(params.tab || "")
    ? params.tab
    : "all") as TabKey;

  const allNotifications = await getNotifications(user.id);

  const filtered =
    activeTab === "all"
      ? allNotifications
      : activeTab === "tasks"
      ? allNotifications.filter((n) => n.type === "task")
      : allNotifications.filter((n) => n.type === "mention");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: allNotifications.length },
    {
      key: "tasks",
      label: "Tarefas",
      count: allNotifications.filter((n) => n.type === "task").length,
    },
    {
      key: "mentions",
      label: "Mencoes",
      count: allNotifications.filter((n) => n.type === "mention").length,
    },
  ];

  async function markAllRead() {
    "use server";
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) {
      await sb
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id);
      revalidatePath("/notifications");
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
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
        <form action={markAllRead}>
          <button
            type="submit"
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            <Check className="w-4 h-4" />
            Marcar todas como lidas
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/notifications${tab.key === "all" ? "" : `?tab=${tab.key}`}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? "bg-primary/10 text-primary"
                    : "bg-gray-200 text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="p-4 bg-gray-100 rounded-full mb-4">
            <Bell className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Nenhuma notificacao
          </h2>
          <p className="text-muted-foreground text-sm">Voce esta em dia!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`bg-white border rounded-xl p-4 transition-colors hover:border-gray-300 ${
                !n.is_read
                  ? "border-primary/30 bg-primary/[0.02]"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                  </div>
                  {n.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {n.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(n.created_at)}
                    </span>
                    {n.link && (
                      <Link
                        href={n.link}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
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
