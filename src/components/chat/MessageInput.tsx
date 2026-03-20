"use client";

import { useState, useRef, KeyboardEvent } from "react";
import {
  Send, Paperclip, Smile, Bold, Italic,
  Code, ListTodo, AtSign, X,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface Props {
  onSend: (content: string) => Promise<void>;
  channelName: string;
  onCreateTask?: (title: string) => Promise<void>;
  isDM?: boolean;
}

export function MessageInput({ onSend, channelName, onCreateTask, isDM }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    // Show commands popup when typing /
    if (e.key === "/" && content === "") {
      setShowCommands(true);
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

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !onCreateTask) return;
    setCreatingTask(true);
    await onCreateTask(taskTitle.trim());
    setTaskTitle("");
    setShowTaskInput(false);
    setCreatingTask(false);
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
            onClick={() => insertFormatting("@", "")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
            title="Mencionar"
          >
            <AtSign className="w-3.5 h-3.5" />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
            title="Anexar arquivo"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
            title="Emoji"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Text area */}
        <div className="flex items-end gap-2 p-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
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
      <p className="text-xs text-muted-foreground mt-1 ml-2">
        Enter enviar &middot; Shift+Enter nova linha &middot; <code className="bg-muted px-1 rounded">/tarefa</code> criar tarefa
      </p>
    </div>
  );
}
