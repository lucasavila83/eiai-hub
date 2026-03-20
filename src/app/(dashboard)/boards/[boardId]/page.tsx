"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { BoardView } from "@/components/kanban/BoardView";
import { Loader2 } from "lucide-react";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [board, setBoard] = useState<any>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { user, supabase } = useAuth();

  useEffect(() => {
    (async () => {
      const [boardRes, columnsRes, cardsRes] = await Promise.all([
        supabase.from("boards").select("*").eq("id", boardId).single(),
        supabase.from("columns").select("*").eq("board_id", boardId).order("position"),
        supabase
          .from("cards")
          .select("*, card_assignees(user_id, profiles:user_id(id, full_name, avatar_url, email))")
          .eq("board_id", boardId)
          .eq("is_archived", false)
          .order("position"),
      ]);

      if (!boardRes.data) { router.replace("/boards"); return; }

      setBoard(boardRes.data);
      setColumns(columnsRes.data || []);
      setCards(cardsRes.data || []);
      setLoading(false);
    })();
  }, [boardId]);

  if (loading || !board) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
