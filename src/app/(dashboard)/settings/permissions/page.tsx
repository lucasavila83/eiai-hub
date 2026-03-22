"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Eye,
  Pencil,
  Users,
  Kanban,
  MessageSquare,
  Zap,
  Plug,
  BarChart3,
  Trash2,
  Tag,
  Calendar,
  PenLine,
  UserPlus,
  Loader2,
  CheckCircle,
  Info,
  User,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

type Visibility = "own" | "team" | "all";

interface OrgPermissions {
  member_board_visibility: Visibility;
  guest_board_visibility: Visibility;
  member_can_create_boards: boolean;
  member_can_create_channels: boolean;
  member_can_invite_members: boolean;
  member_can_manage_automations: boolean;
  member_can_manage_integrations: boolean;
  member_can_view_dashboard: boolean;
  member_can_delete_cards: boolean;
  member_can_manage_labels: boolean;
  member_can_edit_own_only: boolean;
  guest_can_create_cards: boolean;
  guest_can_comment: boolean;
  guest_can_view_calendar: boolean;
  guest_can_edit_own_only: boolean;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: "own", label: "Apenas seus cards", description: "Vê e edita somente as tarefas atribuídas a ele" },
  { value: "team", label: "Cards da sua equipe", description: "Vê tarefas da equipe em que está inserido, mas edita apenas os seus" },
  { value: "all", label: "Todos os cards da empresa", description: "Vê tarefas de todas as equipes, mas edita apenas os seus" },
];

const DEFAULT_PERMISSIONS: OrgPermissions = {
  member_board_visibility: "team",
  guest_board_visibility: "own",
  member_can_create_boards: true,
  member_can_create_channels: true,
  member_can_invite_members: false,
  member_can_manage_automations: false,
  member_can_manage_integrations: false,
  member_can_view_dashboard: true,
  member_can_delete_cards: true,
  member_can_manage_labels: true,
  member_can_edit_own_only: true,
  guest_can_create_cards: true,
  guest_can_comment: true,
  guest_can_view_calendar: true,
  guest_can_edit_own_only: true,
};

type PermTab = "role" | "user" | "team";

// Modules with VIEW and EDIT for user/team tabs
const PERM_MODULES = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3, description: "Métricas e relatórios" },
  { key: "automations", label: "Automações", icon: Zap, description: "Regras automáticas" },
  { key: "integrations", label: "Integrações", icon: Plug, description: "Conexões externas" },
  { key: "settings", label: "Configurações", icon: Shield, description: "Config. da organização" },
  { key: "boards", label: "Boards", icon: Kanban, description: "Quadros e tarefas" },
  { key: "calendar", label: "Calendário", icon: Calendar, description: "Agenda e eventos" },
  { key: "chat", label: "Chat", icon: MessageSquare, description: "Mensagens e canais" },
] as const;

// Additional action permissions for user/team
const ACTION_MODULES = [
  { key: "can_invite_members", label: "Convidar membros", icon: UserPlus },
  { key: "can_delete_cards", label: "Excluir cards", icon: Trash2 },
  { key: "can_manage_labels", label: "Gerenciar labels", icon: Tag },
] as const;

// Tri-state values: null=inherit, true=allowed, false=blocked
type TriState = boolean | null;

interface UserPermRow {
  id?: string;
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  perms: Record<string, TriState>; // key_view, key_edit, action keys
}

interface TeamPermRow {
  id?: string;
  team_id: string;
  team_name: string;
  team_color: string;
  perms: Record<string, TriState>;
}

// DB column mapping
function moduleToDbKeys(modKey: string): { view: string; edit: string } {
  const map: Record<string, { view: string; edit: string }> = {
    dashboard: { view: "can_view_dashboard_view", edit: "can_view_dashboard_edit" },
    automations: { view: "can_manage_automations_view", edit: "can_manage_automations_edit" },
    integrations: { view: "can_manage_integrations_view", edit: "can_manage_integrations_edit" },
    settings: { view: "can_access_settings_view", edit: "can_access_settings_edit" },
    boards: { view: "can_view_boards_view", edit: "can_view_boards_edit" },
    calendar: { view: "can_view_calendar_view", edit: "can_view_calendar_edit" },
    chat: { view: "can_view_chat_view", edit: "can_view_chat_edit" },
  };
  return map[modKey];
}

function getAllPermKeys(): string[] {
  const keys: string[] = [];
  for (const mod of PERM_MODULES) {
    const db = moduleToDbKeys(mod.key);
    keys.push(db.view, db.edit);
  }
  for (const act of ACTION_MODULES) {
    keys.push(act.key);
  }
  return keys;
}

export default function PermissionsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [permissions, setPermissions] = useState<OrgPermissions>(DEFAULT_PERMISSIONS);
  const [activeTab, setActiveTab] = useState<PermTab>("role");
  const [userPerms, setUserPerms] = useState<UserPermRow[]>([]);
  const [teamPerms, setTeamPerms] = useState<TeamPermRow[]>([]);
  const [savingUser, setSavingUser] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);

  useEffect(() => {
    if (activeOrgId) {
      loadPermissions();
      loadUserPermissions();
      loadTeamPermissions();
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  async function loadPermissions() {
    setLoading(true);
    const { data } = await supabase
      .from("org_permissions")
      .select("*")
      .eq("org_id", activeOrgId!)
      .single();

    if (data) {
      setPermissions({
        member_board_visibility: data.member_board_visibility,
        guest_board_visibility: data.guest_board_visibility,
        member_can_create_boards: data.member_can_create_boards,
        member_can_create_channels: data.member_can_create_channels,
        member_can_invite_members: data.member_can_invite_members,
        member_can_manage_automations: data.member_can_manage_automations,
        member_can_manage_integrations: data.member_can_manage_integrations,
        member_can_view_dashboard: data.member_can_view_dashboard,
        member_can_delete_cards: data.member_can_delete_cards,
        member_can_manage_labels: data.member_can_manage_labels,
        member_can_edit_own_only: data.member_can_edit_own_only ?? true,
        guest_can_create_cards: data.guest_can_create_cards,
        guest_can_comment: data.guest_can_comment,
        guest_can_view_calendar: data.guest_can_view_calendar,
        guest_can_edit_own_only: data.guest_can_edit_own_only ?? true,
      });
    } else {
      await supabase.from("org_permissions").insert({ org_id: activeOrgId! });
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!activeOrgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("org_permissions")
      .update({ ...permissions, updated_at: new Date().toISOString() })
      .eq("org_id", activeOrgId);
    if (!error) setSuccess(true);
    setSaving(false);
  }

  async function loadUserPermissions() {
    if (!activeOrgId) return;
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, email, avatar_url)")
      .eq("org_id", activeOrgId)
      .in("role", ["member", "guest"]);

    const { data: existingPerms } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("org_id", activeOrgId);

    const permMap: Record<string, any> = {};
    (existingPerms || []).forEach((p: any) => { permMap[p.user_id] = p; });

    const allKeys = getAllPermKeys();
    const rows: UserPermRow[] = (members || []).map((m: any) => ({
      id: permMap[m.user_id]?.id,
      user_id: m.user_id,
      full_name: m.profiles?.full_name,
      email: m.profiles?.email,
      avatar_url: m.profiles?.avatar_url,
      perms: allKeys.reduce((acc, key) => {
        acc[key] = permMap[m.user_id]?.[key] ?? null;
        return acc;
      }, {} as Record<string, TriState>),
    }));
    setUserPerms(rows);
  }

  async function loadTeamPermissions() {
    if (!activeOrgId) return;
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, color")
      .eq("org_id", activeOrgId);

    const { data: existingPerms } = await supabase
      .from("team_permissions")
      .select("*")
      .eq("org_id", activeOrgId);

    const permMap: Record<string, any> = {};
    (existingPerms || []).forEach((p: any) => { permMap[p.team_id] = p; });

    const allKeys = getAllPermKeys();
    const rows: TeamPermRow[] = (teams || []).map((t: any) => ({
      id: permMap[t.id]?.id,
      team_id: t.id,
      team_name: t.name,
      team_color: t.color || "#6366f1",
      perms: allKeys.reduce((acc, key) => {
        acc[key] = permMap[t.id]?.[key] ?? null;
        return acc;
      }, {} as Record<string, TriState>),
    }));
    setTeamPerms(rows);
  }

  function togglePerm(
    setter: typeof setUserPerms | typeof setTeamPerms,
    id: string,
    idField: "user_id" | "team_id",
    key: string,
  ) {
    setter((prev: any[]) => prev.map((row: any) => {
      if (row[idField] !== id) return row;
      const current = row.perms[key];
      // Cycle: null -> true -> false -> null
      const next = current === null ? true : current === true ? false : null;
      return { ...row, perms: { ...row.perms, [key]: next } };
    }));
  }

  async function saveUserPermissions() {
    if (!activeOrgId) return;
    setSavingUser(true);
    for (const row of userPerms) {
      const hasAnyOverride = Object.values(row.perms).some((v) => v !== null);
      if (hasAnyOverride) {
        await supabase.from("user_permissions").upsert({
          org_id: activeOrgId,
          user_id: row.user_id,
          ...row.perms,
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,user_id" });
      } else if (row.id) {
        await supabase.from("user_permissions").delete().eq("id", row.id);
      }
    }
    setSavingUser(false);
    setSuccess(true);
  }

  async function saveTeamPermissions() {
    if (!activeOrgId) return;
    setSavingTeam(true);
    for (const row of teamPerms) {
      const hasAnyOverride = Object.values(row.perms).some((v) => v !== null);
      if (hasAnyOverride) {
        await supabase.from("team_permissions").upsert({
          org_id: activeOrgId,
          team_id: row.team_id,
          ...row.perms,
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,team_id" });
      } else if (row.id) {
        await supabase.from("team_permissions").delete().eq("id", row.id);
      }
    }
    setSavingTeam(false);
    setSuccess(true);
  }

  function toggleBool(key: keyof OrgPermissions) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setVisibility(key: "member_board_visibility" | "guest_board_visibility", val: Visibility) {
    setPermissions((prev) => ({ ...prev, [key]: val }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Permissões</h1>
          <p className="text-sm text-muted-foreground">
            Configure quem pode ver e editar cada módulo
          </p>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="mb-6 flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Permissões salvas com sucesso!
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-muted rounded-lg p-1">
        {([
          { key: "role" as PermTab, label: "Por Papel", icon: Shield },
          { key: "user" as PermTab, label: "Por Pessoa", icon: User },
          { key: "team" as PermTab, label: "Por Equipe", icon: Users },
        ]).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                activeTab === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Hierarchy info */}
      <div className="mb-6 flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
        <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Hierarquia:</strong> Pessoa &gt; Equipe &gt; Papel.
          Permissões individuais sobrepõem as da equipe, que sobrepõem as do papel.
          <span className="flex items-center gap-3 mt-1.5 text-xs">
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> = Visualizar</span>
            <span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> = Editar</span>
          </span>
        </div>
      </div>

      {/* ===== TAB: BY USER ===== */}
      {activeTab === "user" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 mb-4">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              Defina para cada pessoa se ela pode <Eye className="w-3 h-3 inline" /> <strong className="text-foreground">Visualizar</strong> e/ou <Pencil className="w-3 h-3 inline" /> <strong className="text-foreground">Editar</strong> cada módulo.
              <br />
              <strong className="text-green-500">✓</strong> = permitido &nbsp;
              <strong className="text-red-500">✗</strong> = bloqueado &nbsp;
              <strong className="text-muted-foreground">—</strong> = herda do papel/equipe
            </div>
          </div>

          {userPerms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum membro ou convidado na organização</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground sticky left-0 bg-background z-10">Pessoa</th>
                    {PERM_MODULES.map((mod) => {
                      const Icon = mod.icon;
                      return (
                        <th key={mod.key} colSpan={2} className="text-center py-2 px-1" title={mod.label}>
                          <div className="flex flex-col items-center gap-0.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-normal">{mod.label}</span>
                          </div>
                        </th>
                      );
                    })}
                    {ACTION_MODULES.map((act) => {
                      const Icon = act.icon;
                      return (
                        <th key={act.key} className="text-center py-2 px-1" title={act.label}>
                          <div className="flex flex-col items-center gap-0.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-normal truncate max-w-[50px]">{act.label}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                  {/* Sub-header for view/edit */}
                  <tr className="border-b border-border/50">
                    <th className="sticky left-0 bg-background z-10"></th>
                    {PERM_MODULES.map((mod) => (
                      <>
                        <th key={`${mod.key}_v`} className="text-center py-1 px-0.5">
                          <span className="text-[8px] text-blue-400 font-medium flex items-center justify-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" /> Ver
                          </span>
                        </th>
                        <th key={`${mod.key}_e`} className="text-center py-1 px-0.5">
                          <span className="text-[8px] text-orange-400 font-medium flex items-center justify-center gap-0.5">
                            <Pencil className="w-2.5 h-2.5" /> Edit
                          </span>
                        </th>
                      </>
                    ))}
                    {ACTION_MODULES.map((act) => (
                      <th key={`${act.key}_h`} className="text-center py-1 px-0.5">
                        <span className="text-[8px] text-purple-400 font-medium">Ação</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userPerms.map((row) => (
                    <tr key={row.user_id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="py-2 px-3 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: generateColor(row.full_name || row.email) }}>
                            {getInitials(row.full_name || row.email)}
                          </div>
                          <span className="text-foreground text-xs truncate max-w-[120px]">{row.full_name || row.email}</span>
                        </div>
                      </td>
                      {PERM_MODULES.map((mod) => {
                        const db = moduleToDbKeys(mod.key);
                        const viewVal = row.perms[db.view];
                        const editVal = row.perms[db.edit];
                        return (
                          <>
                            <td key={`${mod.key}_v`} className="text-center py-2 px-0.5">
                              <TriStateButton
                                value={viewVal}
                                onClick={() => togglePerm(setUserPerms, row.user_id, "user_id", db.view)}
                                title={`${mod.label} - Visualizar: ${triLabel(viewVal)}`}
                              />
                            </td>
                            <td key={`${mod.key}_e`} className="text-center py-2 px-0.5">
                              <TriStateButton
                                value={editVal}
                                onClick={() => togglePerm(setUserPerms, row.user_id, "user_id", db.edit)}
                                title={`${mod.label} - Editar: ${triLabel(editVal)}`}
                              />
                            </td>
                          </>
                        );
                      })}
                      {ACTION_MODULES.map((act) => {
                        const val = row.perms[act.key];
                        return (
                          <td key={act.key} className="text-center py-2 px-0.5">
                            <TriStateButton
                              value={val}
                              onClick={() => togglePerm(setUserPerms, row.user_id, "user_id", act.key)}
                              title={`${act.label}: ${triLabel(val)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={saveUserPermissions}
              disabled={savingUser}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingUser && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar permissões individuais
            </button>
          </div>
        </div>
      )}

      {/* ===== TAB: BY TEAM ===== */}
      {activeTab === "team" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 mb-4">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              Defina para cada equipe se pode <Eye className="w-3 h-3 inline" /> <strong className="text-foreground">Visualizar</strong> e/ou <Pencil className="w-3 h-3 inline" /> <strong className="text-foreground">Editar</strong> cada módulo.
              Se um membro pertence a múltiplas equipes, a permissão mais permissiva prevalece.
            </div>
          </div>

          {teamPerms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma equipe criada. Crie equipes em <Link href="/settings/teams" className="text-primary hover:underline">Configurações &gt; Times</Link>.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground sticky left-0 bg-background z-10">Equipe</th>
                    {PERM_MODULES.map((mod) => {
                      const Icon = mod.icon;
                      return (
                        <th key={mod.key} colSpan={2} className="text-center py-2 px-1" title={mod.label}>
                          <div className="flex flex-col items-center gap-0.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-normal">{mod.label}</span>
                          </div>
                        </th>
                      );
                    })}
                    {ACTION_MODULES.map((act) => {
                      const Icon = act.icon;
                      return (
                        <th key={act.key} className="text-center py-2 px-1" title={act.label}>
                          <div className="flex flex-col items-center gap-0.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-normal truncate max-w-[50px]">{act.label}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border/50">
                    <th className="sticky left-0 bg-background z-10"></th>
                    {PERM_MODULES.map((mod) => (
                      <>
                        <th key={`${mod.key}_v`} className="text-center py-1 px-0.5">
                          <span className="text-[8px] text-blue-400 font-medium flex items-center justify-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" /> Ver
                          </span>
                        </th>
                        <th key={`${mod.key}_e`} className="text-center py-1 px-0.5">
                          <span className="text-[8px] text-orange-400 font-medium flex items-center justify-center gap-0.5">
                            <Pencil className="w-2.5 h-2.5" /> Edit
                          </span>
                        </th>
                      </>
                    ))}
                    {ACTION_MODULES.map((act) => (
                      <th key={`${act.key}_h`} className="text-center py-1 px-0.5">
                        <span className="text-[8px] text-purple-400 font-medium">Ação</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamPerms.map((row) => (
                    <tr key={row.team_id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="py-2 px-3 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.team_color }} />
                          <span className="text-foreground text-xs font-medium">{row.team_name}</span>
                        </div>
                      </td>
                      {PERM_MODULES.map((mod) => {
                        const db = moduleToDbKeys(mod.key);
                        const viewVal = row.perms[db.view];
                        const editVal = row.perms[db.edit];
                        return (
                          <>
                            <td key={`${mod.key}_v`} className="text-center py-2 px-0.5">
                              <TriStateButton
                                value={viewVal}
                                onClick={() => togglePerm(setTeamPerms, row.team_id, "team_id", db.view)}
                                title={`${mod.label} - Visualizar: ${triLabel(viewVal)}`}
                              />
                            </td>
                            <td key={`${mod.key}_e`} className="text-center py-2 px-0.5">
                              <TriStateButton
                                value={editVal}
                                onClick={() => togglePerm(setTeamPerms, row.team_id, "team_id", db.edit)}
                                title={`${mod.label} - Editar: ${triLabel(editVal)}`}
                              />
                            </td>
                          </>
                        );
                      })}
                      {ACTION_MODULES.map((act) => {
                        const val = row.perms[act.key];
                        return (
                          <td key={act.key} className="text-center py-2 px-0.5">
                            <TriStateButton
                              value={val}
                              onClick={() => togglePerm(setTeamPerms, row.team_id, "team_id", act.key)}
                              title={`${act.label}: ${triLabel(val)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={saveTeamPermissions}
              disabled={savingTeam}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingTeam && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar permissões de equipe
            </button>
          </div>
        </div>
      )}

      {/* ===== TAB: BY ROLE ===== */}
      {activeTab === "role" && <>

      {/* Info box */}
      <div className="mb-6 flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Owners e Admins</strong> sempre têm acesso total (ver + editar).
          Estas configurações se aplicam aos papéis <strong className="text-foreground">Membro</strong> e <strong className="text-foreground">Convidado</strong>.
        </div>
      </div>

      {/* ===== MEMBER PERMISSIONS ===== */}
      <div className="space-y-6">
        <SectionTitle icon={Users} label="Permissões de Membros" description="Visualiza dados da sua equipe, edita apenas os seus" />

        {/* Edit scope */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Pencil className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">Escopo de edição</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Define se membros podem editar apenas seus próprios itens ou de todos
          </p>
          <div className="grid gap-2">
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                permissions.member_can_edit_own_only
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              )}
            >
              <input
                type="radio"
                checked={permissions.member_can_edit_own_only}
                onChange={() => setPermissions((p) => ({ ...p, member_can_edit_own_only: true }))}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-blue-400" /> Vê dados da equipe, edita só o seu
                </p>
                <p className="text-xs text-muted-foreground">Pode visualizar tarefas, eventos e dados da equipe em que está inserido, mas só edita itens atribuídos a ele</p>
              </div>
            </label>
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                !permissions.member_can_edit_own_only
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              )}
            >
              <input
                type="radio"
                checked={!permissions.member_can_edit_own_only}
                onChange={() => setPermissions((p) => ({ ...p, member_can_edit_own_only: false }))}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5 text-orange-400" /> Vê e edita dados da equipe
                </p>
                <p className="text-xs text-muted-foreground">Pode visualizar e editar qualquer item da equipe em que está inserido</p>
              </div>
            </label>
          </div>
        </div>

        {/* Board Visibility */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Visibilidade de Boards</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Define o alcance de visualização: apenas seus cards, da equipe, ou de toda a empresa
          </p>
          <div className="grid gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                  permissions.member_board_visibility === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-foreground/20"
                )}
              >
                <input
                  type="radio"
                  name="member_visibility"
                  checked={permissions.member_board_visibility === opt.value}
                  onChange={() => setVisibility("member_board_visibility", opt.value)}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Member Action Toggles */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-1">
          <h3 className="text-sm font-semibold text-foreground mb-3">Ações permitidas</h3>
          <ToggleRow icon={Kanban} label="Criar boards" description="Criar novos boards e projetos" checked={permissions.member_can_create_boards} onChange={() => toggleBool("member_can_create_boards")} />
          <ToggleRow icon={MessageSquare} label="Criar canais" description="Criar novos canais de chat" checked={permissions.member_can_create_channels} onChange={() => toggleBool("member_can_create_channels")} />
          <ToggleRow icon={UserPlus} label="Convidar membros" description="Enviar convites para novos membros" checked={permissions.member_can_invite_members} onChange={() => toggleBool("member_can_invite_members")} />
          <ToggleRow icon={Zap} label="Gerenciar automações" description="Criar e editar automações" checked={permissions.member_can_manage_automations} onChange={() => toggleBool("member_can_manage_automations")} />
          <ToggleRow icon={Plug} label="Gerenciar integrações" description="Configurar integrações externas" checked={permissions.member_can_manage_integrations} onChange={() => toggleBool("member_can_manage_integrations")} />
          <ToggleRow icon={BarChart3} label="Ver dashboard" description="Acessar métricas e relatórios" checked={permissions.member_can_view_dashboard} onChange={() => toggleBool("member_can_view_dashboard")} />
          <ToggleRow icon={Trash2} label="Excluir tarefas" description="Arquivar ou excluir cards" checked={permissions.member_can_delete_cards} onChange={() => toggleBool("member_can_delete_cards")} />
          <ToggleRow icon={Tag} label="Gerenciar labels" description="Criar e editar labels dos boards" checked={permissions.member_can_manage_labels} onChange={() => toggleBool("member_can_manage_labels")} />
        </div>

        {/* ===== GUEST PERMISSIONS ===== */}
        <SectionTitle icon={Users} label="Permissões de Convidados" description="Acesso limitado, vê apenas o que foi atribuído a ele" />

        {/* Guest edit scope */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Pencil className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">Escopo de edição</h3>
          </div>
          <div className="grid gap-2">
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                permissions.guest_can_edit_own_only
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              )}
            >
              <input
                type="radio"
                checked={permissions.guest_can_edit_own_only}
                onChange={() => setPermissions((p) => ({ ...p, guest_can_edit_own_only: true }))}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Edita apenas seus itens</p>
                <p className="text-xs text-muted-foreground">Convidado só pode modificar tarefas e itens atribuídos diretamente a ele</p>
              </div>
            </label>
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                !permissions.guest_can_edit_own_only
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              )}
            >
              <input
                type="radio"
                checked={!permissions.guest_can_edit_own_only}
                onChange={() => setPermissions((p) => ({ ...p, guest_can_edit_own_only: false }))}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Edita itens visíveis</p>
                <p className="text-xs text-muted-foreground">Convidado pode editar qualquer item que consiga visualizar dentro do seu escopo</p>
              </div>
            </label>
          </div>
        </div>

        {/* Guest Visibility */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Visibilidade de Boards</h3>
          </div>
          <div className="grid gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                  permissions.guest_board_visibility === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-foreground/20"
                )}
              >
                <input
                  type="radio"
                  name="guest_visibility"
                  checked={permissions.guest_board_visibility === opt.value}
                  onChange={() => setVisibility("guest_board_visibility", opt.value)}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Guest Action Toggles */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-1">
          <h3 className="text-sm font-semibold text-foreground mb-3">Ações permitidas</h3>
          <ToggleRow icon={PenLine} label="Criar tarefas" description="Criar novos cards nos boards" checked={permissions.guest_can_create_cards} onChange={() => toggleBool("guest_can_create_cards")} />
          <ToggleRow icon={MessageSquare} label="Comentar" description="Adicionar comentários em cards" checked={permissions.guest_can_comment} onChange={() => toggleBool("guest_can_comment")} />
          <ToggleRow icon={Calendar} label="Ver calendário" description="Acessar a visualização de calendário" checked={permissions.guest_can_view_calendar} onChange={() => toggleBool("guest_can_view_calendar")} />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Voltar
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar permissões
        </button>
      </div>

      </>}
    </div>
  );
}

// ===== Helper Components =====

function triLabel(val: TriState): string {
  return val === true ? "Permitido" : val === false ? "Bloqueado" : "Padrão do papel";
}

function TriStateButton({ value, onClick, title }: { value: TriState; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-7 h-7 rounded-md text-xs font-bold transition-all cursor-pointer",
        value === true ? "bg-green-500/15 text-green-500 hover:bg-green-500/25 ring-1 ring-green-500/30" :
        value === false ? "bg-red-500/15 text-red-500 hover:bg-red-500/25 ring-1 ring-red-500/30" :
        "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      title={title}
    >
      {value === true ? "✓" : value === false ? "✗" : "—"}
    </button>
  );
}

function SectionTitle({ icon: Icon, label, description }: { icon: any; label: string; description: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{label}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, description, checked, onChange }: {
  icon: any; label: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => { e.preventDefault(); onChange(); }}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 cursor-pointer",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )} />
      </button>
    </label>
  );
}
