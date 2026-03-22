"use client";

import { usePermissions } from "@/lib/hooks/usePermissions";
import { Shield, Loader2 } from "lucide-react";
import Link from "next/link";

interface Props {
  children: React.ReactNode;
  permission: "canAccessSettings" | "canManageAutomations" | "canManageIntegrations" | "canViewDashboard" | "isAdmin";
  fallbackMessage?: string;
}

export function PermissionGuard({ children, permission, fallbackMessage }: Props) {
  const perms = usePermissions();

  if (perms.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasPermission = permission === "isAdmin" ? perms.isAdmin : perms[permission];

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-1">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {fallbackMessage || "Voce nao tem permissao para acessar esta pagina. Entre em contato com um administrador."}
          </p>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Voltar ao chat
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
