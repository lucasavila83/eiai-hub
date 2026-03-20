"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Kanban, Loader2 } from "lucide-react";
import { CreateBoardButton } from "@/components/kanban/CreateBoardButton";
import { useAuth } from "@/components/providers/AuthProvider";

export default function BoardsPage() {
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { orgId, supabase } = useAuth();

  useEffect(() => {
    if (!orgId) return;

    (async () => {
      const { data } = await supabase
        .from("boards")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      setBoards(data || []);
      setLoading(false);
    })();
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Boards</h1>
        <CreateBoardButton orgId={orgId} />
      </div>

      {!boards.length ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Kanban className="w-12 h-12 text-muted-foreground mb-3" />
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
                  <Kanban className="w-5 h-5 text-primary" />
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
