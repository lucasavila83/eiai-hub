"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, getInitials, generateColor } from "@/lib/utils/helpers";
import {
  Bot, ListTodo, Mail, Forward, ChevronDown, ChevronUp,
  Pencil, Check, CheckCheck, X, FileText, Image as ImageIcon, Download,
  File, FileSpreadsheet, FileArchive, Play, Pause, Reply,
} from "lucide-react";
import type { Message } from "@/lib/types/database";

interface Props {
  message: Message & { profiles: any };
  showHeader: boolean;
  isOwn: boolean;
  isRead?: boolean;
  readBy?: number;
  totalOthers?: number;
  onCreateTask?: (messageContent: string) => void;
  onForward?: (messageContent: string, senderName: string) => void;
  onEmail?: (messageContent: string, senderName: string) => void;
  onMessageEdited?: (messageId: string, newContent: string) => void;
  onReply?: (message: Message & { profiles: any }) => void;
}

// File attachment detection
const FILE_URL_REGEX = /^📎\s*(?:Arquivo:\s*)?\*\*(.+?)\*\*\n(https?:\/\/.+)$/s;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const DOC_EXTENSIONS = [".pdf", ".doc", ".docx"];
const SHEET_EXTENSIONS = [".xls", ".xlsx", ".csv"];
const AUDIO_EXTENSIONS = [".webm", ".mp3", ".ogg", ".wav", ".m4a"];

// Audio detection: "🎙️ **Áudio** (X:XX)\nhttps://..."
const AUDIO_MSG_REGEX = /^🎙️?\s*\*?\*?[AÁáa]udio\*?\*?\s*\([\d:]+\)\n(https?:\/\/\S+)/s;

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

// URL regex for linkifying — captures full URLs including query strings and fragments
const URL_REGEX = /(https?:\/\/[^\s<>"]+)/g;

// Clean trailing punctuation that is likely not part of the URL
function cleanUrl(url: string): string {
  // Remove trailing punctuation that's probably sentence-ending, not URL
  return url.replace(/[.,;:!?'")\]]+$/, "");
}

// Linkify plain text: convert URLs to <a> tags
function linkify(text: string, keyPrefix: string) {
  const matches: { index: number; url: string; cleaned: string }[] = [];
  const regex = new RegExp(URL_REGEX.source, "g");
  let m;
  while ((m = regex.exec(text)) !== null) {
    const cleaned = cleanUrl(m[1]);
    matches.push({ index: m.index, url: m[1], cleaned });
  }
  if (matches.length === 0) return text;

  const result: (string | React.ReactElement)[] = [];
  let lastEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const { index, url, cleaned } = matches[i];
    // Text before this URL
    if (index > lastEnd) result.push(text.slice(lastEnd, index));
    // The link
    result.push(
      <a
        key={`${keyPrefix}-link-${i}`}
        href={cleaned}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {cleaned}
      </a>
    );
    // Any trailing chars that were cleaned off
    const trailing = url.slice(cleaned.length);
    if (trailing) result.push(trailing);
    lastEnd = index + url.length;
  }
  if (lastEnd < text.length) result.push(text.slice(lastEnd));
  return result;
}

// Simple markdown renderer — URLs are extracted first to prevent
// italic/bold regex from breaking links that contain underscores or asterisks.
function renderContent(text: string) {
  // Step 1: Extract URLs and replace with placeholders
  const urlMap: Record<string, string> = {};
  const urlRegex = new RegExp(URL_REGEX.source, "g");
  let urlIdx = 0;
  const safeText = text.replace(urlRegex, (match) => {
    const cleaned = cleanUrl(match);
    const key = `\x00URL${urlIdx++}\x00`;
    urlMap[key] = cleaned;
    // Preserve trailing chars that were cleaned off
    const trailing = match.slice(cleaned.length);
    return key + trailing;
  });

  // Step 2: Process markdown on safe text (no URLs to break)
  const parts = safeText.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">
          {restoreUrls(part.slice(1, -1), urlMap, `${i}-c`)}
        </code>
      );
    }
    let result: any = part;
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length > 1) {
      result = boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return <strong key={j}>{restoreUrls(bp.slice(2, -2), urlMap, `${i}-b${j}`)}</strong>;
        }
        const italicParts = bp.split(/(_[^_]+_)/g);
        if (italicParts.length > 1) {
          return italicParts.map((ip, k) => {
            if (ip.startsWith("_") && ip.endsWith("_")) {
              return <em key={k}>{restoreUrls(ip.slice(1, -1), urlMap, `${i}-b${j}-i${k}`)}</em>;
            }
            return restoreUrls(ip, urlMap, `${i}-b${j}-t${k}`);
          });
        }
        return restoreUrls(bp, urlMap, `${i}-b${j}`);
      });
    } else {
      const italicParts = part.split(/(_[^_]+_)/g);
      if (italicParts.length > 1) {
        result = italicParts.map((ip, j) => {
          if (ip.startsWith("_") && ip.endsWith("_")) {
            return <em key={j}>{restoreUrls(ip.slice(1, -1), urlMap, `${i}-i${j}`)}</em>;
          }
          return restoreUrls(ip, urlMap, `${i}-t${j}`);
        });
      } else {
        result = restoreUrls(part, urlMap, `${i}`);
      }
    }
    return <span key={i}>{result}</span>;
  });
}

// Restore URL placeholders back to clickable links
function restoreUrls(text: string, urlMap: Record<string, string>, keyPrefix: string): any {
  const placeholderRegex = /\x00URL\d+\x00/g;
  const parts = text.split(placeholderRegex);
  const placeholders = text.match(placeholderRegex);
  if (!placeholders || placeholders.length === 0) return linkify(text, keyPrefix);

  const result: any[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) result.push(...[].concat(linkify(parts[i], `${keyPrefix}-p${i}`) as any));
    if (i < placeholders.length) {
      const url = urlMap[placeholders[i]];
      if (url) {
        result.push(
          <a
            key={`${keyPrefix}-url${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
          >
            {url}
          </a>
        );
      }
    }
  }
  return result;
}

// Audio Player component
function AudioPlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        preload="metadata"
      />
      <button
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isOwn ? "bg-white/20 hover:bg-white/30 text-white" : "bg-primary/10 hover:bg-primary/20 text-primary"
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isOwn ? "bg-white/60" : "bg-primary/50"}`}
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
        <span className={`text-[10px] ${isOwn ? "text-white/70" : "text-muted-foreground"}`}>
          {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

// File attachment component
function FileAttachment({ fileName, fileUrl, isOwn }: { fileName: string; fileUrl: string; isOwn: boolean }) {
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
      <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isOwn ? "bg-white/10" : "bg-muted/50 border border-border"}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOwn ? "bg-white/20 text-white" : colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isOwn ? "text-white" : "text-foreground"}`}>{fileName}</p>
        </div>
        <a
          href={fileUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 p-1.5 rounded-md transition-colors ${isOwn ? "text-white/70 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
          title="Baixar arquivo"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export function MessageBubble({ message, showHeader, isOwn, isRead, readBy = 0, totalOthers = 0, onCreateTask, onForward, onEmail, onMessageEdited, onReply }: Props) {
  const profile = message.profiles;
  const name = profile?.full_name || profile?.email || "Usuário";
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [taskExpanded, setTaskExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-resize & focus edit textarea
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
      autoResize(editRef.current);
    }
  }, [editing, autoResize]);

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
      <div className="px-4 py-0.5 flex justify-center">
        <p className="text-xs text-muted-foreground italic">Mensagem deletada</p>
      </div>
    );
  }

  const isTaskMsg = message.content.startsWith("📋");
  const fileMatch = message.content.match(FILE_URL_REGEX);
  const isFileMsg = !!fileMatch;
  const audioMatch = message.content.match(AUDIO_MSG_REGEX);
  const isAudioMsg = !!audioMatch;

  // Extract time from message
  const timeStr = new Date(message.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Get transcription text if audio message
  const audioTranscription = isAudioMsg
    ? (() => {
        // Look for 📝 _text_ pattern
        const transcriptMatch = message.content.match(/📝\s*_(.+?)_/s);
        if (transcriptMatch) return transcriptMatch[1].trim();
        // Fallback: lines after URL that aren't empty or URLs
        const lines = message.content.split("\n").slice(2).filter((l) => l.trim() && !l.startsWith("http") && !l.startsWith("📝"));
        return lines.length > 0 ? lines.join("\n").trim() : null;
      })()
    : null;

  return (
    <>
      {/* WhatsApp-style layout: own messages right, others left */}
      <div
        className={`flex px-4 py-0.5 ${isOwn ? "justify-end" : "justify-start"}`}
        onContextMenu={handleContextMenu}
      >
        {/* Avatar for other users (left side) */}
        {!isOwn && showHeader && (
          <div className="shrink-0 mr-2 mt-auto mb-1">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: generateColor(name) }}
              >
                {getInitials(name)}
              </div>
            )}
          </div>
        )}
        {!isOwn && !showHeader && <div className="w-7 shrink-0 mr-2" />}

        {/* Message bubble */}
        <div
          className={`relative max-w-[70%] group ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
              : "bg-card border border-border text-foreground rounded-2xl rounded-bl-md"
          } px-3 py-2 shadow-sm`}
        >
          {/* Sender name for group chats (other users only) */}
          {!isOwn && showHeader && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold" style={{ color: generateColor(name) }}>
                {name}
              </span>
              {profile?.is_ai_agent && (
                <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded font-medium">AI</span>
              )}
            </div>
          )}

          {/* Message content */}
          {editing ? (
            <div>
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); autoResize(e.target); }}
                onKeyDown={handleEditKeyDown}
                className={`w-full text-sm resize-none overflow-hidden ${isOwn ? "text-white" : "text-foreground"}`}
                style={{ minHeight: "1.25rem", background: "transparent", border: "none", padding: 0, outline: "none", boxShadow: "none" }}
              />
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <button
                  onClick={() => { setEditing(false); setEditContent(message.content); }}
                  className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded transition-colors ${isOwn ? "text-white/60 hover:text-white/90" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded transition-colors disabled:opacity-50 ${isOwn ? "text-white/80 hover:text-white" : "text-primary hover:text-primary/80"}`}
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : isAudioMsg ? (
            <div>
              <AudioPlayer src={audioMatch![1]} isOwn={isOwn} />
              {audioTranscription && (
                <p className={`text-xs mt-1.5 italic ${isOwn ? "text-white/70" : "text-muted-foreground"}`}>
                  {audioTranscription}
                </p>
              )}
            </div>
          ) : isFileMsg ? (
            <FileAttachment fileName={fileMatch![1]} fileUrl={fileMatch![2]} isOwn={isOwn} />
          ) : isTaskMsg ? (
            <div
              className={`rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                isOwn ? "bg-white/10 hover:bg-white/15" : "bg-primary/5 border border-primary/20 hover:bg-primary/10"
              }`}
              onClick={() => setTaskExpanded(!taskExpanded)}
            >
              <div className="flex items-center gap-2 justify-between">
                <span className="font-medium truncate">
                  {message.content.split("\n")[0]}
                </span>
                {message.content.includes("\n") && (
                  taskExpanded
                    ? <ChevronUp className="w-4 h-4 shrink-0 opacity-70" />
                    : <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
                )}
              </div>
              {taskExpanded && message.content.includes("\n") && (
                <div className="mt-2 pt-2 border-t border-current/10 opacity-80 whitespace-pre-wrap space-y-0.5">
                  {message.content.split("\n").slice(1).filter(Boolean).map((line, i) => (
                    <p key={i} className="text-xs">{renderContent(line)}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {renderContent(message.content)}
            </p>
          )}

          {/* Time + edited indicator + read receipts */}
          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-end"}`}>
            {message.edited_at && !editing && (
              <span className={`text-[10px] ${isOwn ? "text-white/50" : "text-muted-foreground"}`}>(editado)</span>
            )}
            <span className={`text-[10px] ${isOwn ? "text-white/50" : "text-muted-foreground"}`}>
              {timeStr}
            </span>
            {isOwn && (
              isRead ? (
                <CheckCheck className="w-3.5 h-3.5 text-blue-400" title={totalOthers > 1 ? `Lido por todos (${readBy})` : "Lido"} />
              ) : readBy > 0 ? (
                <CheckCheck className="w-3.5 h-3.5 text-blue-400/50" title={`Lido por ${readBy} de ${totalOthers}`} />
              ) : (
                <CheckCheck className="w-3.5 h-3.5 text-white/40" title="Não lido" />
              )
            )}
          </div>

          {/* Edit button on hover for own messages */}
          {isOwn && !editing && !isFileMsg && !isAudioMsg && (
            <button
              onClick={() => { setEditContent(message.content); setEditing(true); }}
              className="absolute -left-8 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground transition-all"
            >
              <Pencil className="w-3 h-3" />
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
          <button
            onClick={() => {
              setContextMenu(null);
              onReply?.(message);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Reply className="w-4 h-4 text-blue-500" />
            Responder
          </button>
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
