"use client";

import { useState, useRef, useEffect } from "react";
import { formatDateTime, getInitials, generateColor } from "@/lib/utils/helpers";
import { Bot, ListTodo, Mail, Forward } from "lucide-react";
import type { Message } from "@/lib/types/database";

interface Props {
  message: Message & { profiles: any };
  showHeader: boolean;
  isOwn: boolean;
  onCreateTask?: (messageContent: string) => void;
  onForward?: (messageContent: string, senderName: string) => void;
  onEmail?: (messageContent: string, senderName: string) => void;
}

// Simple markdown renderer
function renderContent(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    let result: any = part;
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length > 1) {
      result = boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return <strong key={j}>{bp.slice(2, -2)}</strong>;
        }
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

export function MessageBubble({ message, showHeader, isOwn, onCreateTask, onForward, onEmail }: Props) {
  const profile = message.profiles;
  const name = profile?.full_name || profile?.email || "Usuário";
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position (keep menu in viewport)
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setContextMenu({ x, y });
  }

  if (message.deleted_at) {
    return (
      <div className="px-4 py-0.5">
        <p className="text-sm text-muted-foreground italic">Mensagem deletada</p>
      </div>
    );
  }

  const isTaskMsg = message.content.startsWith("📋");

  return (
    <>
      <div
        className="flex gap-3 px-2 py-0.5 hover:bg-accent/30 rounded-lg group"
        onContextMenu={handleContextMenu}
      >
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

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-card border border-border rounded-xl shadow-2xl py-1 w-52 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setContextMenu(null);
              onCreateTask?.(message.content);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <ListTodo className="w-4 h-4 text-primary" />
            Criar Tarefa
          </button>
          <button
            onClick={() => {
              setContextMenu(null);
              onEmail?.(message.content, name);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Mail className="w-4 h-4 text-orange-500" />
            Email
          </button>
          <button
            onClick={() => {
              setContextMenu(null);
              onForward?.(message.content, name);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Forward className="w-4 h-4 text-blue-500" />
            Encaminhar
          </button>
        </div>
      )}
    </>
  );
}
