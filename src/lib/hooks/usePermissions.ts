"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuth } from "@/components/providers/AuthProvider";

export type OrgRole = "owner" | "admin" | "member" | "guest" | null;

export interface Permissions {
  role: OrgRole;
  isAdmin: boolean; // owner or admin
  // Module access
  canViewDashboard: boolean;
  canViewDashboardAll: boolean; // can see other members' data
  canManageAutomations: boolean;
  canManageIntegrations: boolean;
  canAccessSettings: boolean;
  canInviteMembers: boolean;
  canCreateBoards: boolean;
  canCreateChannels: boolean;
  canDeleteCards: boolean;
  canManageLabels: boolean;
  // Board visibility
  boardVisibility: "own" | "team" | "all";
  // Guest
  canCreateCards: boolean;
  canComment: boolean;
  canViewCalendar: boolean;
  // Loading
  loading: boolean;
}

const DEFAULT_PERMISSIONS: Permissions = {
  role: null,
  isAdmin: false,
  canViewDashboard: false,
  canViewDashboardAll: false,
  canManageAutomations: false,
  canManageIntegrations: false,
  canAccessSettings: false,
  canInviteMembers: false,
  canCreateBoards: false,
  canCreateChannels: false,
  canDeleteCards: false,
  canManageLabels: false,
  boardVisibility: "own",
  canCreateCards: true,
  canComment: true,
  canViewCalendar: true,
  loading: true,
};

const ADMIN_PERMISSIONS: Permissions = {
  role: "admin",
  isAdmin: true,
  canViewDashboard: true,
  canViewDashboardAll: true,
  canManageAutomations: true,
  canManageIntegrations: true,
  canAccessSettings: true,
  canInviteMembers: true,
  canCreateBoards: true,
  canCreateChannels: true,
  canDeleteCards: true,
  canManageLabels: true,
  boardVisibility: "all",
  canCreateCards: true,
  canComment: true,
  canViewCalendar: true,
  loading: false,
};

// Helper: apply override (non-null values take precedence)
function applyOverride(base: boolean, override: boolean | null): boolean {
  return override !== null && override !== undefined ? override : base;
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

      // Load org-level permissions (role-based defaults)
      const { data: orgPerms } = await supabase
        .from("org_permissions")
        .select("*")
        .eq("org_id", activeOrgId!)
        .single();

      // Start with role-based defaults
      let perms: Permissions;

      if (role === "member") {
        perms = {
          role,
          isAdmin: false,
          canViewDashboard: orgPerms?.member_can_view_dashboard ?? true,
          canViewDashboardAll: false,
          canManageAutomations: orgPerms?.member_can_manage_automations ?? false,
          canManageIntegrations: orgPerms?.member_can_manage_integrations ?? false,
          canAccessSettings: false,
          canInviteMembers: orgPerms?.member_can_invite_members ?? false,
          canCreateBoards: orgPerms?.member_can_create_boards ?? false,
          canCreateChannels: orgPerms?.member_can_create_channels ?? false,
          canDeleteCards: orgPerms?.member_can_delete_cards ?? false,
          canManageLabels: orgPerms?.member_can_manage_labels ?? false,
          boardVisibility: orgPerms?.member_board_visibility ?? "own",
          canCreateCards: true,
          canComment: true,
          canViewCalendar: true,
          loading: false,
        };
      } else {
        // guest
        perms = {
          role,
          isAdmin: false,
          canViewDashboard: false,
          canViewDashboardAll: false,
          canManageAutomations: false,
          canManageIntegrations: false,
          canAccessSettings: false,
          canInviteMembers: false,
          canCreateBoards: false,
          canCreateChannels: false,
          canDeleteCards: false,
          canManageLabels: false,
          boardVisibility: orgPerms?.guest_board_visibility ?? "own",
          canCreateCards: orgPerms?.guest_can_create_cards ?? false,
          canComment: orgPerms?.guest_can_comment ?? true,
          canViewCalendar: orgPerms?.guest_can_view_calendar ?? true,
          loading: false,
        };
      }

      // Layer 2: Team-level overrides
      // Get user's teams
      const { data: teamMemberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id);

      if (teamMemberships && teamMemberships.length > 0) {
        const teamIds = teamMemberships.map((t) => t.team_id);
        const { data: teamPermsData } = await supabase
          .from("team_permissions")
          .select("*")
          .eq("org_id", activeOrgId!)
          .in("team_id", teamIds);

        if (teamPermsData) {
          // Merge team permissions (OR logic: if ANY team grants, user gets it)
          for (const tp of teamPermsData) {
            perms.canViewDashboard = applyOverride(perms.canViewDashboard, tp.can_view_dashboard);
            perms.canManageAutomations = applyOverride(perms.canManageAutomations, tp.can_manage_automations);
            perms.canManageIntegrations = applyOverride(perms.canManageIntegrations, tp.can_manage_integrations);
            perms.canAccessSettings = applyOverride(perms.canAccessSettings, tp.can_access_settings);
            perms.canInviteMembers = applyOverride(perms.canInviteMembers, tp.can_invite_members);
            perms.canCreateBoards = applyOverride(perms.canCreateBoards, tp.can_create_boards);
            perms.canCreateChannels = applyOverride(perms.canCreateChannels, tp.can_create_channels);
            perms.canDeleteCards = applyOverride(perms.canDeleteCards, tp.can_delete_cards);
            perms.canManageLabels = applyOverride(perms.canManageLabels, tp.can_manage_labels);
            perms.canViewCalendar = applyOverride(perms.canViewCalendar, tp.can_view_calendar);
            if (tp.board_visibility) perms.boardVisibility = tp.board_visibility;
          }
        }
      }

      // Layer 3: User-level overrides (highest priority)
      const { data: userPerms } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("org_id", activeOrgId!)
        .eq("user_id", user!.id)
        .single();

      if (userPerms) {
        perms.canViewDashboard = applyOverride(perms.canViewDashboard, userPerms.can_view_dashboard);
        perms.canViewDashboardAll = applyOverride(perms.canViewDashboardAll, userPerms.can_view_dashboard_all);
        perms.canManageAutomations = applyOverride(perms.canManageAutomations, userPerms.can_manage_automations);
        perms.canManageIntegrations = applyOverride(perms.canManageIntegrations, userPerms.can_manage_integrations);
        perms.canAccessSettings = applyOverride(perms.canAccessSettings, userPerms.can_access_settings);
        perms.canInviteMembers = applyOverride(perms.canInviteMembers, userPerms.can_invite_members);
        perms.canCreateBoards = applyOverride(perms.canCreateBoards, userPerms.can_create_boards);
        perms.canCreateChannels = applyOverride(perms.canCreateChannels, userPerms.can_create_channels);
        perms.canDeleteCards = applyOverride(perms.canDeleteCards, userPerms.can_delete_cards);
        perms.canManageLabels = applyOverride(perms.canManageLabels, userPerms.can_manage_labels);
        perms.canViewCalendar = applyOverride(perms.canViewCalendar, userPerms.can_view_calendar);
        perms.canCreateCards = applyOverride(perms.canCreateCards, userPerms.can_create_cards);
        perms.canComment = applyOverride(perms.canComment, userPerms.can_comment);
        if (userPerms.board_visibility) perms.boardVisibility = userPerms.board_visibility;
      }

      setPermissions(perms);
    }

    load();
  }, [user?.id, activeOrgId]);

  return permissions;
}
