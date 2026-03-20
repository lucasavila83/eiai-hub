"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/stores/ui-store";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Eye,
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
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

type Visibility = "own" | "team" | "all";

interface Permissions {
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
  guest_can_create_cards: boolean;
  guest_can_comment: boolean;
  guest_can_view_calendar: boolean;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: "own", label: "Apenas seus cards", description: "Vê somente as tarefas atribuídas a ele" },
  { value: "team", label: "Cards da equipe", description: "Vê tarefas dos boards da sua equipe" },
  { value: "all", label: "Todos os cards", description: "Vê todas as tarefas da organização" },
];

const DEFAULT_PERMISSIONS: Permissions = {
  member_board_visibility: "all",
  guest_board_visibility: "own",
  member_can_create_boards: true,
  member_can_create_channels: true,
  member_can_invite_members: false,
  member_can_manage_automations: false,
  member_can_manage_integrations: false,
  member_can_view_dashboard: true,
  member_can_delete_cards: true,
  member_can_manage_labels: true,
  guest_can_create_cards: true,
  guest_can_comment: true,
  guest_can_view_calendar: true,
};

export default function PermissionsPage() {
  const supabase = createClient();
  const { activeOrgId } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    if (activeOrgId) loadPermissions();
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
        guest_can_create_cards: data.guest_can_create_cards,
        guest_can_comment: data.guest_can_comment,
        guest_can_view_calendar: data.guest_can_view_calendar,
      });
    } else {
      // Create default permissions for org
      await supabase.from("org_permissions").insert({ org_id: activeOrgId! });
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!activeOrgId) return;
    setSaving(true);

    const { error } = await supabase
      .from("org_permissions")
      .update({
        ...permissions,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", activeOrgId);

    if (!error) setSuccess(true);
    setSaving(false);
  }

  function toggleBool(key: keyof Permissions) {
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
          <h1 className="text-2xl font-bold text-foreground">Permissões</h1>
          <p className="text-sm text-muted-foreground">
            Configure o que cada papel pode fazer na organização
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

      {/* Info box */}
      <div className="mb-6 flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Owners e Admins</strong> sempre têm acesso total.
          Estas configurações se aplicam aos papéis <strong className="text-foreground">Membro</strong> e <strong className="text-foreground">Convidado</strong>.
        </div>
      </div>

      {/* ===== MEMBER PERMISSIONS ===== */}
      <div className="space-y-6">
        <SectionTitle icon={Users} label="Permissões de Membros" description="Usuários com papel 'Membro' na organização" />

        {/* Board Visibility */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Visibilidade de Boards</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Define quais tarefas e boards os membros podem visualizar
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
          <ToggleRow
            icon={Kanban}
            label="Criar boards"
            description="Criar novos boards e projetos"
            checked={permissions.member_can_create_boards}
            onChange={() => toggleBool("member_can_create_boards")}
          />
          <ToggleRow
            icon={MessageSquare}
            label="Criar canais"
            description="Criar novos canais de chat"
            checked={permissions.member_can_create_channels}
            onChange={() => toggleBool("member_can_create_channels")}
          />
          <ToggleRow
            icon={UserPlus}
            label="Convidar membros"
            description="Enviar convites para novos membros"
            checked={permissions.member_can_invite_members}
            onChange={() => toggleBool("member_can_invite_members")}
          />
          <ToggleRow
            icon={Zap}
            label="Gerenciar automações"
            description="Criar e editar automações"
            checked={permissions.member_can_manage_automations}
            onChange={() => toggleBool("member_can_manage_automations")}
          />
          <ToggleRow
            icon={Plug}
            label="Gerenciar integrações"
            description="Configurar integrações externas"
            checked={permissions.member_can_manage_integrations}
            onChange={() => toggleBool("member_can_manage_integrations")}
          />
          <ToggleRow
            icon={BarChart3}
            label="Ver dashboard"
            description="Acessar métricas e relatórios"
            checked={permissions.member_can_view_dashboard}
            onChange={() => toggleBool("member_can_view_dashboard")}
          />
          <ToggleRow
            icon={Trash2}
            label="Excluir tarefas"
            description="Arquivar ou excluir cards"
            checked={permissions.member_can_delete_cards}
            onChange={() => toggleBool("member_can_delete_cards")}
          />
          <ToggleRow
            icon={Tag}
            label="Gerenciar labels"
            description="Criar e editar labels dos boards"
            checked={permissions.member_can_manage_labels}
            onChange={() => toggleBool("member_can_manage_labels")}
          />
        </div>

        {/* ===== GUEST PERMISSIONS ===== */}
        <SectionTitle icon={Users} label="Permissões de Convidados" description="Usuários com papel 'Convidado' na organização" />

        {/* Guest Visibility */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Visibilidade de Boards</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Define quais tarefas e boards os convidados podem visualizar
          </p>
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
          <ToggleRow
            icon={PenLine}
            label="Criar tarefas"
            description="Criar novos cards nos boards"
            checked={permissions.guest_can_create_cards}
            onChange={() => toggleBool("guest_can_create_cards")}
          />
          <ToggleRow
            icon={MessageSquare}
            label="Comentar"
            description="Adicionar comentários em cards"
            checked={permissions.guest_can_comment}
            onChange={() => toggleBool("guest_can_comment")}
          />
          <ToggleRow
            icon={Calendar}
            label="Ver calendário"
            description="Acessar a visualização de calendário"
            checked={permissions.guest_can_view_calendar}
            onChange={() => toggleBool("guest_can_view_calendar")}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Voltar
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar permissões
        </button>
      </div>
    </div>
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

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: any;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
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
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </label>
  );
}
