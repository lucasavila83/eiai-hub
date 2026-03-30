"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Users, Settings, UserPlus, Trash2, Globe, Lock, UsersRound, Crown } from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

interface Props {
  board: { id: string; name: string; org_id: string; description?: string; visibility?: string; hub_user_id?: string | null };
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
      </div>
    </div>,
    document.body
  );
}
