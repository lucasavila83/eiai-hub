"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, getInitials, generateColor } from "@/lib/utils/helpers";
import {
  Bot, ListTodo, Mail, Forward, ChevronDown, ChevronUp,
  Pencil, Check, X, FileText, Image as ImageIcon, Download,
  File, FileSpreadsheet, FileArchive,
} from "lucide-react";
import type { Message } from "@/lib/types/database";

interface Props {
  message: Message & { profiles: any };
  showHeader: boolean;
  isOwn: boolean;
  onCreateTask?: (messageContent: string) => void;
  onForward?: (messageContent: string, senderName: string) => void;
  onEmail?: (messageContent: string, senderName: string) => void;
  onMessageEdited?: (messageId: string, newContent: string) => void;
}

// File attachment detection
const FILE_URL_REGEX = /^📎\s*(?:Arquivo:\s*)?\*\*(.+?)\*\*\n(https?:\/\/.+)$/s;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const DOC_EXTENSIONS = [".pdf", ".doc", ".docx"];
const SHEET_EXTENSIONS = [".xls", ".xlsx", ".csv"];

function getFileIcon(fileName: string) {
  const lower = fileName.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return ImageIcon;
  if (DOC_EXTENSIONS.some((ext) => lower.endsWith(ext))) return FileText;
  if (SHEET_EXTENSIONS.some((ext) => lower.endsWith(ext))) return FileSpreadsheet;
  if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z")) return FileArchive;
  return File;
}

function getFileColor(fileName: string) {
  const lower = fileName.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text-blue-500 bg-blue-500/10";
  if (DOC_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text-red-500 bg-red-500/10";
  if (SHEET_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text-green-600 bg-green-600/10";
  return "text-orange-500 bg-orange-500/10";
}

function isImageFile(fileName: string) {
  return IMAGE_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
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

// File attachment component
function FileAttachment({ fileName, fileUrl }: { fileName: string; fileUrl: string }) {
  const Icon = getFileIcon(fileName);
  const colorClass = getFileColor(fileName);
  const isImage = isImageFile(fileName);

  return (
    <div className="max-w-xs">
      {isImage && (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block mb-2">
          <img
            src={fileUrl}
            alt={fileName}
            className="rounded-lg border border-border max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          />
        </a>
      )}
      <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-3 py-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
        </div>
        <a
          href={fileUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Baixar arquivo"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export function MessageBubble({ message, showHeader, isOwn, onCreateTask, onForward, onEmail, onMessageEdited }: Props) {
  const profile = message.profiles;
  const name = profile?.full_name || profile?.email || "Usuário";
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [taskExpanded, setTaskExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus edit textarea
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editing]);

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
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setContextMenu({ x, y });
  }

  async function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setEditContent(message.content);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("messages")
      .update({ content: trimmed, edited_at: new Date().toISOString() })
      .eq("id", message.id);

    if (!error) {
      onMessageEdited?.(message.id, trimmed);
      message.content = trimmed;
      message.edited_at = new Date().toISOString();
    }
    setSaving(false);
    setEditing(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditContent(message.content);
    }
  }

  if (message.deleted_at) {
    return (
      <div className="px-4 py-0.5">
        <p className="text-sm text-muted-foreground italic">Mensagem deletada</p>
      </div>
    );
  }

  const isTaskMsg = message.content.startsWith("📋");

  // Check if message is a file attachment
  const fileMatch = message.content.match(FILE_URL_REGEX);
  const isFileMsg = !!fileMatch;

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

          {editing ? (
            <div className="space-y-1">
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={Math.min(editContent.split("\n").length, 5)}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar
                </button>
                <button
                  onClick={() => { setEditing(false); setEditContent(message.content); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
                <span className="text-xs text-muted-foreground">Enter salvar · Esc cancelar</span>
              </div>
            </div>
          ) : isFileMsg ? (
            <FileAttachment fileName={fileMatch![1]} fileUrl={fileMatch![2]} />
          ) : isTaskMsg ? (
            <div
              className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 transition-colors max-w-md"
              onClick={() => setTaskExpanded(!taskExpanded)}
            >
              <div className="flex items-center gap-2 justify-between">
                <span className="font-medium truncate">
                  {message.content.split("\n")[0]}
                </span>
                {message.content.includes("\n") && (
                  taskExpanded
                    ? <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-primary shrink-0" />
                )}
              </div>
              {taskExpanded && message.content.includes("\n") && (
                <div className="mt-2 pt-2 border-t border-primary/10 text-muted-foreground whitespace-pre-wrap space-y-0.5">
                  {message.content.split("\n").slice(1).filter(Boolean).map((line, i) => (
                    <p key={i}>{renderContent(line)}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {renderContent(message.content)}
            </p>
          )}
          {message.edited_at && !editing && (
            <span className="text-xs text-muted-foreground">(editado)</span>
          )}

          {/* Edit button on hover for own messages */}
          {isOwn && !editing && !isFileMsg && (
            <button
              onClick={() => { setEditContent(message.content); setEditing(true); }}
              className="hidden group-hover:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
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
          {isOwn && !isFileMsg && (
            <button
              onClick={() => {
                setContextMenu(null);
                setEditContent(message.content);
                setEditing(true);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="w-4 h-4 text-primary" />
              Editar mensagem
            </button>
          )}
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
            <Forward className="w-4 h-4 text-primary" />
            Encaminhar
          </button>
        </div>
      )}
    </>
  );
}
