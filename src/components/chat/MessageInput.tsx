"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  Send, Paperclip, Smile, Bold, Italic,
  Code, ListTodo, AtSign, X, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { EmojiPicker } from "./EmojiPicker";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { FileUpload } from "./FileUpload";
import { AudioRecorder } from "./AudioRecorder";
import { createClient } from "@/lib/supabase/client";

interface Props {
  onSend: (content: string) => Promise<void>;
  channelName: string;
  onCreateTask?: (title: string) => Promise<void>;
  isDM?: boolean;
  channelId?: string;
  orgId?: string;
  currentUserId?: string;
}

export function MessageInput({ onSend, channelName, onCreateTask, isDM, channelId, orgId, currentUserId }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

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

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

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

    setSending(true);
    setContent("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await onSend(trimmed);
    setSending(false);
    textareaRef.current?.focus();
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

  function handleFileUploaded(fileUrl: string, fileName: string, fileType: string) {
    setShowFileUpload(false);
    if (fileType.startsWith("image/")) {
      onSend(`📎 **${fileName}**\n${fileUrl}`);
    } else {
      onSend(`📎 Arquivo: **${fileName}**\n${fileUrl}`);
    }
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

  // Handle paste — detect images from clipboard and upload
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items || !channelId) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;

        // Max 10MB
        if (file.size > 10 * 1024 * 1024) return;

        setSending(true);
        try {
          const supabase = createClient();
          const timestamp = Date.now();
          const ext = file.type.split("/")[1] || "png";
          const fileName = `screenshot_${timestamp}.${ext}`;
          const path = `${channelId}/${timestamp}_${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("chat-files")
            .upload(path, file, { contentType: file.type, upsert: false });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from("chat-files").getPublicUrl(path);
          await onSend(`📎 **${fileName}**\n${publicUrl}`);
        } catch (err) {
          console.error("Erro ao colar imagem:", err);
        } finally {
          setSending(false);
        }
        return;
      }
    }
  }

  function handleCommandSelect(cmd: string) {
    setShowCommands(false);
    if (cmd === "tarefa") {
      setShowTaskInput(true);
      setTimeout(() => taskInputRef.current?.focus(), 100);
    }
  }

  return (
    <div className="p-4 shrink-0">
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

      {/* File upload inline */}
      {showFileUpload && channelId && (
        <div className="mb-2">
          <FileUpload
            channelId={channelId}
            onFileUploaded={handleFileUploaded}
            onClose={() => setShowFileUpload(false)}
          />
        </div>
      )}

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
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50">
            <button
              onClick={() => insertFormatting("**", "**")}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
              title="Negrito"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting("_", "_")}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
              title="Itálico"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting("`", "`")}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
              title="Código"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => {
                setShowTaskInput(true);
                setTimeout(() => taskInputRef.current?.focus(), 100);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
              title="Criar tarefa"
            >
              <ListTodo className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                // Insert @ and trigger mention
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
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
              title="Mencionar"
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowFileUpload(!showFileUpload)}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent",
                showFileUpload && "text-primary bg-primary/10"
              )}
              title="Anexar arquivo"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent",
                showEmoji && "text-primary bg-primary/10"
              )}
              title="Emoji"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => { setShowAudioRecorder(!showAudioRecorder); setShowFileUpload(false); }}
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent",
                showAudioRecorder && "text-red-500 bg-red-500/10"
              )}
              title="Gravar áudio"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text area */}
          <div className="flex items-end gap-2 p-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              placeholder={isDM ? `Escreva para ${channelName}...` : `Mensagem em #${channelName}`}
              rows={1}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-48 py-1"
            />

            <button
              onClick={handleSend}
              disabled={!content.trim() || sending}
              className={cn(
                "p-1.5 rounded-lg transition-colors shrink-0",
                content.trim()
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 ml-2">
        Enter enviar &middot; Shift+Enter nova linha &middot; <code className="bg-muted px-1 rounded">/tarefa</code> criar tarefa &middot; <code className="bg-muted px-1 rounded">@</code> mencionar
      </p>
    </div>
  );
}
