"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  Users, Mail, Copy, Check, Loader2, Trash2,
  Crown, Shield, User, UserX, Link2, ArrowLeft,
  ChevronDown, MoreHorizontal, UserMinus, ShieldCheck,
  ShieldOff, UsersRound,
} from "lucide-react";
import { cn, getInitials, generateColor, formatDate } from "@/lib/utils/helpers";
import Link from "next/link";

const roleIcons: Record<string, any> = {
  owner: Crown,
  admin: Shield,
  member: User,
  guest: UserX,
};

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Membro",
  guest: "Convidado",
};

const roleColors: Record<string, string> = {
  owner: "text-yellow-500 bg-yellow-500/10",
  admin: "text-blue-500 bg-blue-500/10",
  member: "text-muted-foreground bg-muted",
  guest: "text-muted-foreground bg-muted",
};

export default function MembersPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [members, setMembers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Team assignment modal
  const [teamModalMember, setTeamModalMember] = useState<any | null>(null);

  // Derive current user role from members list (more reliable than separate query)
  const currentUserRole = members.find((m) => m.user_id === currentUserId)?.role || null;
  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin";

  useEffect(() => {
    if (activeOrgId) {
      loadMembers();
      loadInvitations();
      loadTeams();
    }
    // Load current user ID
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, [activeOrgId]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function handleClick() { setOpenMenuId(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenuId]);

  async function loadMembers() {
    const { data } = await supabase
      .from("org_members")
      .select("*, profiles:user_id(id, full_name, avatar_url, email, status)")
      .eq("org_id", activeOrgId!)
      .order("joined_at");
    if (data) setMembers(data);
  }

  async function loadInvitations() {
    const { data } = await supabase
      .from("invitations")
      .select("*")
      .eq("org_id", activeOrgId!)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (data) setInvitations(data);
  }

  async function loadTeams() {
    const { data } = await supabase
      .from("teams")
      .select("id, name, color")
      .eq("org_id", activeOrgId!);
    if (data) setTeams(data);

    const { data: tm } = await supabase
      .from("team_members")
      .select("id, team_id, user_id, role");
    if (tm) setTeamMembers(tm);
  }

  function getMemberTeams(userId: string) {
    const memberTeamIds = teamMembers
      .filter((tm) => tm.user_id === userId)
      .map((tm) => tm.team_id);
    return teams.filter((t) => memberTeamIds.includes(t.id));
  }

  function getTeamRole(userId: string, teamId: string) {
    return teamMembers.find((tm) => tm.user_id === userId && tm.team_id === teamId)?.role || "member";
  }

  async function getAuthHeaders() {
    const session = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session.data.session?.access_token) {
      headers["Authorization"] = `Bearer ${session.data.session.access_token}`;
    }
    return headers;
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !activeOrgId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setInviteUrl(null);

    const headers = await getAuthHeaders();
    const res = await fetch("/api/invite", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: email.trim(), orgId: activeOrgId, role }),
    });

    const json = await res.json();
    if (res.ok) {
      setInviteUrl(json.inviteUrl);
      setSuccess(json.message || `Convite criado para ${email}`);
      setEmail("");
      loadInvitations();
    } else {
      setError(json.error);
    }
    setLoading(false);
  }

  async function copyLink() {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function copyInviteLink(token: string, invId: string) {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedInviteId(invId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  async function resendInvite(invId: string) {
    setResendingId(invId);
    setError(null);
    setSuccess(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/invite/resend", {
      method: "POST",
      headers,
      body: JSON.stringify({ invitationId: invId }),
    });
    const json = await res.json();
    if (res.ok) setSuccess(json.message);
    else setError(json.error || "Erro ao reenviar convite");
    setResendingId(null);
  }

  async function deleteInvite(invId: string) {
    if (!confirm("Tem certeza que deseja remover este convite?")) return;
    setDeletingId(invId);
    setError(null);
    setSuccess(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/invite/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({ invitationId: invId }),
    });
    const json = await res.json();
    if (res.ok) {
      setSuccess(json.message);
      loadInvitations();
    } else {
      setError(json.error || "Erro ao remover convite");
    }
    setDeletingId(null);
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!confirm(`Tem certeza que deseja remover ${memberName} da organização?`)) return;
    setOpenMenuId(null);
    setError(null);
    setSuccess(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/members/remove", {
      method: "POST",
      headers,
      body: JSON.stringify({ memberId, orgId: activeOrgId }),
    });
    const json = await res.json();
    if (res.ok) {
      setSuccess(json.message);
      loadMembers();
    } else {
      setError(json.error);
    }
  }

  async function changeRole(memberId: string, newRole: string) {
    setOpenMenuId(null);
    setError(null);
    setSuccess(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/members/update-role", {
      method: "POST",
      headers,
      body: JSON.stringify({ memberId, orgId: activeOrgId, newRole }),
    });
    const json = await res.json();
    if (res.ok) {
      setSuccess(json.message);
      loadMembers();
    } else {
      setError(json.error);
    }
  }

  async function toggleTeamMembership(userId: string, teamId: string) {
    const existing = teamMembers.find((tm) => tm.user_id === userId && tm.team_id === teamId);
    if (existing) {
      await supabase.from("team_members").delete().eq("id", existing.id);
    } else {
      await supabase.from("team_members").insert({ team_id: teamId, user_id: userId, role: "member" });
    }
    loadTeams();
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Membros</h1>
          <p className="text-sm text-muted-foreground">Gerencie membros, convites e equipes</p>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Invite Form */}
      {isAdmin && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Convidar membro
          </h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Convidar
            </button>
          </form>

          {success && inviteUrl && (
            <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-sm text-foreground mb-2">{success}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background border border-input rounded-lg px-3 py-1.5 text-xs text-muted-foreground truncate font-mono">
                  {inviteUrl}
                </div>
                <button
                  onClick={copyLink}
                  className="shrink-0 flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Convites pendentes ({invitations.length})
          </h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabels[inv.role]} &middot; Expira em {formatDate(inv.expires_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => resendInvite(inv.id)}
                    disabled={resendingId === inv.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                    title="Reenviar email"
                  >
                    {resendingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    Reenviar
                  </button>
                  <button
                    onClick={() => copyInviteLink(inv.token, inv.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
                    title="Copiar link do convite"
                  >
                    {copiedInviteId === inv.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-green-500">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar link
                      </>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => deleteInvite(inv.id)}
                      disabled={deletingId === inv.id}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Remover convite"
                    >
                      {deletingId === inv.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-medium">
                    Pendente
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Membros ativos ({members.length})
      </h2>
      <div className="space-y-2">
        {members.map((m) => {
          const p = m.profiles;
          const name = p?.full_name || p?.email || "?";
          const RoleIcon = roleIcons[m.role] || User;
          const isOnline = p?.status === "online";
          const memberTeams = getMemberTeams(m.user_id);
          const isSelf = m.user_id === currentUserId;
          const isOwner = m.role === "owner";

          return (
            <div
              key={m.id}
              className="bg-card border border-border rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt={name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: generateColor(name) }}
                    >
                      {getInitials(name)}
                    </div>
                  )}
                  <div
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                      isOnline ? "bg-green-500" : "bg-gray-400"
                    )}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    {isSelf && (
                      <span className="text-xs text-muted-foreground">(Você)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p?.email}</p>
                </div>

                {/* Teams badges */}
                <div className="hidden sm:flex items-center gap-1 flex-wrap">
                  {memberTeams.map((t) => (
                    <span
                      key={t.id}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: (t.color || "#6366f1") + "20",
                        color: t.color || "#6366f1",
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>

                {/* Role badge */}
                <span className={cn(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium shrink-0",
                  roleColors[m.role]
                )}>
                  <RoleIcon className="w-3 h-3" />
                  {roleLabels[m.role]}
                </span>

                {/* Actions menu */}
                {isAdmin && !isSelf && !isOwner && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === m.id ? null : m.id);
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {openMenuId === m.id && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl py-1 w-52 animate-in fade-in zoom-in-95 duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Change role */}
                        {m.role === "member" && (
                          <button
                            onClick={() => changeRole(m.id, "admin")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4 text-blue-500" />
                            Promover a Admin
                          </button>
                        )}
                        {m.role === "admin" && (
                          <button
                            onClick={() => changeRole(m.id, "member")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            <ShieldOff className="w-4 h-4 text-muted-foreground" />
                            Rebaixar a Membro
                          </button>
                        )}

                        {/* Manage teams */}
                        {teams.length > 0 && (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              setTeamModalMember(m);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            <UsersRound className="w-4 h-4 text-primary" />
                            Gerenciar equipes
                          </button>
                        )}

                        <div className="border-t border-border my-1" />

                        {/* Remove */}
                        <button
                          onClick={() => removeMember(m.id, name)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                          Remover da organização
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Teams on mobile */}
              {memberTeams.length > 0 && (
                <div className="sm:hidden flex items-center gap-1 mt-2 flex-wrap">
                  {memberTeams.map((t) => (
                    <span
                      key={t.id}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: (t.color || "#6366f1") + "20",
                        color: t.color || "#6366f1",
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Team assignment modal */}
      {teamModalMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTeamModalMember(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground mb-1">Gerenciar equipes</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {teamModalMember.profiles?.full_name || teamModalMember.profiles?.email}
            </p>

            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma equipe criada. <Link href="/settings/teams" className="text-primary hover:underline">Criar equipe</Link>
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {teams.map((team) => {
                  const isMember = teamMembers.some(
                    (tm) => tm.user_id === teamModalMember.user_id && tm.team_id === team.id
                  );
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggleTeamMembership(teamModalMember.user_id, team.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left",
                        isMember
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: team.color || "#6366f1" }}
                      />
                      <span className="text-sm font-medium text-foreground flex-1">{team.name}</span>
                      {isMember && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setTeamModalMember(null)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
