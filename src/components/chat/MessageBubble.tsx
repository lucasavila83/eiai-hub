import { formatDateTime, getInitials, generateColor } from "@/lib/utils/helpers";
import { Bot } from "lucide-react";
import type { Message } from "@/lib/types/database";

interface Props {
  message: Message & { profiles: any };
  showHeader: boolean;
  isOwn: boolean;
}

// Simple markdown renderer for chat messages
function renderContent(text: string) {
  // Split by code blocks first
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Bold
    let result: any = part;
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length > 1) {
      result = boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return <strong key={j}>{bp.slice(2, -2)}</strong>;
        }
        // Italic
        const italicParts = bp.split(/(_[^_]+_)/g);
        if (italicParts.length > 1) {
          return italicParts.map((ip, k) => {
            if (ip.startsWith("_") && ip.endsWith("_")) {
              return <em key={k}>{ip.slice(1, -1)}</em>;
            }
            return ip;
          });
        }
        return bp;
      });
    } else {
      // Italic only
      const italicParts = part.split(/(_[^_]+_)/g);
      if (italicParts.length > 1) {
        result = italicParts.map((ip, j) => {
          if (ip.startsWith("_") && ip.endsWith("_")) {
            return <em key={j}>{ip.slice(1, -1)}</em>;
          }
          return ip;
        });
      }
    }
    return <span key={i}>{result}</span>;
  });
}

export function MessageBubble({ message, showHeader, isOwn }: Props) {
  const profile = message.profiles;
  const name = profile?.full_name || profile?.email || "Usuário";

  if (message.deleted_at) {
    return (
      <div className="px-4 py-0.5">
        <p className="text-sm text-muted-foreground italic">Mensagem deletada</p>
      </div>
    );
  }

  // Task creation message
  const isTaskMsg = message.content.startsWith("📋 Tarefa criada:");

  return (
    <div className="flex gap-3 px-2 py-0.5 hover:bg-accent/30 rounded-lg group">
      {showHeader ? (
        <div className="relative shrink-0 mt-0.5">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: generateColor(name) }}
            >
              {getInitials(name)}
            </div>
          )}
          {profile?.is_ai_agent && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
              <Bot className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground">{name}</span>
            {profile?.is_ai_agent && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">AI</span>
            )}
            <span className="text-xs text-muted-foreground">{formatDateTime(message.created_at)}</span>
          </div>
        )}
        {isTaskMsg ? (
          <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 text-sm">
            <span>{renderContent(message.content)}</span>
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {renderContent(message.content)}
          </p>
        )}
        {message.edited_at && (
          <span className="text-xs text-muted-foreground">(editado)</span>
        )}
      </div>
    </div>
  );
}
