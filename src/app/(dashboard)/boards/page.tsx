import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutKanban, Plus } from "lucide-react";

export default async function BoardsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);

  const orgIds = memberships?.map((m) => m.org_id) || [];

  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .in("org_id", orgIds)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Boards</h1>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          Novo Board
        </button>
      </div>

      {!boards?.length ? (
        <div className="flex flex-col items-center justify-center py-20">
          <LayoutKanban className="w-12 h-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Nenhum board ainda</h2>
          <p className="text-muted-foreground text-sm mb-4">Crie seu primeiro board para organizar tarefas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/boards/${board.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <LayoutKanban className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{board.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{board.visibility}</p>
                </div>
              </div>
              {board.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{board.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
