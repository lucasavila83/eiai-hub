"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/helpers";
import { X, Pencil, Trash2, Plus, Check } from "lucide-react";

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface Props {
  boardId: string;
  labels: { id: string; name: string; color: string }[];
  onClose: () => void;
  onLabelsChanged: () => void;
}

export function LabelManagerModal({ boardId, labels, onClose, onLabelsChanged }: Props) {
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New label
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  function startEdit(label: { id: string; name: string; color: string }) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setConfirmDeleteId(null);
  }

  async function saveEdit(labelId: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    await supabase
      .from("labels")
      .update({ name: trimmed, color: editColor })
      .eq("id", labelId);
    setEditingId(null);
    onLabelsChanged();
  }

  async function handleDelete(labelId: string) {
    await supabase.from("card_labels").delete().eq("label_id", labelId);
    await supabase.from("labels").delete().eq("id", labelId);
    setConfirmDeleteId(null);
    onLabelsChanged();
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await supabase
      .from("labels")
      .insert({ board_id: boardId, name: trimmed, color: newColor });
    setNewName("");
    setNewColor(LABEL_COLORS[0]);
    setAdding(false);
    onLabelsChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Gerenciar Labels</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Labels list */}
        <div className="p-4 space-y-2">
          {labels.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma label criada para este board
            </p>
          )}

          {labels.map((label) => (
            <div key={label.id}>
              {editingId === label.id ? (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(label.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex gap-1.5">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditColor(color)}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                          editColor === color ? "border-foreground" : "border-transparent"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(label.id)}
                      className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:bg-primary/90"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors group">
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-sm text-foreground truncate">{label.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(label)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {confirmDeleteId === label.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(label.id)}
                          className="px-2 py-0.5 bg-destructive text-destructive-foreground rounded text-xs hover:bg-destructive/90"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Nao
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(label.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Sera removido de todos os cards"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new label */}
          {adding ? (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da label"
                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              <div className="flex gap-1.5">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                      newColor === color ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:bg-primary/90"
                >
                  Criar label
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent px-3 py-2.5 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar label
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
