"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Loader2 } from "lucide-react";

interface Props {
  orgId: string;
}

export function CreateBoardButton({ orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const { data: board, error } = await supabase
      .from("boards")
      .insert({
        org_id: orgId,
        name: name.trim(),
        description: description.trim() || null,
        visibility: "public",
        is_archived: false,
        settings: {},
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      setLoading(false);
      return;
    }

    // Create default columns
    if (board) {
      const defaultColumns = [
        { name: "A Fazer", position: 0, color: "#6366f1" },
        { name: "Em Progresso", position: 1, color: "#f59e0b" },
        { name: "Concluído", position: 2, color: "#22c55e", is_done_column: true },
      ];

      await supabase.from("columns").insert(
        defaultColumns.map((col) => ({
          board_id: board.id,
          name: col.name,
          position: col.position,
          color: col.color,
          is_done_column: col.is_done_column ?? false,
        }))
      );

      setOpen(false);
      setName("");
      setDescription("");
      setLoading(false);
      router.push(`/boards/${board.id}`);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Novo Board
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Novo Board</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Sprint 01"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o board..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Criar Board
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>

            <p className="text-xs text-muted-foreground mt-3">
              Colunas padrão: A Fazer, Em Progresso, Concluído
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
