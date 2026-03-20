"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Users,
  Pencil,
  Trash2,
  Crown,
  User,
  UserPlus,
  UserMinus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

const TEAM_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#a855f7", "#14b8a6", "#f43f5e",
];

interface TeamWithMembers {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  members: TeamMember[];
}

interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "lead" | "member";
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    status: string;
  } | null;
}

interface OrgMemberProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  status: string;
}

export default function TeamsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();

  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Create team state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState(TEAM_COLORS[0]);
  const [creating, setCreating] = useState(false);

  // Edit team state
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Expanded teams (to show members)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Add member state
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrgId) {
      loadData();
    }
  }, [activeOrgId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // Load teams
      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .eq("org_id", activeOrgId!)
        .order("name");

      // Load team members with profiles
      const teamIds = teamsData?.map((t) => t.id) || [];
      let membersData: any[] = [];
      if (teamIds.length > 0) {
        const { data } = await supabase
          .from("team_members")
          .select("*, profile:user_id(id, full_name, email, avatar_url, status)")
          .in("team_id", teamIds);
        membersData = data || [];
      }

      // Combine
      const teamsWithMembers: TeamWithMembers[] = (teamsData || []).map((team) => ({
        ...team,
        members: membersData.filter((m) => m.team_id === team.id),
      }));
      setTeams(teamsWithMembers);

      // Load org members for adding to teams
      const { data: orgMembersData } = await supabase
        .from("org_members")
        .select("profiles:user_id(id, full_name, email, avatar_url, status)")
        .eq("org_id", activeOrgId!);

      const profiles = (orgMembersData || [])
        .map((om: any) => om.profiles)
        .filter(Boolean) as OrgMemberProfile[];
      setOrgMembers(profiles);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !activeOrgId || !currentUserId) return;

    setCreating(true);
    setError(null);

    try {
      const { data: team, error: insertError } = await supabase
        .from("teams")
        .insert({
          org_id: activeOrgId,
          name: newName.trim(),
          description: newDesc.trim() || null,
          color: newColor,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add creator as team lead
      if (team) {
        await supabase.from("team_members").insert({
          team_id: team.id,
          user_id: currentUserId,
          role: "lead",
        });
      }

      setNewName("");
      setNewDesc("");
      setNewColor(TEAM_COLORS[0]);
      setShowCreate(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao criar time.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(teamId: string) {
    if (!editName.trim()) return;
    setSavingEdit(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("teams")
        .update({
          name: editName.trim(),
          description: editDesc.trim() || null,
          color: editColor,
        })
        .eq("id", teamId);

      if (updateError) throw updateError;
      setEditingTeam(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar time.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteTeam(teamId: string, teamName: string) {
    if (!confirm(`Tem certeza que deseja deletar o time "${teamName}"? Todos os membros serão removidos.`)) return;

    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (deleteError) throw deleteError;
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao deletar time.");
    }
  }

  async function handleAddMember(teamId: string, userId: string) {
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, user_id: userId, role: "member" });

      if (insertError) throw insertError;
      setAddingMemberTo(null);
      setMemberSearch("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao adicionar membro.");
    }
  }

  async function handleRemoveMember(teamMemberId: string) {
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("team_members")
        .delete()
        .eq("id", teamMemberId);

      if (deleteError) throw deleteError;
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao remover membro.");
    }
  }

  async function handleToggleRole(teamMemberId: string, currentRole: "lead" | "member") {
    const newRole = currentRole === "lead" ? "member" : "lead";
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("team_members")
        .update({ role: newRole })
        .eq("id", teamMemberId);

      if (updateError) throw updateError;
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao alterar papel.");
    }
  }

  function toggleExpanded(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function startEdit(team: TeamWithMembers) {
    setEditingTeam(team.id);
    setEditName(team.name);
    setEditDesc(team.description || "");
    setEditColor(team.color);
  }

  function getAvailableMembers(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    const existingUserIds = new Set(team?.members.map((m) => m.user_id) || []);
    return orgMembers.filter((om) => {
      if (existingUserIds.has(om.id)) return false;
      if (!memberSearch.trim()) return true;
      const q = memberSearch.toLowerCase();
      return (
        om.full_name?.toLowerCase().includes(q) ||
        om.email.toLowerCase().includes(q)
      );
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Times</h1>
          <p className="text-sm text-muted-foreground">
            Organize seus membros em equipes
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Time
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Create Team Form */}
      {showCreate && (
        <div className="mb-6 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Criar novo time</h2>
            <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Nome do time *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Desenvolvimento, Marketing, Financeiro"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Descrição
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Breve descrição do time"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Cor
              </label>
              <div className="flex gap-2 flex-wrap">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      newColor === c ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : "hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar Time
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teams List */}
      {teams.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum time criado ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Crie seu primeiro time para organizar os membros
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const isExpanded = expandedTeams.has(team.id);
            const isEditing = editingTeam === team.id;
            const isAddingMember = addingMemberTo === team.id;
            const leads = team.members.filter((m) => m.role === "lead");
            const members = team.members.filter((m) => m.role === "member");

            return (
              <div
                key={team.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Team Header */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.name.slice(0, 2).toUpperCase()}
                  </div>

                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Descrição"
                        className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {TEAM_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={cn(
                              "w-5 h-5 rounded-full transition-all",
                              editColor === c ? "ring-2 ring-offset-1 ring-offset-background ring-primary scale-110" : ""
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(team.id)}
                          disabled={savingEdit || !editName.trim()}
                          className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingTeam(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => toggleExpanded(team.id)}
                    >
                      <p className="font-medium text-foreground truncate">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-muted-foreground truncate">{team.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {team.members.length} {team.members.length === 1 ? "membro" : "membros"}
                      </p>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Member avatars preview */}
                      <div className="flex -space-x-1.5 mr-2">
                        {team.members.slice(0, 4).map((m) => {
                          const name = m.profile?.full_name || m.profile?.email || "?";
                          return (
                            <div
                              key={m.id}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-card"
                              style={{ backgroundColor: generateColor(name) }}
                              title={name}
                            >
                              {m.profile?.avatar_url ? (
                                <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                getInitials(name)
                              )}
                            </div>
                          );
                        })}
                        {team.members.length > 4 && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium text-muted-foreground bg-muted border-2 border-card">
                            +{team.members.length - 4}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => startEdit(team)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
                        title="Deletar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleExpanded(team.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Members Section */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-background/50">
                    {/* Leads */}
                    {leads.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          Líderes ({leads.length})
                        </p>
                        <div className="space-y-1.5">
                          {leads.map((m) => (
                            <MemberRow
                              key={m.id}
                              member={m}
                              currentUserId={currentUserId}
                              onToggleRole={() => handleToggleRole(m.id, m.role)}
                              onRemove={() => handleRemoveMember(m.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Members */}
                    {members.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Membros ({members.length})
                        </p>
                        <div className="space-y-1.5">
                          {members.map((m) => (
                            <MemberRow
                              key={m.id}
                              member={m}
                              currentUserId={currentUserId}
                              onToggleRole={() => handleToggleRole(m.id, m.role)}
                              onRemove={() => handleRemoveMember(m.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {team.members.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Nenhum membro neste time
                      </p>
                    )}

                    {/* Add Member */}
                    {isAddingMember ? (
                      <div className="mt-3 border border-border rounded-lg p-3 bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-foreground">Adicionar membro</p>
                          <button
                            onClick={() => { setAddingMemberTo(null); setMemberSearch(""); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Buscar por nome ou email..."
                          className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
                          autoFocus
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {getAvailableMembers(team.id).length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              Nenhum membro disponível
                            </p>
                          ) : (
                            getAvailableMembers(team.id).map((om) => {
                              const name = om.full_name || om.email;
                              return (
                                <button
                                  key={om.id}
                                  onClick={() => handleAddMember(team.id, om.id)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors text-left"
                                >
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                    style={{ backgroundColor: generateColor(name) }}
                                  >
                                    {om.avatar_url ? (
                                      <img src={om.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      getInitials(name)
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm text-foreground truncate">{name}</p>
                                    {om.full_name && (
                                      <p className="text-xs text-muted-foreground truncate">{om.email}</p>
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingMemberTo(team.id)}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Adicionar membro
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-component for member rows
function MemberRow({
  member,
  currentUserId,
  onToggleRole,
  onRemove,
}: {
  member: TeamMember;
  currentUserId: string | null;
  onToggleRole: () => void;
  onRemove: () => void;
}) {
  const name = member.profile?.full_name || member.profile?.email || "?";
  const isOnline = member.profile?.status === "online";

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="relative shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: generateColor(name) }}
        >
          {member.profile?.avatar_url ? (
            <img src={member.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(name)
          )}
        </div>
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card",
            isOnline ? "bg-green-500" : "bg-gray-400"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{name}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {member.role === "lead" && (
          <span className="text-xs bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded font-medium">
            Líder
          </span>
        )}
        <button
          onClick={onToggleRole}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
          title={member.role === "lead" ? "Tornar membro" : "Tornar líder"}
        >
          <Crown className="w-3 h-3" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-accent"
          title="Remover do time"
        >
          <UserMinus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
