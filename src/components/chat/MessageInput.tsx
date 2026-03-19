"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send, Paperclip, Smile } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface Props {
  onSend: (content: string) => Promise<void>;
  channelName: string;
}

export function MessageInput({ onSend, channelName }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

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
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  return (
    <div className="p-4 shrink-0">
      <div className="flex items-end gap-2 bg-muted border border-border rounded-xl p-2">
        <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 shrink-0">
          <Paperclip className="w-4 h-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={`Mensagem em #${channelName}`}
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-48 py-1"
        />

        <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 shrink-0">
          <Smile className="w-4 h-4" />
        </button>

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
      <p className="text-xs text-muted-foreground mt-1 ml-2">
        Enter para enviar, Shift+Enter para nova linha
      </p>
    </div>
  );
}
