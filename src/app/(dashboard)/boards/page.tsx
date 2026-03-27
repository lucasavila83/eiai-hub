"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Kanban, Loader2, Lock, Users, Globe } from "lucide-react";
import { CreateBoardButton } from "@/components/kanban/CreateBoardButton";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { cn } from "@/lib/utils/helpers";

const visibilityIcons: Record<string, any> = {
  public: Globe,
  team: Users,
  private: Lock,
};

const visibilityLabels: Record<string, string> = {
  public: "Público",
  team: "Equipe",
  private: "Privado",
};

export default function BoardsPage() {
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { orgId, supabase, user } = useAuth();
  const permissions = usePermissions();

  async function loadBoards() {
    if (!orgId || !user?.id || permissions.loading) return;

    const { data: allBoards } = await supabase
      .from("boards")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_archived", false)
      .order("name", { ascending: true });

    if (!allBoards) {
      setBoards([]);
      setLoading(false);
      return;
    }

    if (permissions.isAdmin) {
      setBoards(allBoards);
      setLoading(false);
      return;
    }

    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);
    const userTeamIds = new Set((teamMemberships || []).map((t: any) => t.team_id));

    const { data: boardMemberships } = await supabase
      .from("board_members")
      .select("board_id")
      .eq("user_id", user.id);
    const userBoardIds = new Set((boardMemberships || []).map((b: any) => b.board_id));

    const filteredBoards = allBoards.filter((board: any) => {
      if (userBoardIds.has(board.id)) return true;
      if (board.visibility === "public") return true;
      if (board.visibility === "team" && board.team_id && userTeamIds.has(board.team_id)) return true;
      if (board.created_by === user.id) return true;
      return false;
    });

    const vis = permissions.boardVisibility;
    let finalBoards = filteredBoards;

    if (vis === "own") {
      finalBoards = filteredBoards.filter(
        (b: any) => b.created_by === user.id || userBoardIds.has(b.id)
      );
    } else if (vis === "team") {
      finalBoards = filteredBoards.filter(
        (b: any) =>
          b.created_by === user.id ||
          userBoardIds.has(b.id) ||
          (b.team_id && userTeamIds.has(b.team_id)) ||
          b.visibility === "public"
      );
    }

    setBoards(finalBoards);
    setLoading(false);
  }

  useEffect(() => {
    loadBoards();
  }, [orgId, user?.id, permissions.loading, permissions.isAdmin, permissions.boardVisibility]);

  // Realtime: auto-refresh when boards change
  useEffect(() => {
    if (!orgId) return;
    const sub = supabase
      .channel("boards-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "boards", filter: `org_id=eq.${orgId}` }, () => {
        loadBoards();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [orgId, user?.id, permissions.loading]);

  if (loading || permissions.loading) {
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
        {permissions.boards.edit && <CreateBoardButton orgId={orgId} />}
      </div>

      {!boards.length ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Kanban className="w-12 h-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Nenhum board disponível</h2>
          <p className="text-muted-foreground text-sm mb-4">
            {permissions.isAdmin
              ? "Crie seu primeiro board para organizar tarefas"
              : "Você ainda não foi adicionado a nenhum board"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board) => {
            const VisIcon = visibilityIcons[board.visibility] || Globe;
            return (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Kanban className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{board.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <VisIcon className="w-3 h-3" />
                      {visibilityLabels[board.visibility] || board.visibility}
                    </p>
                  </div>
                </div>
                {board.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{board.description}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
