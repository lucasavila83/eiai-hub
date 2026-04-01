"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Users, Settings, UserPlus, Trash2, Globe, Lock, UsersRound, Crown, Plus, Pencil, GripVertical, LayoutGrid } from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

export interface BoardCustomField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "currency";
  options?: string[];
  is_required?: boolean;
}

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Valor (R$)" },
  { value: "date", label: "Data" },
  { value: "select", label: "Seleção" },
  { value: "checkbox", label: "Checkbox" },
] as const;

interface Props {
  board: { id: string; name: string; org_id: string; description?: string; visibility?: string; hub_user_id?: string | null; settings?: any };
  currentUserId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

interface MemberRow {
  user_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  };
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Membro",
  viewer: "Visualizador",
};

export function BoardSettingsModal({
  board,
  currentUserId,
  onClose,
  onUpdated,
}: Props) {
  const supabase = createClient();

  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description || "");
  const [visibility, setVisibility] = useState(board.visibility || "team");
  const [hubUserId, setHubUserId] = useState<string | null>(board.hub_user_id || null);
  const [boardMembers, setBoardMembers] = useState<MemberRow[]>([]);
  const [orgMembers, setOrgMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "fields">("general");

  // Custom fields
  const [customFields, setCustomFields] = useState<BoardCustomField[]>(
    (board.settings as any)?.custom_fields || []
  );
  const [showAddField, setShowAddField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<BoardCustomField["type"]>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [savingFields, setSavingFields] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [boardMembersRes, orgMembersRes] = await Promise.all([
      supabase
        .from("board_members")
        .select(
          "user_id, role, profiles:user_id(id, full_name, avatar_url, email)"
        )
        .eq("board_id", board.id),
      supabase
        .from("org_members")
        .select(
          "user_id, role, profiles:user_id(id, full_name, avatar_url, email)"
        )
        .eq("org_id", board.org_id),
    ]);

    if (boardMembersRes.data) {
      setBoardMembers(boardMembersRes.data as unknown as MemberRow[]);
    }
    if (orgMembersRes.data) {
      setOrgMembers(orgMembersRes.data as unknown as MemberRow[]);
    }
    setLoading(false);
  }

  const availableToAdd = orgMembers.filter(
    (om) => !boardMembers.some((bm) => bm.user_id === om.user_id)
  );

  async function saveBoardInfo() {
    setSaving(true);
    setSaveSuccess(false);
    const { error } = await supabase
      .from("boards")
      .update({ name: name.trim(), description: description.trim() || null, visibility, hub_user_id: hubUserId } as any)
      .eq("id", board.id);
    setSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      onUpdated?.();
    }
  }

  async function addMember(userId: string) {
    setActionLoading(userId);
    const { error } = await supabase.from("board_members").insert({
      board_id: board.id,
      user_id: userId,
      role: "member",
    });
    if (!error) {
      await loadData();
    }
    setActionLoading(null);
    setShowAddDropdown(false);
  }

  async function removeMember(userId: string) {
    setActionLoading(userId);
    const { error } = await supabase
      .from("board_members")
      .delete()
      .eq("board_id", board.id)
      .eq("user_id", userId);
    if (!error) {
      setBoardMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
    setActionLoading(null);
    onUpdated?.();
  }

  async function updateRole(userId: string, role: string) {
    setActionLoading(userId);
    const { error } = await supabase
      .from("board_members")
      .update({ role })
      .eq("board_id", board.id)
      .eq("user_id", userId);
    if (!error) {
      setBoardMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role } : m))
      );
    }
    setActionLoading(null);
    onUpdated?.();
  }

  function resetFieldForm() {
    setFieldLabel("");
    setFieldType("text");
    setFieldOptions("");
    setFieldRequired(false);
    setEditingFieldId(null);
    setShowAddField(false);
  }

  function openAddField() {
    resetFieldForm();
    setShowAddField(true);
  }

  function openEditField(field: BoardCustomField) {
    setEditingFieldId(field.id);
    setFieldLabel(field.label);
    setFieldType(field.type);
    setFieldOptions(field.options?.join(", ") || "");
    setFieldRequired(field.is_required || false);
    setShowAddField(true);
  }

  async function saveField() {
    if (!fieldLabel.trim()) return;
    setSavingFields(true);

    let updated: BoardCustomField[];
    const opts = fieldType === "select" ? fieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;

    if (editingFieldId) {
      updated = customFields.map((f) =>
        f.id === editingFieldId
          ? { ...f, label: fieldLabel.trim(), type: fieldType, options: opts, is_required: fieldRequired }
          : f
      );
    } else {
      const newField: BoardCustomField = {
        id: crypto.randomUUID(),
        label: fieldLabel.trim(),
        type: fieldType,
        options: opts,
        is_required: fieldRequired,
      };
      updated = [...customFields, newField];
    }

    const currentSettings = (board.settings as any) || {};
    await supabase
      .from("boards")
      .update({ settings: { ...currentSettings, custom_fields: updated } } as any)
      .eq("id", board.id);

    setCustomFields(updated);
    resetFieldForm();
    setSavingFields(false);
    onUpdated?.();
  }

  async function deleteField(fieldId: string) {
    if (!confirm("Remover este campo? Os valores existentes nos cards serão mantidos.")) return;
    const updated = customFields.filter((f) => f.id !== fieldId);
    const currentSettings = (board.settings as any) || {};
    await supabase
      .from("boards")
      .update({ settings: { ...currentSettings, custom_fields: updated } } as any)
      .eq("id", board.id);
    setCustomFields(updated);
    onUpdated?.();
  }

  function getMemberName(m: MemberRow): string {
    return m.profiles?.full_name || m.profiles?.email || "?";
  }

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative bg-card border border-border rounded-xl p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Configurações do Board
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 mb-5">
          <button
            onClick={() => setActiveTab("general")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
              activeTab === "general" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Geral
          </button>
          <button
            onClick={() => setActiveTab("fields")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
              activeTab === "fields" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Campos ({customFields.length})
          </button>
        </div>

        {/* ─── Fields Tab ─── */}
        {activeTab === "fields" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Campos personalizados</p>
                <p className="text-xs text-muted-foreground">Adicione campos extras aos cards deste board</p>
              </div>
              <button
                onClick={openAddField}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo campo
              </button>
            </div>

            {/* Field list */}
            {customFields.length === 0 && !showAddField && (
              <div className="text-center py-8">
                <LayoutGrid className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">Nenhum campo personalizado</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em "Novo campo" para começar</p>
              </div>
            )}

            {customFields.map((field) => (
              <div key={field.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/50 rounded-lg group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{field.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type}
                    {field.is_required && <span className="text-red-400 ml-1">*</span>}
                    {field.options?.length ? ` · ${field.options.length} opções` : ""}
                  </p>
                </div>
                <button
                  onClick={() => openEditField(field)}
                  className="p-1 rounded hover:bg-accent transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  onClick={() => deleteField(field.id)}
                  className="p-1 rounded hover:bg-destructive/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}

            {/* Add/Edit field form */}
            {showAddField && (
              <div className="bg-card border border-dashed border-primary/30 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {editingFieldId ? "Editar campo" : "Novo campo"}
                </p>
                <input
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="Nome do campo"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
                    <select
                      value={fieldType}
                      onChange={(e) => setFieldType(e.target.value as BoardCustomField["type"])}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm cursor-pointer"
                    >
                      {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={fieldRequired}
                        onChange={(e) => setFieldRequired(e.target.checked)}
                        className="accent-primary w-4 h-4"
                      />
                      <span className="text-xs text-muted-foreground">Obrigatório</span>
                    </label>
                  </div>
                </div>
                {fieldType === "select" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Opções (separadas por vírgula)</label>
                    <input
                      value={fieldOptions}
                      onChange={(e) => setFieldOptions(e.target.value)}
                      placeholder="Opção 1, Opção 2, Opção 3"
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={resetFieldForm} className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted rounded-lg hover:bg-accent cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    onClick={saveField}
                    disabled={savingFields || !fieldLabel.trim()}
                    className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                  >
                    {savingFields && <Loader2 className="w-3 h-3 animate-spin" />}
                    {editingFieldId ? "Salvar" : "Adicionar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── General Tab ─── */}
        {activeTab === "general" && (
        <div className="space-y-5">
          {/* Board Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Nome do board
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do board"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional do board"
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Visibilidade
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "public", label: "Público", icon: Globe, desc: "Todos da org" },
                { value: "team", label: "Time", icon: UsersRound, desc: "Membros do time" },
                { value: "private", label: "Privado", icon: Lock, desc: "Só membros do board" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all",
                    visibility === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                  <span className="text-[10px] font-normal opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Hub Board */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-yellow-500" />
              Board Hub (centraliza tarefas)
            </label>
            <p className="text-[11px] text-muted-foreground">
              Tarefas atribuidas ao responsavel do Hub em outros boards serao espelhadas automaticamente aqui.
            </p>
            <select
              value={hubUserId || ""}
              onChange={(e) => setHubUserId(e.target.value || null)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Desativado</option>
              {orgMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || m.profiles?.email || m.user_id}
                </option>
              ))}
            </select>
          </div>

          {/* Save board info */}
          <button
            onClick={saveBoardInfo}
            disabled={saving || !name.trim()}
            className={cn(
              "w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors",
              saveSuccess
                ? "bg-green-600 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saveSuccess ? "Salvo!" : "Salvar"}
          </button>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" />
                Membros do board
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowAddDropdown(!showAddDropdown)}
                  disabled={availableToAdd.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Adicionar membro
                </button>

                {/* Add member dropdown */}
                {showAddDropdown && availableToAdd.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                    {availableToAdd.map((m) => {
                      const memberName = getMemberName(m);
                      const isAdding = actionLoading === m.user_id;
                      return (
                        <button
                          key={m.user_id}
                          onClick={() => addMember(m.user_id)}
                          disabled={isAdding}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {isAdding ? (
                            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                              style={{
                                backgroundColor: generateColor(memberName),
                              }}
                            >
                              {getInitials(memberName)}
                            </div>
                          )}
                          <span className="truncate">{memberName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Members list */}
            <div className="space-y-1">
              {boardMembers.length === 0 && (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  Nenhum membro adicionado
                </p>
              )}
              {boardMembers.map((m) => {
                const memberName = getMemberName(m);
                const isLoading = actionLoading === m.user_id;
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 group"
                  >
                    {/* Avatar */}
                    {m.profiles?.avatar_url ? (
                      <img
                        src={m.profiles.avatar_url}
                        alt={memberName}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{
                          backgroundColor: generateColor(memberName),
                        }}
                      >
                        {getInitials(memberName)}
                      </div>
                    )}

                    {/* Name & email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {memberName}
                        {m.user_id === currentUserId && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (você)
                          </span>
                        )}
                      </p>
                      {m.profiles?.full_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {m.profiles.email}
                        </p>
                      )}
                    </div>

                    {/* Role selector */}
                    <select
                      value={m.role}
                      onChange={(e) => updateRole(m.user_id, e.target.value)}
                      disabled={isLoading}
                      className="text-xs bg-background border border-input rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="admin">{ROLE_LABELS.admin}</option>
                      <option value="member">{ROLE_LABELS.member}</option>
                      <option value="viewer">{ROLE_LABELS.viewer}</option>
                    </select>

                    {/* Remove button */}
                    <button
                      onClick={() => removeMember(m.user_id)}
                      disabled={isLoading}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                      title="Remover membro"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
}
