"use client";

import { useState } from "react";
import {
  Plus, X, GripVertical, Loader2, Trash2, Play, Flag,
  Clock, User, Pencil, Check, ChevronDown,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

const PHASE_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#06b6d4", "#14b8a6",
  "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899",
];

export interface Phase {
  id: string;
  pipe_id: string;
  name: string;
  description: string | null;
  position: number;
  sla_hours: number | null;
  default_assignee_id: string | null;
  is_start: boolean;
  is_end: boolean;
  color: string;
}

interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface Props {
  phases: Phase[];
  members: OrgMember[];
  onSave: (phases: Phase[]) => Promise<void>;
  onAdd: (phase: Omit<Phase, "id" | "pipe_id">) => Promise<void>;
  onDelete: (phaseId: string) => Promise<void>;
}

export function PhaseEditor({ phases, members, onSave, onAdd, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Add form
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addSla, setAddSla] = useState("");
  const [addColor, setAddColor] = useState(PHASE_COLORS[0]);
  const [addAssignee, setAddAssignee] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSla, setEditSla] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editIsStart, setEditIsStart] = useState(false);
  const [editIsEnd, setEditIsEnd] = useState(false);

  function startEdit(phase: Phase) {
    setEditingId(phase.id);
    setEditName(phase.name);
    setEditDesc(phase.description || "");
    setEditSla(phase.sla_hours?.toString() || "");
    setEditColor(phase.color);
    setEditAssignee(phase.default_assignee_id || "");
    setEditIsStart(phase.is_start);
    setEditIsEnd(phase.is_end);
  }

  async function saveEdit(phase: Phase) {
    setSaving(true);
    const updated = phases.map((p) =>
      p.id === phase.id
        ? {
            ...p,
            name: editName.trim() || p.name,
            description: editDesc.trim() || null,
            sla_hours: editSla ? parseInt(editSla) : null,
            color: editColor,
            default_assignee_id: editAssignee || null,
            is_start: editIsStart,
            is_end: editIsEnd,
          }
        : p
    );
    await onSave(updated);
    setEditingId(null);
    setSaving(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setSaving(true);
    await onAdd({
      name: addName.trim(),
      description: addDesc.trim() || null,
      position: phases.length,
      sla_hours: addSla ? parseInt(addSla) : null,
      default_assignee_id: addAssignee || null,
      is_start: phases.length === 0,
      is_end: false,
      color: addColor,
    });
    setAddName("");
    setAddDesc("");
    setAddSla("");
    setAddAssignee("");
    setAddColor(PHASE_COLORS[(phases.length + 1) % PHASE_COLORS.length]);
    setShowAdd(false);
    setSaving(false);
  }

  async function handleDelete(phaseId: string) {
    if (!confirm("Tem certeza que deseja remover esta fase?")) return;
    setDeleting(phaseId);
    await onDelete(phaseId);
    setDeleting(null);
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const reordered = [...phases];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    // Update positions
    const withPositions = reordered.map((p, i) => ({ ...p, position: i }));
    await onSave(withPositions);
  }

  function getMemberName(userId: string | null) {
    if (!userId) return null;
    const m = members.find((m) => m.user_id === userId);
    return m?.full_name || m?.email || null;
  }

  return (
    <div className="space-y-4">
      {/* Phase list with drag-and-drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="phases">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {phases.map((phase, index) => (
                <Draggable key={phase.id} draggableId={phase.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={cn(
                        "bg-card border border-border rounded-xl transition-all",
                        snapshot.isDragging && "shadow-lg ring-2 ring-primary/30"
                      )}
                    >
                      {editingId === phase.id ? (
                        /* Edit mode */
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              placeholder="Nome da fase"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEdit(phase)}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>

                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Descrição da fase (opcional)"
                            rows={2}
                            className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                          />

                          <div className="flex items-center gap-4 flex-wrap">
                            {/* SLA */}
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                type="number"
                                value={editSla}
                                onChange={(e) => setEditSla(e.target.value)}
                                placeholder="SLA"
                                min="0"
                                className="w-16 px-2 py-1 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <span className="text-xs text-muted-foreground">horas</span>
                            </div>

                            {/* Assignee */}
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              <select
                                value={editAssignee}
                                onChange={(e) => setEditAssignee(e.target.value)}
                                className="px-2 py-1 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                              >
                                <option value="">Sem responsável padrão</option>
                                {members.map((m) => (
                                  <option key={m.user_id} value={m.user_id}>
                                    {m.full_name || m.email}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Color */}
                            <div className="flex items-center gap-1">
                              {PHASE_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditColor(c)}
                                  className={cn(
                                    "w-5 h-5 rounded-full transition-all cursor-pointer",
                                    editColor === c ? "ring-2 ring-offset-1 ring-offset-background ring-foreground" : ""
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Start/End flags */}
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsStart}
                                onChange={(e) => setEditIsStart(e.target.checked)}
                                className="accent-primary"
                              />
                              <Play className="w-3 h-3" /> Fase inicial
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsEnd}
                                onChange={(e) => setEditIsEnd(e.target.checked)}
                                className="accent-primary"
                              />
                              <Flag className="w-3 h-3" /> Fase final
                            </label>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                          </div>

                          {/* Color dot */}
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />

                          {/* Position number */}
                          <span className="text-xs text-muted-foreground font-mono w-5">{index + 1}</span>

                          {/* Name + badges */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{phase.name}</span>
                              {phase.is_start && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded-full font-medium flex items-center gap-0.5">
                                  <Play className="w-2.5 h-2.5" /> Início
                                </span>
                              )}
                              {phase.is_end && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded-full font-medium flex items-center gap-0.5">
                                  <Flag className="w-2.5 h-2.5" /> Fim
                                </span>
                              )}
                            </div>
                            {phase.description && (
                              <p className="text-xs text-muted-foreground truncate">{phase.description}</p>
                            )}
                          </div>

                          {/* SLA */}
                          {phase.sla_hours && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              {phase.sla_hours}h
                            </span>
                          )}

                          {/* Assignee */}
                          {phase.default_assignee_id && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <User className="w-3 h-3" />
                              {getMemberName(phase.default_assignee_id)?.split(" ")[0] || "—"}
                            </span>
                          )}

                          {/* Actions */}
                          <button
                            onClick={() => startEdit(phase)}
                            className="p-1 rounded-md hover:bg-accent transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDelete(phase.id)}
                            disabled={deleting === phase.id}
                            className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                          >
                            {deleting === phase.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add phase form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Nome da nova fase"
              className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              required
            />
          </div>

          <textarea
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="number"
                value={addSla}
                onChange={(e) => setAddSla(e.target.value)}
                placeholder="SLA"
                min="0"
                className="w-16 px-2 py-1 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">horas</span>
            </div>

            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={addAssignee}
                onChange={(e) => setAddAssignee(e.target.value)}
                className="px-2 py-1 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">Sem responsável</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              {PHASE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddColor(c)}
                  className={cn(
                    "w-5 h-5 rounded-full transition-all cursor-pointer",
                    addColor === c ? "ring-2 ring-offset-1 ring-offset-background ring-foreground" : ""
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !addName.trim()}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Adicionar fase
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar fase
        </button>
      )}

      {phases.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Adicione pelo menos uma fase para configurar o processo.
        </p>
      )}
    </div>
  );
}
