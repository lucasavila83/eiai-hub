"use client";

import { useState } from "react";
import {
  Plus, X, GripVertical, Loader2, Trash2, Pencil, Check,
  Type, AlignLeft, Hash, DollarSign, CalendarDays, List,
  ListChecks, ToggleLeft, Mail, Phone, Paperclip, User, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type { FieldDef } from "./DynamicField";

const FIELD_TYPES = [
  { value: "text", label: "Texto curto", icon: Type },
  { value: "textarea", label: "Texto longo", icon: AlignLeft },
  { value: "number", label: "Número", icon: Hash },
  { value: "currency", label: "Monetário (R$)", icon: DollarSign },
  { value: "date", label: "Data", icon: CalendarDays },
  { value: "select", label: "Seleção única", icon: List },
  { value: "multiselect", label: "Múltipla escolha", icon: ListChecks },
  { value: "checkbox", label: "Sim/Não", icon: ToggleLeft },
  { value: "email", label: "E-mail", icon: Mail },
  { value: "phone", label: "Telefone", icon: Phone },
  { value: "file", label: "Arquivo", icon: Paperclip },
  { value: "user", label: "Pessoa", icon: User },
  { value: "checklist", label: "Checklist", icon: ClipboardCheck },
] as const;

function getFieldIcon(type: string) {
  return FIELD_TYPES.find((t) => t.value === type)?.icon || Type;
}

function getFieldLabel(type: string) {
  return FIELD_TYPES.find((t) => t.value === type)?.label || type;
}

interface Props {
  fields: FieldDef[];
  phaseName: string;
  members?: { user_id: string; full_name: string | null; email: string }[];
  onSave: (fields: FieldDef[]) => Promise<void>;
  onAdd: (field: Omit<FieldDef, "id" | "phase_id">) => Promise<void>;
  onDelete: (fieldId: string) => Promise<void>;
}

export function FieldConfigurator({ fields, phaseName, members = [], onSave, onAdd, onDelete }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Add form
  const [addType, setAddType] = useState("text");
  const [addLabel, setAddLabel] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addPlaceholder, setAddPlaceholder] = useState("");
  const [addHelp, setAddHelp] = useState("");
  const [addRequired, setAddRequired] = useState(false);
  const [addOptions, setAddOptions] = useState("");
  const [addRequiredItems, setAddRequiredItems] = useState<string[]>([]);
  const [addAssignee, setAddAssignee] = useState("");

  // Edit form
  const [editLabel, setEditLabel] = useState("");
  const [editPlaceholder, setEditPlaceholder] = useState("");
  const [editHelp, setEditHelp] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [editOptions, setEditOptions] = useState("");
  const [editRequiredItems, setEditRequiredItems] = useState<string[]>([]);
  const [editAssignee, setEditAssignee] = useState("");

  function generateKey(label: string): string {
    return label
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function startEdit(field: FieldDef) {
    setEditingId(field.id);
    setEditLabel(field.label);
    setEditPlaceholder(field.placeholder || "");
    setEditHelp(field.help_text || "");
    setEditRequired(field.is_required);
    setEditOptions(
      (field.options || []).map((o) => o.label).join("\n")
    );
    setEditRequiredItems(
      (field.options || []).filter((o: any) => o.required).map((o) => o.label)
    );
    setEditAssignee(field.assignee_id || "");
  }

  async function saveEdit(field: FieldDef) {
    setSaving(true);
    const opts = editOptions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        value: generateKey(l),
        label: l,
        ...(field.field_type === "checklist" && editRequiredItems.includes(l) ? { required: true } : {}),
      }));

    const updated = fields.map((f) =>
      f.id === field.id
        ? {
            ...f,
            label: editLabel.trim() || f.label,
            placeholder: editPlaceholder.trim() || null,
            help_text: editHelp.trim() || null,
            is_required: editRequired,
            options: opts,
            assignee_id: editAssignee || null,
          }
        : f
    );
    await onSave(updated);
    setEditingId(null);
    setSaving(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addLabel.trim()) return;
    setSaving(true);

    const key = addKey.trim() || generateKey(addLabel);
    const opts = addOptions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        value: generateKey(l),
        label: l,
        ...(addType === "checklist" && addRequiredItems.includes(l) ? { required: true } : {}),
      }));

    await onAdd({
      field_key: key,
      field_type: addType,
      label: addLabel.trim(),
      placeholder: addPlaceholder.trim() || null,
      help_text: addHelp.trim() || null,
      is_required: addRequired,
      options: opts,
      default_value: null,
      position: fields.length,
      validations: {},
      assignee_id: addAssignee || null,
    });

    setAddType("text");
    setAddLabel("");
    setAddKey("");
    setAddPlaceholder("");
    setAddHelp("");
    setAddRequired(false);
    setAddOptions("");
    setAddRequiredItems([]);
    setAddAssignee("");
    setShowAdd(false);
    setSaving(false);
  }

  async function handleDelete(fieldId: string) {
    if (!confirm("Tem certeza que deseja remover este campo?")) return;
    setDeleting(fieldId);
    await onDelete(fieldId);
    setDeleting(null);
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const reordered = [...fields];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((f, i) => ({ ...f, position: i }));
    await onSave(withPositions);
  }

  const needsOptions = addType === "select" || addType === "multiselect" || addType === "checklist";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Campos da fase: <span className="text-primary">{phaseName}</span>
        </h3>
        <span className="text-xs text-muted-foreground">{fields.length} campo{fields.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Field list */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="fields">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
              {fields.map((field, index) => {
                const Icon = getFieldIcon(field.field_type);
                return (
                  <Draggable key={field.id} draggableId={field.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={cn(
                          "bg-card border border-border rounded-lg transition-all",
                          snapshot.isDragging && "shadow-lg ring-2 ring-primary/30"
                        )}
                      >
                        {editingId === field.id ? (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="flex-1 px-2 py-1 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder="Label do campo"
                                autoFocus
                              />
                              <button onClick={() => saveEdit(field)} disabled={saving} className="p-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 rounded-md hover:bg-accent cursor-pointer">
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </div>
                            <input
                              value={editPlaceholder}
                              onChange={(e) => setEditPlaceholder(e.target.value)}
                              placeholder="Placeholder (opcional)"
                              className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <input
                              value={editHelp}
                              onChange={(e) => setEditHelp(e.target.value)}
                              placeholder="Texto de ajuda (opcional)"
                              className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {(field.field_type === "select" || field.field_type === "multiselect") && (
                              <textarea
                                value={editOptions}
                                onChange={(e) => setEditOptions(e.target.value)}
                                placeholder="Opções (uma por linha)"
                                rows={3}
                                className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                              />
                            )}
                            {field.field_type === "checklist" && (
                              <ChecklistOptionsEditor
                                options={editOptions}
                                requiredItems={editRequiredItems}
                                onChange={setEditOptions}
                                onRequiredChange={setEditRequiredItems}
                              />
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                              <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} className="accent-primary" />
                              Obrigatório
                            </label>
                            {members.length > 0 && (
                              <div>
                                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Responsável pelo campo (opcional)</label>
                                <select
                                  value={editAssignee}
                                  onChange={(e) => setEditAssignee(e.target.value)}
                                  className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                                >
                                  <option value="">Usar responsável da fase</option>
                                  {members.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-foreground truncate">{field.label}</span>
                                {field.is_required && <span className="text-destructive text-xs">*</span>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">{getFieldLabel(field.field_type)}</span>
                                {field.assignee_id && (() => {
                                  const m = members.find((m) => m.user_id === field.assignee_id);
                                  return m ? (
                                    <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                      {m.full_name || m.email}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                            <button onClick={() => startEdit(field)} className="p-1 rounded-md hover:bg-accent transition-colors cursor-pointer">
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(field.id)}
                              disabled={deleting === field.id}
                              className="p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                            >
                              {deleting === field.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {fields.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum campo configurado para esta fase.</p>
      )}

      {/* Add form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">Tipo do campo</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {FIELD_TYPES.map((ft) => {
                const Icon = ft.icon;
                return (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => setAddType(ft.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                      addType === ft.value
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{ft.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Label</label>
            <input
              value={addLabel}
              onChange={(e) => {
                setAddLabel(e.target.value);
                if (!addKey) setAddKey(generateKey(e.target.value));
              }}
              placeholder="Ex: Nome do colaborador"
              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              autoFocus
            />
          </div>

          {/* Placeholder + Help */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Placeholder</label>
              <input
                value={addPlaceholder}
                onChange={(e) => setAddPlaceholder(e.target.value)}
                placeholder="Opcional"
                className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Texto de ajuda</label>
              <input
                value={addHelp}
                onChange={(e) => setAddHelp(e.target.value)}
                placeholder="Opcional"
                className="w-full px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Options for select/multiselect */}
          {needsOptions && addType !== "checklist" && (
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Opções (uma por linha)</label>
              <textarea
                value={addOptions}
                onChange={(e) => setAddOptions(e.target.value)}
                placeholder={"Opção 1\nOpção 2\nOpção 3"}
                rows={4}
                className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              />
            </div>
          )}
          {addType === "checklist" && (
            <ChecklistOptionsEditor
              options={addOptions}
              requiredItems={addRequiredItems}
              onChange={setAddOptions}
              onRequiredChange={setAddRequiredItems}
            />
          )}

          {/* Assignee */}
          {members.length > 0 && (
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Responsável pelo campo (opcional)</label>
              <select
                value={addAssignee}
                onChange={(e) => setAddAssignee(e.target.value)}
                className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                <option value="">Usar responsável da fase</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-0.5">Se definido, cria uma tarefa separada no Board para essa pessoa</p>
            </div>
          )}

          {/* Required checkbox */}
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={addRequired}
              onChange={(e) => setAddRequired(e.target.checked)}
              className="accent-primary w-4 h-4 cursor-pointer"
            />
            Campo obrigatório
          </label>

          {/* Buttons */}
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
              disabled={saving || !addLabel.trim()}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Adicionar campo
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar campo
        </button>
      )}
    </div>
  );
}

/* ─── Checklist Options Editor (with per-item required toggle) ─── */
function ChecklistOptionsEditor({
  options,
  requiredItems,
  onChange,
  onRequiredChange,
}: {
  options: string;
  requiredItems: string[];
  onChange: (val: string) => void;
  onRequiredChange: (val: string[]) => void;
}) {
  const lines = options.split("\n").map((l) => l.trim()).filter(Boolean);

  function toggleRequired(label: string) {
    onRequiredChange(
      requiredItems.includes(label)
        ? requiredItems.filter((r) => r !== label)
        : [...requiredItems, label]
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-foreground mb-1 block">Itens do checklist (um por linha)</label>
      <textarea
        value={options}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Item 1\nItem 2\nItem 3"}
        rows={4}
        className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
      />
      {lines.length > 0 && (
        <div className="space-y-1 bg-muted/50 rounded-lg p-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Marcar como obrigatório:</p>
          {lines.map((line) => (
            <label key={line} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={requiredItems.includes(line)}
                onChange={() => toggleRequired(line)}
                className="accent-destructive w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs text-foreground">{line}</span>
              {requiredItems.includes(line) && (
                <span className="text-[9px] text-destructive font-medium">obrigatório</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
