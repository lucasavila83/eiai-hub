"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  Users, Mail, Copy, Check, Loader2,
  Crown, Shield, User, UserX, Link2, ArrowLeft,
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

export default function MembersPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrgId) {
      loadMembers();
      loadInvitations();
    }
  }, [activeOrgId]);

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !activeOrgId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setInviteUrl(null);

    const session = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session.data.session?.access_token) {
      headers["Authorization"] = `Bearer ${session.data.session.access_token}`;
    }

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
          <p className="text-sm text-muted-foreground">Gerencie membros e convites</p>
        </div>
      </div>

      {/* Invite Form */}
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

        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}

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
            <p className="text-xs text-muted-foreground mt-1">
              Envie este link para o convidado. Expira em 7 dias.
            </p>
          </div>
        )}
      </div>

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
                className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-2"
              >
                <div>
                  <p className="text-sm text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabels[inv.role]} &middot; Expira em {formatDate(inv.expires_at)}
                  </p>
                </div>
                <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-medium">
                  Pendente
                </span>
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
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3"
            >
              <div className="relative shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: generateColor(name) }}
                >
                  {getInitials(name)}
                </div>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                    isOnline ? "bg-green-500" : "bg-gray-500"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">{p?.email}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <RoleIcon className="w-3.5 h-3.5" />
                {roleLabels[m.role]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
