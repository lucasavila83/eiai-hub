import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BoardView } from "@/components/kanban/BoardView";

interface Props {
  params: Promise<{ boardId: string }>;
}

export default async function BoardPage({ params }: Props) {
  const { boardId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: board } = await supabase
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();

  if (!board) redirect("/boards");

  const { data: columns } = await supabase
    .from("columns")
    .select("*")
    .eq("board_id", boardId)
    .order("position");

  const { data: cards } = await supabase
    .from("cards")
    .select("*, card_assignees(user_id, profiles:user_id(id, full_name, avatar_url, email))")
    .eq("board_id", boardId)
    .eq("is_archived", false)
    .order("position");

  return (
    <BoardView
      board={board}
      initialColumns={columns || []}
      initialCards={cards || []}
      currentUserId={user.id}
    />
  );
}
