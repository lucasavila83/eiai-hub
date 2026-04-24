"use client";

/**
 * /share
 *
 * Landing page after a Web Share Target POST. Reads the
 * __share_payload cookie (via /api/share/payload), shows the user
 * what was shared, and lets them pick a destination:
 *
 *   - Send to a chat channel or DM (appends file links as messages)
 *   - Attach to a card in one of their boards (inserts rows in
 *     card_attachments)
 *
 * On success we clear the cookie and navigate to the destination.
 */

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Kanban,
  Loader2,
  Image as ImageIcon,
  File as FileIcon,
  Search,
  Check,
  X,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUIStore } from "@/lib/stores/ui-store";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

interface SharedFile {
  path: string;
  name: string;
  size: number;
  type: string;
  publicUrl: string;
}

interface SharePayload {
  title: string;
  text: string;
  url: string;
  files: SharedFile[];
  createdAt: number;
}

type Mode = "pick" | "chat" | "card";

interface ChannelOption {
  id: string;
  name: string;
  type: "public" | "private" | "dm";
  otherUserName?: string;
  otherUserAvatar?: string | null;
}

interface BoardOption {
  id: string;
  name: string;
}

interface CardOption {
  id: string;
  title: string;
  board_id: string;
  board_name: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function SharePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrgId } = useUIStore();
  const supabase = useMemo(() => createClient(), []);

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("pick");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [cardsByBoard, setCardsByBoard] = useState<Record<string, CardOption[]>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // Load the payload stashed by /api/share
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/share/payload", { cache: "no-store" });
        const data = await res.json();
        setPayload(data.payload);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load destination options
  useEffect(() => {
    if (!user?.id || !activeOrgId) return;

    (async () => {
      // My channels + DMs (one trip)
      const { data: memberships } = await supabase
        .from("channel_members")
        .select("channel_id, is_hidden")
        .eq("user_id", user.id);
      const visibleIds = (memberships || [])
        .filter((m: any) => !m.is_hidden)
        .map((m: any) => m.channel_id);

      if (visibleIds.length > 0) {
        const { data: chans } = await supabase
          .from("channels")
          .select("id, name, type, channel_members(user_id, profiles:user_id(id, full_name, email, avatar_url))")
          .in("id", visibleIds)
          .eq("org_id", activeOrgId);

        if (chans) {
          const mapped: ChannelOption[] = chans.map((ch: any) => {
            if (ch.type === "dm") {
              const other = ch.channel_members?.find((m: any) => m.user_id !== user.id);
              const p = other?.profiles;
              return {
                id: ch.id,
                name: p?.full_name || p?.email || "Conversa",
                type: ch.type,
                otherUserName: p?.full_name || p?.email || "",
                otherUserAvatar: p?.avatar_url ?? null,
              };
            }
            return { id: ch.id, name: ch.name, type: ch.type };
          });
          mapped.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
          setChannels(mapped);
        }
      }

      // Boards the user can see
      const { data: boardRows } = await supabase
        .from("boards")
        .select("id, name")
        .eq("org_id", activeOrgId)
        .eq("is_archived", false)
        .order("name");
      if (boardRows) setBoards(boardRows as any);
    })();
  }, [user?.id, activeOrgId, supabase]);

  async function loadCardsForBoard(boardId: string) {
    if (cardsByBoard[boardId]) return;
    const { data } = await supabase
      .from("cards")
      .select("id, title, board_id, boards:board_id(name)")
      .eq("board_id", boardId)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data) {
      const mapped: CardOption[] = (data as any[]).map((c) => ({
        id: c.id,
        title: c.title,
        board_id: c.board_id,
        board_name: c.boards?.name || "",
      }));
      setCardsByBoard((prev) => ({ ...prev, [boardId]: mapped }));
    }
  }

  async function clearPayloadCookie() {
    try {
      await fetch("/api/share/clear", { method: "POST" });
    } catch {}
  }

  // ── Send to a chat channel / DM ───────────────────────────────
  async function sendToChannel(channelId: string) {
    if (!payload || !user?.id) return;
    setSending(true);
    try {
      const pieces: string[] = [];
      if (payload.title) pieces.push(`**${payload.title}**`);
      if (payload.text) pieces.push(payload.text);
      if (payload.url) pieces.push(payload.url);
      for (const f of payload.files) {
        const isImg = f.type.startsWith("image/");
        pieces.push(
          isImg
            ? `📎 **${f.name}**\n${f.publicUrl}`
            : `📎 Arquivo: **${f.name}**\n${f.publicUrl}`
        );
      }

      // Send each piece as its own message — keeps rich rendering working
      // for image previews without squashing everything into one blob.
      for (const content of pieces) {
        await supabase.from("messages").insert({
          channel_id: channelId,
          user_id: user.id,
          content,
          mentions: [],
        } as any);
      }

      await clearPayloadCookie();
      router.replace(`/chat/${channelId}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[share] sendToChannel failed:", err);
      alert("Não foi possível enviar para o chat. Tente novamente.");
      setSending(false);
    }
  }

  // ── Create a new card on a board, pre-filled with shared content ──
  async function createCardOnBoard(boardId: string) {
    if (!payload || !user?.id || !activeOrgId) return;
    setSending(true);
    try {
      // Need a column (status) to drop the card into — pick the leftmost
      // one. Boards don't have an is_archived flag on columns, so just
      // sort by position and grab the first.
      const { data: cols } = await supabase
        .from("columns")
        .select("id, position")
        .eq("board_id", boardId)
        .order("position", { ascending: true })
        .limit(1);
      const columnId = cols?.[0]?.id;
      if (!columnId) {
        alert("Esse board não tem colunas — crie uma primeiro em Boards.");
        setSending(false);
        return;
      }

      const firstFileName = payload.files[0]?.name;
      const title =
        payload.title?.slice(0, 120) ||
        payload.text?.split("\n")[0].slice(0, 120) ||
        firstFileName?.slice(0, 120) ||
        "Nova tarefa do compartilhamento";

      const descriptionParts: string[] = [];
      if (payload.text && payload.text !== title) descriptionParts.push(payload.text);
      if (payload.url) descriptionParts.push(payload.url);
      const description = descriptionParts.join("\n\n") || null;

      const { data: cardRow, error: cardErr } = await supabase
        .from("cards")
        .insert({
          board_id: boardId,
          column_id: columnId,
          title,
          description,
          created_by: user.id,
          position: 0,
        } as any)
        .select("id, board_id")
        .single();
      if (cardErr || !cardRow) throw cardErr || new Error("card insert failed");

      if (payload.files.length > 0) {
        const rows = payload.files.map((f) => ({
          card_id: (cardRow as any).id,
          file_url: f.publicUrl,
          file_name: f.name,
          file_size: f.size,
          file_type: f.type,
          uploaded_by: user.id,
        }));
        await supabase.from("card_attachments").insert(rows as any);
      }

      await clearPayloadCookie();
      // Pass ?card=<id> so BoardView auto-opens the detail modal — user
      // lands on the task they just created, with their attachment
      // already in place, ready to edit.
      router.replace(`/boards/${(cardRow as any).board_id}?card=${(cardRow as any).id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[share] createCardOnBoard failed:", err);
      alert("Não foi possível criar a tarefa. Tente novamente.");
      setSending(false);
    }
  }

  // ── Attach to an existing board card ──────────────────────────
  async function attachToCard(card: CardOption) {
    if (!payload || !user?.id) return;
    setSending(true);
    try {
      // If the user also shared text/url, drop them into the card description
      // as a lightweight comment rather than losing them.
      if ((payload.text || payload.url || payload.title) && payload.files.length === 0) {
        const body = [payload.title, payload.text, payload.url].filter(Boolean).join("\n\n");
        await supabase.from("card_comments").insert({
          card_id: card.id,
          user_id: user.id,
          content: body,
        } as any);
      }

      if (payload.files.length > 0) {
        const rows = payload.files.map((f) => ({
          card_id: card.id,
          file_url: f.publicUrl,
          file_name: f.name,
          file_size: f.size,
          file_type: f.type,
          uploaded_by: user.id,
        }));
        const { error } = await supabase.from("card_attachments").insert(rows as any);
        if (error) throw error;
      }

      await clearPayloadCookie();
      // Same as new-card flow: open the target card's detail modal so
      // the user can see/tweak the attachments they just added.
      router.replace(`/boards/${card.board_id}?card=${card.id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[share] attachToCard failed:", err);
      alert("Não foi possível anexar à tarefa. Tente novamente.");
      setSending(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!payload || (payload.files.length === 0 && !payload.text && !payload.url && !payload.title)) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nada para compartilhar. Abra um app, toque em "Compartilhar" e escolha o Lesco-Hub.
        </p>
        <button
          onClick={() => router.replace("/chat")}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Voltar ao chat
        </button>
      </div>
    );
  }

  const filteredChannels = channels.filter((c) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (c.name || "").toLowerCase().includes(q);
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {mode !== "pick" && (
          <button
            onClick={() => { setMode("pick"); setSelectedBoardId(null); setSearchTerm(""); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-lg md:text-xl font-bold text-foreground">Compartilhar</h1>
          <p className="text-xs text-muted-foreground">
            Onde você quer colocar {payload.files.length > 0 ? `estes ${payload.files.length === 1 ? "arquivo" : `${payload.files.length} arquivos`}` : "este conteúdo"}?
          </p>
        </div>
      </div>

      {/* What's being shared */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        {payload.title && (
          <p className="text-sm font-semibold text-foreground">{payload.title}</p>
        )}
        {payload.text && (
          <p className="text-sm text-foreground whitespace-pre-wrap">{payload.text}</p>
        )}
        {payload.url && (
          <a
            href={payload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline break-all block"
          >
            {payload.url}
          </a>
        )}
        {payload.files.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {payload.files.map((f) => {
              const isImg = f.type.startsWith("image/");
              return (
                <div
                  key={f.path}
                  className="relative bg-muted border border-border rounded-lg overflow-hidden aspect-square flex items-center justify-center"
                >
                  {isImg ? (
                    <img src={f.publicUrl} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-[10px] text-white font-medium truncate">{f.name}</p>
                    <p className="text-[9px] text-white/70">{humanSize(f.size)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Destination picker */}
      {mode === "pick" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => setMode("chat")}
            disabled={sending}
            className="bg-card border border-border hover:border-primary hover:bg-primary/5 rounded-xl p-5 text-left transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Enviar no chat</p>
            <p className="text-xs text-muted-foreground mt-1">
              Manda pra um canal, ou direto pra um membro.
            </p>
          </button>
          <button
            onClick={() => setMode("card")}
            disabled={sending}
            className="bg-card border border-border hover:border-primary hover:bg-primary/5 rounded-xl p-5 text-left transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
              <Kanban className="w-5 h-5 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Anexar em tarefa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Anexa em um card de algum board.
            </p>
          </button>
        </div>
      )}

      {/* Chat picker */}
      {mode === "chat" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar canal ou membro..."
              className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border max-h-[55vh] overflow-y-auto">
            {filteredChannels.length === 0 && (
              <p className="text-sm text-muted-foreground text-center p-6">
                Nenhum canal ou conversa encontrado.
              </p>
            )}
            {filteredChannels.map((c) => (
              <button
                key={c.id}
                onClick={() => sendToChannel(c.id)}
                disabled={sending}
                className="w-full flex items-center gap-3 p-3 hover:bg-accent text-left transition-colors disabled:opacity-50"
              >
                {c.type === "dm" ? (
                  c.otherUserAvatar ? (
                    <img
                      src={c.otherUserAvatar}
                      alt={c.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: generateColor(c.name) }}
                    >
                      {getInitials(c.name)}
                    </div>
                  )
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.type !== "dm" && <span className="text-muted-foreground">#</span>}
                    {c.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {c.type === "dm" ? "Mensagem direta" : c.type === "private" ? "Canal privado" : "Canal público"}
                  </p>
                </div>
                {sending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Card picker */}
      {mode === "card" && (
        <div className="space-y-3">
          {!selectedBoardId ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Escolha o board</p>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border max-h-[55vh] overflow-y-auto">
                {boards.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center p-6">Você não tem boards acessíveis.</p>
                )}
                {boards.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedBoardId(b.id);
                      loadCardsForBoard(b.id);
                    }}
                    disabled={sending}
                    className="w-full flex items-center gap-3 p-3 hover:bg-accent text-left transition-colors disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Kanban className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground truncate flex-1">{b.name}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Escolha a tarefa em {boards.find((b) => b.id === selectedBoardId)?.name}
                </p>
                <button
                  onClick={() => setSelectedBoardId(null)}
                  className="text-xs text-primary hover:underline"
                >
                  Trocar board
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar tarefa..."
                  className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <button
                onClick={() => createCardOnBoard(selectedBoardId)}
                disabled={sending}
                className="w-full flex items-center gap-3 p-3 bg-primary/5 hover:bg-primary/10 border border-primary/30 border-dashed rounded-xl text-left transition-colors disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Kanban className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">Criar nova tarefa com este conteúdo</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {payload.files.length > 0
                      ? `Anexa ${payload.files.length === 1 ? "1 arquivo" : `${payload.files.length} arquivos`} e cria a tarefa aqui`
                      : "Cria uma tarefa a partir do texto compartilhado"}
                  </p>
                </div>
                {sending && <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />}
              </button>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border max-h-[55vh] overflow-y-auto">
                {!cardsByBoard[selectedBoardId] ? (
                  <div className="flex items-center justify-center p-6">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {(cardsByBoard[selectedBoardId] || [])
                      .filter((c) => !searchTerm || c.title.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => attachToCard(c)}
                          disabled={sending}
                          className="w-full flex items-center gap-3 p-3 hover:bg-accent text-left transition-colors disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-foreground truncate flex-1">{c.title}</p>
                          {sending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                        </button>
                      ))}
                    {(cardsByBoard[selectedBoardId]?.length || 0) === 0 && (
                      <p className="text-sm text-muted-foreground text-center p-6">
                        Esse board não tem tarefas ativas.
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cancel */}
      <div className="flex justify-end">
        <button
          onClick={async () => { await clearPayloadCookie(); router.replace("/chat"); }}
          disabled={sending}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
}
