"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { BoardView } from "@/components/kanban/BoardView";
import { Loader2, Shield } from "lucide-react";
import Link from "next/link";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [board, setBoard] = useState<any>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const router = useRouter();
  const { user, supabase } = useAuth();
  const permissions = usePermissions();

  useEffect(() => {
    if (!user?.id || permissions.loading) return;

    (async () => {
      const { data: boardData } = await supabase
        .from("boards")
        .select("*")
        .eq("id", boardId)
        .single();

      if (!boardData) { router.replace("/boards"); return; }

      // Access check for non-admins
      if (!permissions.isAdmin) {
        let hasAccess = false;

        // Created by user
        if (boardData.created_by === user.id) hasAccess = true;

        // Public board
        if (boardData.visibility === "public") hasAccess = true;

        // Board member
        if (!hasAccess) {
          const { data: bm } = await supabase
            .from("board_members")
            .select("id")
            .eq("board_id", boardId)
            .eq("user_id", user.id)
            .single();
          if (bm) hasAccess = true;
        }

        // Team board — user is in the team
        if (!hasAccess && boardData.visibility === "team" && boardData.team_id) {
          const { data: tm } = await supabase
            .from("team_members")
            .select("id")
            .eq("team_id", boardData.team_id)
            .eq("user_id", user.id)
            .single();
          if (tm) hasAccess = true;
        }

        // Check boardVisibility permission
        if (hasAccess && permissions.boardVisibility === "own") {
          // "own" = only boards created by user or where user is board_member
          if (boardData.created_by !== user.id) {
            const { data: bm } = await supabase
              .from("board_members")
              .select("id")
              .eq("board_id", boardId)
              .eq("user_id", user.id)
              .single();
            if (!bm) hasAccess = false;
          }
        }

        if (!hasAccess) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }

      const [columnsRes, cardsRes] = await Promise.all([
        supabase.from("columns").select("*").eq("board_id", boardId).order("position"),
        supabase
          .from("cards")
          .select("*, card_assignees(user_id, profiles:user_id(id, full_name, avatar_url, email))")
          .eq("board_id", boardId)
          .eq("is_archived", false)
          .order("position"),
      ]);

      setBoard(boardData);
      setColumns(columnsRes.data || []);
      setCards(cardsRes.data || []);
      setLoading(false);
    })();
  }, [boardId, user?.id, permissions.loading, permissions.isAdmin, permissions.boardVisibility]);

  if (loading || permissions.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-1">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Você não tem permissão para acessar este board. Peça a um administrador para adicioná-lo.
          </p>
        </div>
        <Link
          href="/boards"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Voltar aos boards
        </Link>
      </div>
    );
  }

  return (
    <BoardView
      board={board}
      initialColumns={columns}
      initialCards={cards}
      currentUserId={user.id}
    />
  );
}
