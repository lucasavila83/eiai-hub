"use client";

import Link from "next/link";
import { UserCircle, Users, UserCog, Bot, Shield, Key, ChevronRight, ArrowLeft } from "lucide-react";
import { PermissionGuard } from "@/components/layout/PermissionGuard";

export default function SettingsPage() {
  const settingsItems = [
    { href: "/settings/profile", icon: UserCircle, label: "Meu Perfil", description: "Foto, nome, cargo, telefone e informações pessoais" },
    { href: "/settings/members", icon: Users, label: "Membros", description: "Gerencie membros e convites" },
    { href: "/settings/teams", icon: UserCog, label: "Times", description: "Organize em times e equipes" },
    { href: "/settings/permissions", icon: Shield, label: "Permissões", description: "Configure o que cada papel pode fazer" },
    { href: "/settings/agents", icon: Bot, label: "Agentes IA", description: "Configure agentes de inteligência artificial" },
    { href: "/settings/api-keys", icon: Key, label: "API Keys", description: "Gerencie chaves de acesso à API para integrações externas" },
  ];

  return (
    <PermissionGuard permission="canAccessSettings">
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/chat"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      </div>
      <div className="space-y-2">
        {settingsItems.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
        ))}
      </div>
    </div>
    </PermissionGuard>
  );
}
