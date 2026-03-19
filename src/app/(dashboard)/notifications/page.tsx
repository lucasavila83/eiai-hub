import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { formatDateTime } from "@/lib/utils/helpers";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Notificações</h1>
        <form action={async () => {
          "use server";
          const sb = await createClient();
          const { data: { user } } = await sb.auth.getUser();
          if (user) {
            await sb.from("notifications").update({ is_read: true }).eq("user_id", user.id);
          }
        }}>
          <button type="submit" className="flex items-center gap-2 text-sm text-primary hover:underline">
            <Check className="w-4 h-4" />
            Marcar todas como lidas
          </button>
        </form>
      </div>

      {!notifications?.length ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Bell className="w-12 h-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Nenhuma notificação</h2>
          <p className="text-muted-foreground text-sm">Você está em dia!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-card border rounded-xl p-4 ${!n.is_read ? "border-primary/30 bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{formatDateTime(n.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
