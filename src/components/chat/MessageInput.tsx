"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  Send, Paperclip, Smile, Bold, Italic,
  Code, ListTodo, AtSign, X, Mic, FileText, Image as ImageIcon, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { useUIStore } from "@/lib/stores/ui-store";
import { EmojiPicker } from "./EmojiPicker";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { AudioRecorder } from "./AudioRecorder";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_PENDING_FILES = 5;

interface PendingFile {
  file: File;
  preview: string | null;
  error: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  onSend: (content: string) => Promise<void>;
  channelName: string;
  onCreateTask?: (title: string) => Promise<void>;
  isDM?: boolean;
  channelId?: string;
  orgId?: string;
  currentUserId?: string;
  focusTrigger?: number;
}

export function MessageInput({ onSend, channelName, onCreateTask, isDM, channelId, orgId, currentUserId, focusTrigger }: Props) {
  const isMobile = useUIStore((s) => s.isMobile);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Auto-focus textarea when switching channels or when reply is triggered
  useEffect(() => {
    // Small delay to ensure DOM is ready after navigation
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [channelId, focusTrigger]);

  // Load org members for @mentions
  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    supabase
      .from("org_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email)")
      .eq("org_id", orgId)
      .then(({ data }) => {
        if (data) setOrgMembers(data);
      });
  }, [orgId]);

  function addPendingFiles(newFiles: File[]) {
    setPendingFiles((prev) => {
      const remaining = MAX_PENDING_FILES - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = newFiles.slice(0, remaining);
      const entries: PendingFile[] = toAdd.map((file) => {
        if (file.size > MAX_FILE_SIZE) {
          return { file, preview: null, error: "Muito grande (max. 200MB)" };
        }
        return { file, preview: null, error: null };
      });
      // Generate previews for images
      entries.forEach((entry, i) => {
        if (!entry.error && entry.file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setPendingFiles((curr) => {
              const idx = prev.length + i;
              if (idx >= curr.length) return curr;
              const updated = [...curr];
              updated[idx] = { ...updated[idx], preview: ev.target?.result as string };
              return updated;
            });
          };
          reader.readAsDataURL(entry.file);
        }
      });
      return [...prev, ...entries];
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    const trimmed = content.trim();
    const validFiles = pendingFiles.filter((f) => !f.error);
    if ((!trimmed && validFiles.length === 0) || sending) return;

    // Check for /tarefa command
    if (trimmed.startsWith("/tarefa ")) {
      const title = trimmed.slice(8).trim();
      if (title && onCreateTask) {
        setSending(true);
        await onCreateTask(title);
        setContent("");
        setSending(false);
        textareaRef.current?.focus();
        return;
      }
    }

    // Capture what we're sending BEFORE clearing, so we can restore on error
    const contentToSend = trimmed;
    const filesToSend = validFiles;

    setSending(true);

    try {
      // Upload pending files first
      if (filesToSend.length > 0 && channelId) {
        const supabase = createClient();
        for (const entry of filesToSend) {
          const timestamp = Date.now();
          const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${channelId}/${timestamp}_${safeName}`;

          const { error: uploadError } = await supabase.storage
            .from("chat-files")
            .upload(path, entry.file, { contentType: entry.file.type, upsert: false });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from("chat-files").getPublicUrl(path);
          const label = entry.file.type.startsWith("image/")
            ? `📎 **${entry.file.name}**\n${publicUrl}`
            : `📎 Arquivo: **${entry.file.name}**\n${publicUrl}`;
          await onSend(label);
        }
      }

      // Send text message (if any)
      if (contentToSend) {
        await onSend(contentToSend);
      }

      // Only clear the input on successful send — never before.
      // Previously we cleared content BEFORE the await and any failure
      // (network glitch, rate limit, concurrent polling collision) silently
      // wiped the user's text. Now the draft stays in the input until the
      // message is actually on the server.
      setContent("");
      setPendingFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      console.error("Erro ao enviar:", err);
      alert(
        "Não foi possível enviar a mensagem. Seu texto continua no campo — tente de novo.\n\n" +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !showMention) {
      e.preventDefault();
      handleSend();
    }

    // Show commands popup when typing /
    if (e.key === "/" && content === "") {
      setShowCommands(true);
    }

    // Close mention on escape
    if (e.key === "Escape") {
      setShowMention(false);
      setShowEmoji(false);
    }
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);

    // Detect @mention
    const ta = textareaRef.current;
    if (ta) {
      const cursor = ta.selectionStart;
      const textBefore = val.slice(0, cursor);
      const atMatch = textBefore.match(/@(\w*)$/);
      if (atMatch) {
        setShowMention(true);
        setMentionSearch(atMatch[1]);
      } else {
        setShowMention(false);
      }
    }
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";

    // Hide commands popup if user deletes the /
    if (!ta.value.startsWith("/")) {
      setShowCommands(false);
    }
  }

  function insertFormatting(prefix: string, suffix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = `${before}${prefix}${selected || "texto"}${suffix}${after}`;
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + (selected || "texto").length);
    }, 0);
  }

  function handleEmojiSelect(emoji: string) {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const before = content.slice(0, start);
      const after = content.slice(start);
      setContent(before + emoji + after);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setContent(content + emoji);
    }
    setShowEmoji(false);
  }

  function handleMentionSelect(member: any) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const textBefore = content.slice(0, cursor);
    const textAfter = content.slice(cursor);
    const atIndex = textBefore.lastIndexOf("@");
    const name = member.profiles?.full_name || member.profiles?.email || "user";
    const newContent = textBefore.slice(0, atIndex) + `@${name} ` + textAfter;
    setContent(newContent);
    setShowMention(false);
    setTimeout(() => {
      ta.focus();
      const newCursor = atIndex + name.length + 2;
      ta.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function handleAudioSent(audioUrl: string, transcript: string | null, duration: number) {
    setShowAudioRecorder(false);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationStr = `${mins}:${String(secs).padStart(2, "0")}`;
    let message = `🎙️ **Áudio** (${durationStr})\n${audioUrl}`;
    if (transcript) {
      message += `\n\n📝 _${transcript}_`;
    }
    onSend(message);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !onCreateTask) return;
    setCreatingTask(true);
    await onCreateTask(taskTitle.trim());
    setTaskTitle("");
    setShowTaskInput(false);
    setCreatingTask(false);
  }

  // Handle paste — detect files from clipboard and stage them
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items || !channelId) return;

    const filesToAdd: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) filesToAdd.push(file);
      }
    }
    if (filesToAdd.length > 0) {
      e.preventDefault();
      addPendingFiles(filesToAdd);
    }
  }

  function handleCommandSelect(cmd: string) {
    setShowCommands(false);
    if (cmd === "tarefa") {
      setShowTaskInput(true);
      setTimeout(() => taskInputRef.current?.focus(), 100);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files.length > 0 && channelId) {
      addPendingFiles(Array.from(files));
    }
  }

  return (
    <div
      className="p-4 shrink-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Task creation inline */}
      {showTaskInput && (
        <div className="mb-2 bg-card border border-primary/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <ListTodo className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Criar tarefa</span>
            <button
              onClick={() => setShowTaskInput(false)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateTask} className="flex gap-2">
            <input
              ref={taskInputRef}
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={isDM ? `Criar tarefa para ${channelName}...` : "Título da tarefa..."}
              className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              type="submit"
              disabled={creatingTask || !taskTitle.trim()}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {creatingTask ? "Criando..." : "Criar"}
            </button>
          </form>
          {isDM && (
            <p className="text-xs text-muted-foreground mt-1.5">
              A tarefa será atribuída automaticamente a {channelName}
            </p>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-xl backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Paperclip className="w-8 h-8 text-primary" />
            <span className="text-sm font-medium text-primary">Solte o arquivo aqui</span>
          </div>
        </div>
      )}

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 bg-card border border-border rounded-xl p-2">
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "relative group flex items-center gap-2 rounded-lg p-1.5 pr-7 max-w-[220px]",
                  entry.error ? "bg-red-500/10 border border-red-500/20" : "bg-muted"
                )}
              >
                {entry.preview ? (
                  <img src={entry.preview} alt={entry.file.name} className="w-10 h-10 object-cover rounded-md border border-border" />
                ) : entry.file.type.startsWith("image/") ? (
                  <div className="w-10 h-10 flex items-center justify-center bg-primary/5 rounded-md border border-border shrink-0">
                    <ImageIcon className="w-5 h-5 text-primary" />
                  </div>
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 dark:bg-orange-500/10 rounded-md border border-border shrink-0">
                    <FileText className="w-5 h-5 text-orange-500" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{entry.file.name}</p>
                  <p className={cn("text-[10px]", entry.error ? "text-red-500" : "text-muted-foreground")}>
                    {entry.error || formatFileSize(entry.file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removePendingFile(i)}
                  className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground/70 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {pendingFiles.length < MAX_PENDING_FILES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 flex items-center justify-center border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-colors text-muted-foreground hover:text-primary"
                title="Adicionar mais arquivos"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input for paperclip / add more */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) addPendingFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Audio recorder inline */}
      {showAudioRecorder && channelId && (
        <div className="mb-2">
          <AudioRecorder
            channelId={channelId}
            onAudioSent={handleAudioSent}
            onClose={() => setShowAudioRecorder(false)}
          />
        </div>
      )}

      {/* Commands popup */}
      {showCommands && (
        <div className="mb-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Comandos
          </div>
          <button
            onClick={() => handleCommandSelect("tarefa")}
            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent text-left transition-colors"
          >
            <ListTodo className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">/tarefa</p>
              <p className="text-xs text-muted-foreground">
                Criar tarefa {isDM ? `para ${channelName}` : "no board"}
              </p>
            </div>
          </button>
        </div>
      )}

      <div className="relative">
        {/* Emoji Picker */}
        {showEmoji && (
          <div className="absolute bottom-full mb-2 right-0 z-50">
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmoji(false)}
            />
          </div>
        )}

        {/* Mention Autocomplete */}
        {showMention && orgMembers.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 z-50">
            <MentionAutocomplete
              members={orgMembers}
              search={mentionSearch}
              onSelect={handleMentionSelect}
              onClose={() => setShowMention(false)}
            />
          </div>
        )}

        <div className="bg-muted border border-border rounded-xl">
          {/* Formatting toolbar */}
          <div className={cn("flex items-center px-2 border-b border-border/50", isMobile ? "gap-1 py-1.5" : "gap-0.5 py-1")}>
            <button
              onClick={() => insertFormatting("**", "**")}
              className={cn("text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent", isMobile ? "p-2" : "p-1")}
              title="Negrito"
            >
              <Bold className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <button
              onClick={() => insertFormatting("_", "_")}
              className={cn("text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent", isMobile ? "p-2" : "p-1")}
              title="Itálico"
            >
              <Italic className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <button
              onClick={() => insertFormatting("`", "`")}
              className={cn("text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent", isMobile ? "p-2" : "p-1")}
              title="Código"
            >
              <Code className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <div className={cn("w-px bg-border", isMobile ? "h-5 mx-1.5" : "h-4 mx-1")} />
            <button
              onClick={() => {
                setShowTaskInput(true);
                setTimeout(() => taskInputRef.current?.focus(), 100);
              }}
              className={cn("text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent", isMobile ? "p-2" : "p-1")}
              title="Criar tarefa"
            >
              <ListTodo className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <button
              onClick={() => {
                const ta = textareaRef.current;
                if (ta) {
                  const start = ta.selectionStart;
                  const before = content.slice(0, start);
                  const after = content.slice(start);
                  setContent(before + "@" + after);
                  setShowMention(true);
                  setMentionSearch("");
                  setTimeout(() => {
                    ta.focus();
                    ta.setSelectionRange(start + 1, start + 1);
                  }, 0);
                }
              }}
              className={cn("text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent", isMobile ? "p-2" : "p-1")}
              title="Mencionar"
            >
              <AtSign className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent",
                isMobile ? "p-2" : "p-1",
                pendingFiles.length > 0 && "text-primary bg-primary/10"
              )}
              title="Anexar arquivo"
            >
              <Paperclip className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent",
                isMobile ? "p-2" : "p-1",
                showEmoji && "text-primary bg-primary/10"
              )}
              title="Emoji"
            >
              <Smile className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
            <div className={cn("w-px bg-border", isMobile ? "h-5 mx-1.5" : "h-4 mx-1")} />
            <button
              onClick={() => setShowAudioRecorder(!showAudioRecorder)}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent",
                isMobile ? "p-2" : "p-1",
                showAudioRecorder && "text-red-500 bg-red-500/10"
              )}
              title="Gravar áudio"
            >
              <Mic className={isMobile ? "w-5 h-5" : "w-3.5 h-3.5"} />
            </button>
          </div>

          {/* Text area */}
          <div className={cn("flex items-center gap-2", isMobile ? "p-3" : "p-2")}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              placeholder={isDM ? `Escreva para ${channelName}...` : `Mensagem em #${channelName}`}
              rows={1}
              className={cn(
                "flex-1 bg-transparent text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-48 py-1",
                isMobile ? "text-base" : "text-sm"
              )}
            />

            <button
              onClick={handleSend}
              disabled={(!content.trim() && pendingFiles.filter(f => !f.error).length === 0) || sending}
              className={cn(
                "rounded-lg transition-colors shrink-0 self-center",
                isMobile ? "p-3" : "p-2",
                (content.trim() || pendingFiles.filter(f => !f.error).length > 0)
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground cursor-not-allowed"
              )}
            >
              {sending ? (
                <Loader2 className={cn("animate-spin", isMobile ? "w-5 h-5" : "w-4 h-4")} />
              ) : (
                <Send className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
              )}
            </button>
          </div>
        </div>
      </div>
      {!isMobile && (
        <p className="text-xs text-muted-foreground mt-1 ml-2">
          Enter enviar &middot; Shift+Enter nova linha &middot; <code className="bg-muted px-1 rounded">/tarefa</code> criar tarefa &middot; <code className="bg-muted px-1 rounded">@</code> mencionar
        </p>
      )}
    </div>
  );
}
