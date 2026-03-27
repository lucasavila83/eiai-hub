"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string | null;
  body: string;
}

interface Props {
  orgId: string;
  selectedTemplateId: string | null;
  onSelect: (templateId: string | null) => void;
  /** Filter by template type (email, chat, whatsapp, telegram) */
  filterTypes?: string[];
}

export function TemplateSelector({ orgId, selectedTemplateId, onSelect, filterTypes }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from("message_templates")
        .select("id, name, type, subject, body")
        .eq("org_id", orgId)
        .order("name");

      if (filterTypes && filterTypes.length > 0) {
        query = query.in("type", filterTypes);
      }

      const { data } = await query;
      setTemplates(data || []);
      setLoading(false);
    })();
  }, [orgId, filterTypes?.join(",")]);

  const selected = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground mb-1">
        Template de mensagem
      </label>
      <select
        value={selectedTemplateId || ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        disabled={loading}
      >
        <option value="">Sem template (mensagem inline)</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            [{t.type === "email" ? "E-mail" : t.type === "chat" ? "Chat" : t.type === "whatsapp" ? "WhatsApp" : "Telegram"}] {t.name}
          </option>
        ))}
      </select>

      {/* Preview of selected template */}
      {selected && (
        <div className="bg-background/50 border border-border/60 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-foreground">{selected.name}</span>
          </div>
          {selected.type === "email" && selected.subject && (
            <p className="text-[11px] text-muted-foreground mb-1">
              Assunto: {selected.subject}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/70 font-mono line-clamp-3">
            {selected.body}
          </p>
        </div>
      )}
    </div>
  );
}
