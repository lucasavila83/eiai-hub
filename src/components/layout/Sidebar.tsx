"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare, Kanban, Bell, Settings,
  Hash, Lock, ChevronDown, Plus, LogOut,
  X, Loader2, Users, MessageCircle, Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";
import { useChatStore } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import type { Profile, Organization, Channel } from "@/lib/types/database";

interface SidebarProps {
  profile: Profile | null;
  organizations: Organization[];
}

export function Sidebar({ profile, organizations }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { channels, setChannels, unreadCounts, setUnreadCount } = useChatStore();
  const { sidebarOpen, setActiveOrgId } = useUIStore();
  const [activeOrg, setActiveOrg] = useState<Organization | null>(
    organizations[0] || null
  );
  const [dmChannels, setDmChannels] = useState<(Channel & { otherUser?: any })[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateDM, setShowCreateDM] = useState(false);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);

  useEffect(() => {
    if (activeOrg) {
      setActiveOrgId(activeOrg.id);
      loadChannels(activeOrg.id);
      loadDMs(activeOrg.id);
      loadOrgMembers(activeOrg.id);
    }
  }, [activeOrg]);

  // Load unread counts
  const loadUnreadCounts = useCallback(async () => {
    if (!profile) return;
    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", profile.id);

    if (!memberships) return;
    for (const m of memberships) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", m.channel_id)
        .gt("created_at", m.last_read_at)
        .neq("user_id", profile.id);
      setUnreadCount(m.channel_id, count || 0);
    }
  }, [profile]);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Subscribe to new messages for unread badges
  useEffect(() => {
    if (!activeOrg || !profile) return;
    const sub = supabase
      .channel("unread-tracker")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, (payload: any) => {
        const msg = payload.new;
        if (msg.user_id !== profile.id) {
          // If not viewing this channel, increment unread
          if (!pathname.includes(msg.channel_id)) {
            setUnreadCount(
              msg.channel_id,
              (unreadCounts[msg.channel_id] || 0) + 1
            );
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [activeOrg, profile, pathname]);

  async function loadChannels(orgId: string) {
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_archived", false)
      .in("type", ["public", "private"])
      .order("name");
    if (data) setChannels(data);
  }

  async function loadDMs(orgId: string) {
    const { data } = await supabase
      .from("channels")
      .select("*, channel_members(user_id, profiles:user_id(id, full_name, avatar_url, email, status))")
      .eq("org_id", orgId)
      .eq("type", "dm")
      .eq("is_archived", false);

    if (data && profile) {
      const enriched = data.map((ch: any) => {
        const otherMember = ch.channel_members?.find(
          (m: any) => m.user_id !== profile.id
        );
        return {
          ...ch,
          otherUser: otherMember?.profiles || null,
        };
      });
      setDmChannels(enriched);
    }
  }

  async function loadOrgMembers(orgId: string) {
    const { data } = await supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email, status)")
      .eq("org_id", orgId);
    if (data) setOrgMembers(data);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const navItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat" },
    { href: "/boards", icon: Kanban, label: "Boards" },
    { href: "/notifications", icon: Bell, label: "Notificações" },
    { href: "/settings", icon: Settings, label: "Configurações" },
  ];

  return (
    <div className="flex h-full shrink-0">
      {/* Narrow icon strip - always visible */}
      <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-3 shrink-0">
        {/* Lesco Logo */}
        <div className="mb-4">
          <Image
            src="/lesco-logo.svg"
            alt="Lesco"
            width={32}
            height={32}
            className="w-8 h-8"
          />
        </div>

        {/* Nav Icons */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors group",
                pathname.startsWith(href)
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              )}
              title={label}
            >
              <Icon className="w-5 h-5" />
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                {label}
              </span>
            </Link>
          ))}
        </nav>

        {/* User Avatar at bottom */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors group relative"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
              Sair
            </span>
          </button>
          <div className="relative">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-default"
              style={{ backgroundColor: generateColor(profile?.full_name || profile?.email || "U") }}
              title={profile?.full_name || profile?.email || "Usuário"}
            >
              {getInitials(profile?.full_name || profile?.email || "U")}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
          </div>
        </div>
      </div>

      {/* Content panel - only visible when sidebarOpen */}
      {sidebarOpen && (
        <div className="w-52 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
          {/* Org Switcher */}
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: generateColor(activeOrg?.name || "X") }}
              >
                {getInitials(activeOrg?.name || "?")}
              </div>
              <span className="flex-1 text-sm font-semibold text-gray-900 truncate">
                {activeOrg?.name || "Selecione org"}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Channels + DMs */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* Canais section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Canais
                </span>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="hover:text-gray-700 text-gray-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-0.5">
                {channels.map((channel) => {
                  const isActive = pathname === `/chat/${channel.id}`;
                  const unread = unreadCounts[channel.id] || 0;
                  return (
                    <Link
                      key={channel.id}
                      href={`/chat/${channel.id}`}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : unread > 0
                          ? "text-gray-900 font-semibold hover:bg-gray-100"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      )}
                    >
                      {channel.type === "private" ? (
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Hash className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="flex-1 truncate">{channel.name}</span>
                      {unread > 0 && !isActive && (
                        <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Mensagens Diretas section */}
            <div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Mensagens diretas
                </span>
                <button
                  onClick={() => setShowCreateDM(true)}
                  className="hover:text-gray-700 text-gray-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-0.5">
                {dmChannels.map((dm) => {
                  const isActive = pathname === `/chat/${dm.id}`;
                  const unread = unreadCounts[dm.id] || 0;
                  const user = dm.otherUser;
                  const name = user?.full_name || user?.email || "Usuário";
                  const isOnline = user?.status === "online";
                  return (
                    <Link
                      key={dm.id}
                      href={`/chat/${dm.id}`}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : unread > 0
                          ? "text-gray-900 font-semibold hover:bg-gray-100"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      )}
                    >
                      <div className="relative shrink-0">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ backgroundColor: generateColor(name) }}
                          >
                            {getInitials(name)}
                          </div>
                        )}
                        <div
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-50",
                            isOnline ? "bg-green-500" : "bg-gray-400"
                          )}
                        />
                      </div>
                      <span className="flex-1 truncate">{name}</span>
                      {unread > 0 && !isActive && (
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-red-500" />
                          <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })}
                {dmChannels.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-1">
                    Nenhuma conversa ainda
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* User Footer */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: generateColor(profile?.full_name || profile?.email || "U") }}
                >
                  {getInitials(profile?.full_name || profile?.email || "U")}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-gray-50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {profile?.full_name || profile?.email}
                </p>
                <p className="text-xs text-gray-400">Online</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <CreateChannelModal
          orgId={activeOrg?.id || ""}
          orgMembers={orgMembers}
          currentUserId={profile?.id || ""}
          onClose={() => setShowCreateChannel(false)}
          onCreated={(ch) => {
            setChannels([...channels, ch]);
            setShowCreateChannel(false);
            router.push(`/chat/${ch.id}`);
          }}
        />
      )}

      {/* Create DM Modal */}
      {showCreateDM && (
        <CreateDMModal
          orgId={activeOrg?.id || ""}
          members={orgMembers}
          currentUserId={profile?.id || ""}
          existingDMs={dmChannels}
          onClose={() => setShowCreateDM(false)}
          onCreated={(ch) => {
            setShowCreateDM(false);
            router.push(`/chat/${ch.id}`);
            loadDMs(activeOrg?.id || "");
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Create Channel Modal
// ============================================================
function CreateChannelModal({
  orgId,
  orgMembers,
  currentUserId,
  onClose,
  onCreated,
}: {
  orgId: string;
  orgMembers: any[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set([currentUserId])
  );
  const supabase = createClient();

  function toggleMember(userId: string) {
    if (userId === currentUserId) return; // Creator is always selected
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function selectAll() {
    const allIds = orgMembers.map((m: any) => m.user_id);
    setSelectedMembers(new Set(allIds));
  }

  function deselectAll() {
    setSelectedMembers(new Set([currentUserId]));
  }

  const allSelected = orgMembers.length > 0 && orgMembers.every((m: any) => selectedMembers.has(m.user_id));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const user = (await supabase.auth.getUser()).data.user;
    const { data, error } = await supabase
      .from("channels")
      .insert({
        org_id: orgId,
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || null,
        type: isPrivate ? "private" : "public",
        created_by: user?.id ?? null,
        is_archived: false,
      })
      .select()
      .single();

    if (data && !error) {
      // Add all selected members as channel members
      const now = new Date().toISOString();
      const memberInserts = Array.from(selectedMembers).map((userId) => ({
        channel_id: data.id,
        user_id: userId,
        last_read_at: now,
        notifications: "all",
      }));

      if (memberInserts.length > 0) {
        await supabase.from("channel_members").insert(memberInserts);
      }

      onCreated(data);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Criar canal</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome do canal</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: marketing"
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Do que se trata este canal?"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-input"
            />
            <Lock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Canal privado</span>
          </label>

          {/* Member selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" />
                Membros
              </label>
              <button
                type="button"
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="border border-input rounded-lg max-h-48 overflow-y-auto">
              {orgMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhum membro encontrado
                </p>
              )}
              {orgMembers.map((m: any) => {
                const p = m.profiles;
                const memberName = p?.full_name || p?.email || "?";
                const isCreator = m.user_id === currentUserId;
                const isChecked = selectedMembers.has(m.user_id);
                return (
                  <label
                    key={m.user_id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer border-b border-input last:border-b-0",
                      isCreator && "opacity-70 cursor-default"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMember(m.user_id)}
                      disabled={isCreator}
                      className="rounded border-input shrink-0"
                    />
                    <div className="relative shrink-0">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt={memberName} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: generateColor(memberName) }}
                        >
                          {getInitials(memberName)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {memberName}
                        {isCreator && (
                          <span className="text-xs text-muted-foreground ml-1">(você)</span>
                        )}
                      </p>
                      {p?.email && (
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedMembers.size} membro{selectedMembers.size !== 1 ? "s" : ""} selecionado{selectedMembers.size !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar canal
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Create DM Modal
// ============================================================
function CreateDMModal({
  orgId,
  members,
  currentUserId,
  existingDMs,
  onClose,
  onCreated,
}: {
  orgId: string;
  members: any[];
  currentUserId: string;
  existingDMs: any[];
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const supabase = createClient();

  const otherMembers = members
    .filter((m: any) => m.user_id !== currentUserId)
    .filter((m: any) => {
      const name = m.profiles?.full_name || m.profiles?.email || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function startDM(targetUserId: string) {
    // Check if DM already exists
    const existing = existingDMs.find(
      (dm: any) => dm.otherUser?.id === targetUserId
    );
    if (existing) {
      onCreated(existing);
      return;
    }

    setLoading(true);
    const targetProfile = members.find((m: any) => m.user_id === targetUserId)?.profiles;
    const dmName = targetProfile?.full_name || targetProfile?.email || "DM";

    const { data: channel } = await supabase
      .from("channels")
      .insert({
        org_id: orgId,
        name: dmName,
        type: "dm",
        created_by: currentUserId,
        is_archived: false,
      })
      .select()
      .single();

    if (channel) {
      const now = new Date().toISOString();
      await supabase.from("channel_members").insert([
        { channel_id: channel.id, user_id: currentUserId, last_read_at: now, notifications: "all" },
        { channel_id: channel.id, user_id: targetUserId, last_read_at: now, notifications: "all" },
      ]);
      onCreated(channel);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Nova mensagem direta</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar membro..."
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-3"
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {otherMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {members.length <= 1 ? "Convide membros primeiro em Configurações" : "Nenhum membro encontrado"}
            </p>
          )}
          {otherMembers.map((m: any) => {
            const p = m.profiles;
            const name = p?.full_name || p?.email || "?";
            const isOnline = p?.status === "online";
            return (
              <button
                key={m.user_id}
                onClick={() => startDM(m.user_id)}
                disabled={loading}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-left transition-colors disabled:opacity-50"
              >
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
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
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
