"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot, Send, Loader2, X, Sparkles,
  Plus, FileText, ListChecks, ClipboardList, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

type InsertTarget = "description" | "subtask" | "checklist";

interface Props {
  cardTitle: string;
  cardDescription: string | null;
  subtasks: { title: string; is_completed: boolean }[];
  onClose: () => void;
  onInsertContent?: (content: string, target: InsertTarget) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    let content: any = line;
    content = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    content = content.replace(/_(.+?)_/g, "<em>$1</em>");
    content = content.replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>');
    if (line.match(/^[-•]\s/)) {
      content = "• " + content.slice(2);
    }
    return (
      <p
        key={i}
        className={cn("text-sm leading-relaxed", line === "" && "h-2")}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  });
}

const QUICK_PROMPTS = [
  { label: "Organizar tarefa", prompt: "Me ajude a organizar esta tarefa. Sugira subtarefas e um plano de ação." },
  { label: "Sugerir prioridade", prompt: "Qual deveria ser a prioridade desta tarefa e por quê?" },
  { label: "Criar checklist", prompt: "Crie um checklist detalhado para completar esta tarefa." },
  { label: "Estimar prazo", prompt: "Estime um prazo razoável para esta tarefa e explique." },
];

const INSERT_OPTIONS = [
  { target: "description" as InsertTarget, label: "Descrição", icon: FileText },
  { target: "subtask" as InsertTarget, label: "Subtarefas", icon: ListChecks },
  { target: "checklist" as InsertTarget, label: "Novo checklist", icon: ClipboardList },
];

export function AIAssistant({ cardTitle, cardDescription, subtasks, onClose, onInsertContent }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [insertMenuIdx, setInsertMenuIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close insert menu on click outside
  useEffect(() => {
    if (insertMenuIdx === null) return;
    function handleClick() { setInsertMenuIdx(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [insertMenuIdx]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          cardTitle,
          cardDescription,
          subtasks,
        }),
      });

      if (res.ok) {
        const { reply } = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro de conexão. Verifique sua internet." },
      ]);
    }

    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleInsert(content: string, target: InsertTarget) {
    setInsertMenuIdx(null);
    onInsertContent?.(content, target);
  }

  return (
    <div className="flex flex-col h-full max-h-[500px] bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Assistente IA</h3>
          <p className="text-[11px] text-muted-foreground">Ajuda a organizar sua tarefa</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Pergunte algo sobre a tarefa ou use um atalho:
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  className="text-xs px-2.5 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <div
              className={cn(
                "max-w-[90%]",
                msg.role === "user" ? "ml-auto" : "mr-auto"
              )}
            >
              <div
                className={cn(
                  "rounded-xl px-3 py-2",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>

              {/* Insert button for AI responses */}
              {msg.role === "assistant" && onInsertContent && (
                <div className="relative mt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInsertMenuIdx(insertMenuIdx === i ? null : i);
                    }}
                    className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Inserir na tarefa
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {insertMenuIdx === i && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {INSERT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.target}
                            onClick={() => handleInsert(msg.content, opt.target)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            <Icon className="w-4 h-4 text-primary" />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Pensando...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo sobre a tarefa..."
            rows={1}
            className="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring max-h-20"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className={cn(
              "p-2 rounded-lg transition-colors shrink-0",
              input.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
