"use client";

import { useState } from "react";
import { X, Mail, Send, Loader2 } from "lucide-react";

interface Props {
  defaultBody: string;
  senderName: string;
  onClose: () => void;
}

export function EmailComposeModal({ defaultBody, senderName, onClose }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(`Mensagem de ${senderName}`);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");

    setSending(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Enviar por e-mail
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          {/* To */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Para</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              required
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do e-mail"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Corpo</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={sending || !to.trim()}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
