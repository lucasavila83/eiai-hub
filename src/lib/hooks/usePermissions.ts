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

      // Load org permissions for this role
      const { data: orgPerms } = await supabase
        .from("org_permissions")
        .select("*")
        .eq("org_id", activeOrgId!)
        .single();

      if (role === "member") {
        setPermissions({
          role,
          isAdmin: false,
          canViewDashboard: orgPerms?.member_can_view_dashboard ?? true,
          canViewDashboardAll: false, // members NEVER see others' data
          canManageAutomations: orgPerms?.member_can_manage_automations ?? false,
          canManageIntegrations: orgPerms?.member_can_manage_integrations ?? false,
          canAccessSettings: false, // members NEVER access settings
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
        });
      } else if (role === "guest") {
        setPermissions({
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
        });
      }
    }

    load();
  }, [user?.id, activeOrgId]);

  return permissions;
}
