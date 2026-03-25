"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, Send, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface Props {
  defaultBody: string;
  senderName: string;
  onClose: () => void;
}

type EmailClient = "gmail" | "outlook" | "default";

function getStoredClient(): EmailClient {
  if (typeof window === "undefined") return "default";
  return (localStorage.getItem("preferred-email-client") as EmailClient) || "default";
}

function storeClient(client: EmailClient) {
  localStorage.setItem("preferred-email-client", client);
}

function openEmail(client: EmailClient, to: string, subject: string, body: string) {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const encodedTo = encodeURIComponent(to);

  switch (client) {
    case "gmail": {
      const url = `https://mail.google.com/mail/?view=cm&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`;
      window.open(url, "_blank");
      break;
    }
    case "outlook": {
      const url = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`;
      window.open(url, "_blank");
      break;
    }
    default: {
      const mailto = `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`;
      window.location.href = mailto;
      break;
    }
  }
}

const clients: { id: EmailClient; label: string; icon: string }[] = [
  { id: "gmail", label: "Gmail", icon: "📧" },
  { id: "outlook", label: "Outlook", icon: "📬" },
  { id: "default", label: "App padrão", icon: "✉️" },
];

export function EmailComposeModal({ defaultBody, senderName, onClose }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(`Mensagem de ${senderName} — Lesco-Hub`);
  const [body, setBody] = useState(defaultBody);
  const [selectedClient, setSelectedClient] = useState<EmailClient>(getStoredClient());

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    storeClient(selectedClient);
    openEmail(selectedClient, to, subject, body);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
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
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          {/* Email client selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Abrir com</label>
            <div className="flex gap-2">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClient(c.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer",
                    selectedClient === c.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

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
            <label className="text-sm font-medium text-foreground">Assunto</label>
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
              rows={8}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono text-xs"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={!to.trim()}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir no {clients.find((c) => c.id === selectedClient)?.label}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
