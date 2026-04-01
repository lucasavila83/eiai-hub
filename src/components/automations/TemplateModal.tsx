"use client";

import { useState, useRef, useEffect } from "react";
import {
  X, Loader2, Eye, EyeOff, Bold, Italic, Underline,
  Type, Palette, ALargeSmall,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import {
  resolveTemplate,
  TEMPLATE_VARIABLES,
  SAMPLE_VARIABLES,
} from "@/lib/utils/template-resolver";

const TYPE_OPTIONS = [
  { value: "email", label: "E-mail", color: "bg-blue-500/10 text-blue-500" },
  { value: "chat", label: "Chat", color: "bg-green-500/10 text-green-500" },
  { value: "whatsapp", label: "WhatsApp", color: "bg-emerald-500/10 text-emerald-500", soon: true },
  { value: "telegram", label: "Telegram", color: "bg-sky-500/10 text-sky-500", soon: true },
] as const;

interface TemplateData {
  id?: string;
  name: string;
  type: string;
  subject: string;
  body: string;
}

interface Props {
  initial?: TemplateData;
  onSave: (data: Omit<TemplateData, "id">) => Promise<void>;
  onClose: () => void;
}

export function TemplateModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "email");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState(initial?.body || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showColorPicker, setShowColorPicker] = useState(false);

  function insertVariable(key: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = `{{${key}}}`;
    const newBody = body.slice(0, start) + text + body.slice(end);
    setBody(newBody);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function wrapSelection(prefix: string, suffix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const newBody = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    setBody(newBody);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }

  function applyFormat(fmt: string) {
    switch (fmt) {
      case "bold": wrapSelection("**", "**"); break;
      case "italic": wrapSelection("_", "_"); break;
      case "underline": wrapSelection("<u>", "</u>"); break;
      case "h1": wrapSelection("<h1>", "</h1>"); break;
      case "h2": wrapSelection("<h2>", "</h2>"); break;
      case "big": wrapSelection('<span style="font-size:18px">', "</span>"); break;
      case "small": wrapSelection('<span style="font-size:11px">', "</span>"); break;
    }
  }

  function applyColor(color: string) {
    wrapSelection(`<span style="color:${color}">`, "</span>");
    setShowColorPicker(false);
  }

  const FORMAT_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
    "#8b5cf6", "#ec4899", "#000000", "#6b7280", "#ffffff",
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), type, subject: subject.trim(), body: body.trim() });
    } catch (err: any) {
      setError(err.message || "Erro ao salvar template.");
      setSaving(false);
    }
  }

  const previewBody = resolveTemplate(body, SAMPLE_VARIABLES);
  const previewSubject = resolveTemplate(subject, SAMPLE_VARIABLES);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">
            {initial?.id ? "Editar Template" : "Novo Template"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aviso de tarefa atrasada"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Canal *</label>
            <div className="flex gap-2 flex-wrap">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => !t.soon && setType(t.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                    type === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : t.soon
                      ? "bg-muted/50 text-muted-foreground/50 border-border/50 cursor-not-allowed"
                      : "bg-background border-border text-muted-foreground hover:border-primary/50 cursor-pointer"
                  )}
                >
                  {t.label}
                  {t.soon && <span className="ml-1 text-[10px] opacity-60">(em breve)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Subject (email only) */}
          {type === "email" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Assunto</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Alerta: {{card_title}}"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          {/* Variables */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Variaveis disponiveis (clique para inserir)
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="px-2 py-0.5 text-[11px] font-mono bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors cursor-pointer"
                  title={v.label}
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-foreground">Corpo da mensagem *</label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPreview ? "Editar" : "Preview"}
              </button>
            </div>

            {showPreview ? (
              <div
                className="w-full bg-background border border-border rounded-lg px-3 py-3 text-sm text-foreground min-h-[120px]"
                dangerouslySetInnerHTML={{
                  __html: (() => {
                    let html = type === "email" && previewSubject
                      ? `<div style="font-weight:600;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">${previewSubject}</div>`
                      : "";
                    // Convert markdown-like formatting to HTML for preview
                    let bodyHtml = (previewBody || "<em style='opacity:0.5'>Corpo vazio</em>")
                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                      .replace(/_(.+?)_/g, "<em>$1</em>")
                      .replace(/\n/g, "<br>");
                    return html + bodyHtml;
                  })(),
                }}
              />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/50">
                {/* Formatting toolbar */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
                  <button type="button" onClick={() => applyFormat("bold")} className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer" title="Negrito">
                    <Bold className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => applyFormat("italic")} className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer" title="Itálico">
                    <Italic className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => applyFormat("underline")} className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer" title="Sublinhado">
                    <Underline className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button type="button" onClick={() => applyFormat("big")} className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer" title="Fonte grande">
                    <ALargeSmall className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => applyFormat("h1")} className="px-1.5 py-0.5 rounded hover:bg-accent transition-colors cursor-pointer text-[10px] font-bold text-muted-foreground" title="Título grande">
                    H1
                  </button>
                  <button type="button" onClick={() => applyFormat("h2")} className="px-1.5 py-0.5 rounded hover:bg-accent transition-colors cursor-pointer text-[10px] font-bold text-muted-foreground" title="Título médio">
                    H2
                  </button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <div className="relative">
                    <button type="button" onClick={() => setShowColorPicker(!showColorPicker)} className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer" title="Cor do texto">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {showColorPicker && (
                      <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl p-2 flex gap-1 flex-wrap w-[140px] z-10">
                        {FORMAT_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => applyColor(c)}
                            className="w-5 h-5 rounded-full border border-border/50 cursor-pointer hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={"Ola {{card_assignee}},\n\nA tarefa \"{{card_title}}\" precisa de atencao.\n\nAtt,\nEquipe"}
                  rows={6}
                  className="w-full bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-y font-mono border-0"
                  required
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !body.trim()}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial?.id ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
