"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Mail,
  MessageSquare,
  Phone,
  Send,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils/helpers";
import { TemplateModal } from "./TemplateModal";

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  email: { label: "E-mail", color: "bg-blue-500/10 text-blue-500", icon: Mail },
  chat: { label: "Chat", color: "bg-green-500/10 text-green-500", icon: MessageSquare },
  whatsapp: { label: "WhatsApp", color: "bg-emerald-500/10 text-emerald-500", icon: Phone },
  telegram: { label: "Telegram", color: "bg-sky-500/10 text-sky-500", icon: Send },
};

interface Template {
  id: string;
  org_id: string;
  name: string;
  type: string;
  subject: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  orgId: string;
  currentUserId: string;
}

export function TemplateManager({ orgId, currentUserId }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [orgId]);

  async function loadTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setTemplates(data || []);
    setLoading(false);
  }

  async function handleSave(data: { name: string; type: string; subject: string; body: string }) {
    if (editingTemplate) {
      const { error } = await supabase
        .from("message_templates")
        .update({ name: data.name, type: data.type, subject: data.subject || null, body: data.body })
        .eq("id", editingTemplate.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("message_templates").insert({
        org_id: orgId,
        name: data.name,
        type: data.type,
        subject: data.subject || null,
        body: data.body,
        created_by: currentUserId,
      });
      if (error) throw error;
    }
    setShowModal(false);
    setEditingTemplate(null);
    await loadTemplates();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await supabase.from("message_templates").delete().eq("id", id);
    setConfirmDeleteId(null);
    setDeleting(false);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  function openCreate() {
    setEditingTemplate(null);
    setShowModal(true);
  }

  function openEdit(t: Template) {
    setEditingTemplate(t);
    setShowModal(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Modelos de mensagens para usar nas automacoes
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Template
        </button>
      </div>

      {/* List */}
      {templates.length === 0 ? (
        <div className="text-center py-16">
          <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum template criado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Crie modelos de mensagens para vincular nas automacoes
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.chat;
            const Icon = cfg.icon;
            return (
              <div
                key={t.id}
                className="bg-card border border-border rounded-xl overflow-hidden transition-colors"
              >
                <div className="px-4 py-3 flex items-start gap-3">
                  <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", cfg.color)}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                    {t.type === "email" && t.subject && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Assunto: {t.subject}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 font-mono">
                      {t.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                      {formatDateTime(t.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeleteId === t.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-destructive font-medium">Excluir?</span>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting}
                          className="px-2 py-1 text-xs font-medium rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors cursor-pointer"
                        >
                          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sim"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                        >
                          Nao
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(t)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(t.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-accent"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <TemplateModal
          initial={
            editingTemplate
              ? {
                  id: editingTemplate.id,
                  name: editingTemplate.name,
                  type: editingTemplate.type,
                  subject: editingTemplate.subject || "",
                  body: editingTemplate.body,
                }
              : undefined
          }
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
