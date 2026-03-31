"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuth } from "@/components/providers/AuthProvider";

export type OrgRole = "owner" | "admin" | "member" | "guest" | null;

export interface ModulePermission {
  view: boolean;
  edit: boolean;
}

export interface Permissions {
  role: OrgRole;
  isAdmin: boolean;
  // Module access (view/edit)
  dashboard: ModulePermission;
  automations: ModulePermission;
  integrations: ModulePermission;
  settings: ModulePermission;
  boards: ModulePermission;
  calendar: ModulePermission;
  chat: ModulePermission;
  processes: ModulePermission;
  budget_goals: ModulePermission;
  // Specific actions
  canInviteMembers: boolean;
  canCreateBoards: boolean;
  canCreateChannels: boolean;
  canDeleteCards: boolean;
  canManageLabels: boolean;
  canCreateCards: boolean;
  canComment: boolean;
  // Edit scope
  canEditOwnOnly: boolean; // true = edits only own items, false = can edit all
  // Board visibility
  boardVisibility: "own" | "team" | "all";
  // Loading
  loading: boolean;

  // Legacy compat helpers
  canViewDashboard: boolean;
  canViewDashboardAll: boolean;
  canManageAutomations: boolean;
  canManageIntegrations: boolean;
  canAccessSettings: boolean;
  canViewCalendar: boolean;
}

const MOD_ALL: ModulePermission = { view: true, edit: true };
const MOD_NONE: ModulePermission = { view: false, edit: false };
const MOD_VIEW: ModulePermission = { view: true, edit: false };

const DEFAULT_PERMISSIONS: Permissions = {
  role: null,
  isAdmin: false,
  dashboard: MOD_NONE,
  automations: MOD_NONE,
  integrations: MOD_NONE,
  settings: MOD_NONE,
  boards: MOD_VIEW,
  calendar: MOD_VIEW,
  chat: MOD_ALL,
  processes: MOD_NONE,
  budget_goals: MOD_NONE,
  canInviteMembers: false,
  canCreateBoards: false,
  canCreateChannels: false,
  canDeleteCards: false,
  canManageLabels: false,
  canCreateCards: true,
  canComment: true,
  canEditOwnOnly: true,
  boardVisibility: "own",
  loading: true,
  // Legacy compat
  canViewDashboard: false,
  canViewDashboardAll: false,
  canManageAutomations: false,
  canManageIntegrations: false,
  canAccessSettings: false,
  canViewCalendar: false,
};

const ADMIN_PERMISSIONS: Permissions = {
  role: "admin",
  isAdmin: true,
  dashboard: MOD_ALL,
  automations: MOD_ALL,
  integrations: MOD_ALL,
  settings: MOD_ALL,
  boards: MOD_ALL,
  calendar: MOD_ALL,
  chat: MOD_ALL,
  processes: MOD_ALL,
  budget_goals: MOD_ALL,
  canInviteMembers: true,
  canCreateBoards: true,
  canCreateChannels: true,
  canDeleteCards: true,
  canManageLabels: true,
  canCreateCards: true,
  canComment: true,
  canEditOwnOnly: false,
  boardVisibility: "all",
  loading: false,
  // Legacy compat
  canViewDashboard: true,
  canViewDashboardAll: true,
  canManageAutomations: true,
  canManageIntegrations: true,
  canAccessSettings: true,
  canViewCalendar: true,
};

// Helper: apply override (non-null values take precedence)
function applyOverride(base: boolean, override: boolean | null): boolean {
  return override !== null && override !== undefined ? override : base;
}

function applyModuleOverride(
  base: ModulePermission,
  viewOverride: boolean | null,
  editOverride: boolean | null,
): ModulePermission {
  return {
    view: applyOverride(base.view, viewOverride),
    edit: applyOverride(base.edit, editOverride),
  };
}

function syncLegacy(perms: Permissions): Permissions {
  perms.canViewDashboard = perms.dashboard.view;
  perms.canViewDashboardAll = perms.dashboard.edit; // edit = can see all
  perms.canManageAutomations = perms.automations.edit;
  perms.canManageIntegrations = perms.integrations.edit;
  perms.canAccessSettings = perms.settings.edit;
  perms.canViewCalendar = perms.calendar.view;
  return perms;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const { activeOrgId } = useUIStore();
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    if (!user?.id || !activeOrgId) return;

    const supabase = createClient();

    async function load() {
      // Get user role
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", activeOrgId!)
        .eq("user_id", user!.id)
        .single();

      const role = (membership?.role || "member") as OrgRole;

      // Owner and admin get everything
      if (role === "owner" || role === "admin") {
        setPermissions({ ...ADMIN_PERMISSIONS, role });
        return;
      }

      // Load org perms, team memberships, and user perms in PARALLEL
      const [orgPermsRes, teamMembershipsRes, userPermsRes] = await Promise.all([
        supabase.from("org_permissions").select("*").eq("org_id", activeOrgId!).single(),
        supabase.from("team_members").select("team_id").eq("user_id", user!.id),
        supabase.from("user_permissions").select("*").eq("org_id", activeOrgId!).eq("user_id", user!.id).single(),
      ]);

      const orgPerms = orgPermsRes.data;

      // Start with role-based defaults
      let perms: Permissions;

      if (role === "member") {
        perms = {
          role,
          isAdmin: false,
          // Members can VIEW team data but EDIT only their own by default
          dashboard: { view: orgPerms?.member_can_view_dashboard ?? true, edit: false },
          automations: { view: orgPerms?.member_can_manage_automations ?? false, edit: orgPerms?.member_can_manage_automations ?? false },
          integrations: { view: orgPerms?.member_can_manage_integrations ?? false, edit: orgPerms?.member_can_manage_integrations ?? false },
          settings: { view: false, edit: false },
          boards: { view: true, edit: true },
          calendar: { view: true, edit: true },
          chat: { view: true, edit: true },
          processes: { view: orgPerms?.member_can_view_processes ?? false, edit: orgPerms?.member_can_manage_processes ?? false },
          budget_goals: { view: false, edit: false },
          canInviteMembers: orgPerms?.member_can_invite_members ?? false,
          canCreateBoards: orgPerms?.member_can_create_boards ?? false,
          canCreateChannels: orgPerms?.member_can_create_channels ?? false,
          canDeleteCards: orgPerms?.member_can_delete_cards ?? false,
          canManageLabels: orgPerms?.member_can_manage_labels ?? false,
          canCreateCards: true,
          canComment: true,
          canEditOwnOnly: orgPerms?.member_can_edit_own_only ?? true,
          boardVisibility: orgPerms?.member_board_visibility ?? "team",
          loading: false,
          // Legacy (will be synced below)
          canViewDashboard: true,
          canViewDashboardAll: false,
          canManageAutomations: false,
          canManageIntegrations: false,
          canAccessSettings: false,
          canViewCalendar: true,
        };
      } else {
        // guest
        perms = {
          role,
          isAdmin: false,
          dashboard: { view: false, edit: false },
          automations: { view: false, edit: false },
          integrations: { view: false, edit: false },
          settings: { view: false, edit: false },
          boards: { view: true, edit: false },
          calendar: { view: orgPerms?.guest_can_view_calendar ?? true, edit: false },
          chat: { view: true, edit: true },
          processes: { view: false, edit: false },
          budget_goals: { view: false, edit: false },
          canInviteMembers: false,
          canCreateBoards: false,
          canCreateChannels: false,
          canDeleteCards: false,
          canManageLabels: false,
          canCreateCards: orgPerms?.guest_can_create_cards ?? false,
          canComment: orgPerms?.guest_can_comment ?? true,
          canEditOwnOnly: orgPerms?.guest_can_edit_own_only ?? true,
          boardVisibility: orgPerms?.guest_board_visibility ?? "own",
          loading: false,
          canViewDashboard: false,
          canViewDashboardAll: false,
          canManageAutomations: false,
          canManageIntegrations: false,
          canAccessSettings: false,
          canViewCalendar: true,
        };
      }

      // Layer 2: Team-level overrides
      const teamMemberships = teamMembershipsRes.data;

      if (teamMemberships && teamMemberships.length > 0) {
        const teamIds = teamMemberships.map((t) => t.team_id);
        const { data: teamPermsData } = await supabase
          .from("team_permissions")
          .select("*")
          .eq("org_id", activeOrgId!)
          .in("team_id", teamIds);

        if (teamPermsData) {
          for (const tp of teamPermsData) {
            // New view/edit columns
            perms.dashboard = applyModuleOverride(perms.dashboard, tp.can_view_dashboard_view ?? tp.can_view_dashboard ?? null, tp.can_view_dashboard_edit ?? null);
            perms.automations = applyModuleOverride(perms.automations, tp.can_manage_automations_view ?? tp.can_manage_automations ?? null, tp.can_manage_automations_edit ?? tp.can_manage_automations ?? null);
            perms.integrations = applyModuleOverride(perms.integrations, tp.can_manage_integrations_view ?? tp.can_manage_integrations ?? null, tp.can_manage_integrations_edit ?? tp.can_manage_integrations ?? null);
            perms.settings = applyModuleOverride(perms.settings, tp.can_access_settings_view ?? tp.can_access_settings ?? null, tp.can_access_settings_edit ?? tp.can_access_settings ?? null);
            perms.boards = applyModuleOverride(perms.boards, tp.can_view_boards_view ?? null, tp.can_view_boards_edit ?? tp.can_create_boards ?? null);
            perms.calendar = applyModuleOverride(perms.calendar, tp.can_view_calendar_view ?? tp.can_view_calendar ?? null, tp.can_view_calendar_edit ?? null);
            perms.chat = applyModuleOverride(perms.chat, tp.can_view_chat_view ?? null, tp.can_view_chat_edit ?? tp.can_create_channels ?? null);
            perms.processes = applyModuleOverride(perms.processes, tp.can_view_processes_view ?? null, tp.can_view_processes_edit ?? null);
            perms.budget_goals = applyModuleOverride(perms.budget_goals, tp.can_view_budget_goals_view ?? null, tp.can_view_budget_goals_edit ?? null);
            // Legacy actions
            perms.canInviteMembers = applyOverride(perms.canInviteMembers, tp.can_invite_members);
            perms.canDeleteCards = applyOverride(perms.canDeleteCards, tp.can_delete_cards);
            perms.canManageLabels = applyOverride(perms.canManageLabels, tp.can_manage_labels);
            if (tp.board_visibility) perms.boardVisibility = tp.board_visibility;
          }
        }
      }

      // Layer 3: User-level overrides (highest priority)
      const userPerms = userPermsRes.data;

      if (userPerms) {
        perms.dashboard = applyModuleOverride(perms.dashboard, userPerms.can_view_dashboard_view ?? userPerms.can_view_dashboard ?? null, userPerms.can_view_dashboard_edit ?? null);
        perms.automations = applyModuleOverride(perms.automations, userPerms.can_manage_automations_view ?? userPerms.can_manage_automations ?? null, userPerms.can_manage_automations_edit ?? userPerms.can_manage_automations ?? null);
        perms.integrations = applyModuleOverride(perms.integrations, userPerms.can_manage_integrations_view ?? userPerms.can_manage_integrations ?? null, userPerms.can_manage_integrations_edit ?? userPerms.can_manage_integrations ?? null);
        perms.settings = applyModuleOverride(perms.settings, userPerms.can_access_settings_view ?? userPerms.can_access_settings ?? null, userPerms.can_access_settings_edit ?? userPerms.can_access_settings ?? null);
        perms.boards = applyModuleOverride(perms.boards, userPerms.can_view_boards_view ?? null, userPerms.can_view_boards_edit ?? userPerms.can_create_boards ?? null);
        perms.calendar = applyModuleOverride(perms.calendar, userPerms.can_view_calendar_view ?? userPerms.can_view_calendar ?? null, userPerms.can_view_calendar_edit ?? null);
        perms.chat = applyModuleOverride(perms.chat, userPerms.can_view_chat_view ?? null, userPerms.can_view_chat_edit ?? userPerms.can_create_channels ?? null);
        perms.processes = applyModuleOverride(perms.processes, userPerms.can_view_processes_view ?? null, userPerms.can_view_processes_edit ?? null);
        perms.budget_goals = applyModuleOverride(perms.budget_goals, userPerms.can_view_budget_goals_view ?? null, userPerms.can_view_budget_goals_edit ?? null);
        perms.canInviteMembers = applyOverride(perms.canInviteMembers, userPerms.can_invite_members);
        perms.canDeleteCards = applyOverride(perms.canDeleteCards, userPerms.can_delete_cards);
        perms.canManageLabels = applyOverride(perms.canManageLabels, userPerms.can_manage_labels);
        perms.canCreateCards = applyOverride(perms.canCreateCards, userPerms.can_create_cards);
        perms.canComment = applyOverride(perms.canComment, userPerms.can_comment);
        if (userPerms.board_visibility) perms.boardVisibility = userPerms.board_visibility;
      }

      setPermissions(syncLegacy(perms));
    }

    load();
  }, [user?.id, activeOrgId]);

  return permissions;
}
