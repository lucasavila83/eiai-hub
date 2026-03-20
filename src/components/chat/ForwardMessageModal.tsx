"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Forward,
  Hash,
  Lock,
  MessageSquare,
  Loader2,
  Search,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

interface Props {
  orgId: string;
  currentUserId: string;
  messageContent: string;
  senderName: string;
  onClose: () => void;
  onForwarded: () => void;
}

interface ChannelOption {
  id: string;
  name: string;
  type: "public" | "private" | "dm";
}

export function ForwardMessageModal({
  orgId,
  currentUserId,
  messageContent,
  senderName,
  onClose,
  onForwarded,
}: Props) {
  const supabase = createClient();
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    const { data } = await supabase
      .from("channel_members")
      .select("channel_id, channels:channel_id(id, name, type)")
      .eq("user_id", currentUserId);

    if (data) {
      const opts: ChannelOption[] = data
        .map((row: any) => row.channels)
        .filter(Boolean)
        .filter((ch: any) => ch.org_id === orgId || true) // already filtered by membership
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name || "DM",
          type: ch.type as ChannelOption["type"],
        }));

      // Sort: channels first, then DMs
      opts.sort((a, b) => {
        if (a.type === "dm" && b.type !== "dm") return 1;
        if (a.type !== "dm" && b.type === "dm") return -1;
        return a.name.localeCompare(b.name);
      });

      setChannels(opts);
    }
    setLoading(false);
  }

  async function handleForward(channelId: string) {
    setSending(true);
    setSelectedId(channelId);

    const content = `📨 **Encaminhada de ${senderName}:**\n${messageContent}`;

    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      user_id: currentUserId,
      content,
    });

    setSending(false);

    if (!error) {
      onForwarded();
      onClose();
    }
  }

  const filtered = channels.filter((ch) =>
    ch.name.toLowerCase().includes(search.toLowerCase())
  );

  function renderIcon(ch: ChannelOption) {
    if (ch.type === "dm") {
      return (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: generateColor(ch.name) }}
        >
          {getInitials(ch.name)}
        </div>
      );
    }
    if (ch.type === "private") {
      return <Lock className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
    return <Hash className="w-4 h-4 text-muted-foreground shrink-0" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Forward className="w-5 h-5 text-primary" />
            Encaminhar mensagem
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canal ou pessoa..."
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum canal encontrado
            </p>
          ) : (
            filtered.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleForward(ch.id)}
                disabled={sending}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  sending && selectedId === ch.id && "bg-accent"
                )}
              >
                {renderIcon(ch)}
                <span className="truncate font-medium text-foreground">
                  {ch.type === "dm" ? ch.name : ch.name}
                </span>
                {ch.type === "dm" && (
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                )}
                {sending && selectedId === ch.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Preview */}
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Pré-visualização:</p>
          <div className="bg-background border border-input rounded-lg px-3 py-2 text-xs text-muted-foreground line-clamp-3">
            📨 <strong>Encaminhada de {senderName}:</strong>{" "}
            {messageContent.length > 120
              ? messageContent.slice(0, 120) + "..."
              : messageContent}
          </div>
        </div>
      </div>
    </div>
  );
}
