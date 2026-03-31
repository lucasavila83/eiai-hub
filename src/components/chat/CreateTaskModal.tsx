"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, ListTodo, Calendar, Users,
  Kanban, ChevronDown, Paperclip, FileText,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

// Detect file attachment in message content (also works inside forwarded messages)
const FILE_URL_REGEX = /📎\s*(?:Arquivo:\s*)?\*\*(.+?)\*\*\s*\n?(https?:\/\/\S+)/s;

function guessFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    csv: "text/csv", txt: "text/plain", zip: "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

interface Props {
  orgId: string;
  currentUserId: string;
  defaultTitle?: string;
  defaultAssigneeId?: string; // for DMs — pre-select the other user
  targetUserId?: string; // DM 1-on-1: show boards where this user is a member
  onClose: () => void;
  onCreated: (card: any, assigneeName?: string, extra?: { boardName?: string; columnName?: string }) => void;
}

export function CreateTaskModal({
  orgId,
  currentUserId,
  defaultTitle = "",
  defaultAssigneeId,
  targetUserId,
  onClose,
  onCreated,
}: Props) {
  const supabase = createClient();

  // Extract file info if the message is a file attachment
  const fileMatch = defaultTitle.match(FILE_URL_REGEX);
  const attachmentFile = fileMatch ? { name: fileMatch[1], url: fileMatch[2] } : null;
  const cleanTitle = attachmentFile ? attachmentFile.name : defaultTitle.split("\n")[0].slice(0, 100);

  const [title, setTitle] = useState(cleanTitle);
  const [dueDate, setDueDate] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(defaultAssigneeId ? [defaultAssigneeId] : []);
  const [boards, setBoards] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      loadColumns(selectedBoardId);
      loadBoardMembers(selectedBoardId);
    }
  }, [selectedBoardId]);

  async function loadData() {
    // In DM 1-on-1: show boards where the TARGET user is a member
    // Otherwise: show boards where the CURRENT user is a member
    const lookupUserId = targetUserId || currentUserId;

    const [boardsRes, memberBoardsRes] = await Promise.all([
      supabase
        .from("boards")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("board_members")
        .select("board_id")
        .eq("user_id", lookupUserId),
    ]);

    if (boardsRes.data) {
      // Filter boards: only show boards where the target/current user is a member
      const memberBoardIds = new Set(
        (memberBoardsRes.data || []).map((bm: any) => bm.board_id)
      );
      const filtered = memberBoardIds.size > 0
        ? boardsRes.data.filter((b: any) => memberBoardIds.has(b.id))
        : boardsRes.data;
      setBoards(filtered);
      if (filtered.length > 0) {
        setSelectedBoardId(filtered[0].id);
      }
    }
    setLoadingData(false);
  }

  async function loadBoardMembers(boardId: string) {
    // Load only members of the selected board, not all org members
    const { data } = await supabase
      .from("board_members")
      .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email)")
      .eq("board_id", boardId);

    if (data && data.length > 0) {
      setMembers(data as any);
    } else {
      // Fallback: if board has no members, show org members
      const { data: orgData } = await supabase
        .from("org_members")
        .select("user_id, role, profiles:user_id(id, full_name, avatar_url, email)")
        .eq("org_id", orgId);
      setMembers(orgData || []);
    }
    // Clear assignees that are no longer in the board
    setSelectedAssigneeIds((prev) => {
      const memberIds = new Set((data || []).map((m: any) => m.user_id));
      return prev.filter((id) => memberIds.has(id));
    });
  }

  async function loadColumns(boardId: string) {
    const { data } = await supabase
      .from("columns")
      .select("id, name, color, position")
      .eq("board_id", boardId)
      .order("position");

    if (data) {
      setColumns(data);
      if (data.length > 0) {
        setSelectedColumnId(data[0].id);
      }
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !selectedBoardId || !selectedColumnId || !dueDate) return;
    setLoading(true);

    // Get max position in column
    const { data: existingCards } = await supabase
      .from("cards")
      .select("position")
      .eq("column_id", selectedColumnId)
      .order("position", { ascending: false })
      .limit(1);

    const position = existingCards?.[0]?.position != null
      ? existingCards[0].position + 1
      : 0;

    const { data: card, error } = await supabase
      .from("cards")
      .insert({
        column_id: selectedColumnId,
        board_id: selectedBoardId,
        title: title.trim(),
        due_date: dueDate || null,
        priority: "none",
        created_by: currentUserId,
        position,
        is_archived: false,
        metadata: {},
      })
      .select()
      .single();

    if (error || !card) {
      setLoading(false);
      return;
    }

    // Auto-attach file if task was created from a file message
    if (attachmentFile) {
      await supabase.from("card_attachments").insert({
        card_id: card.id,
        file_url: attachmentFile.url,
        file_name: attachmentFile.name,
        file_size: 0,
        file_type: guessFileType(attachmentFile.name),
        uploaded_by: currentUserId,
      });
    }

    let assigneeName: string | undefined;

    // Assign to selected members
    if (selectedAssigneeIds.length > 0) {
      await supabase.from("card_assignees").insert(
        selectedAssigneeIds.map((uid) => ({ card_id: card.id, user_id: uid }))
      );

      // Get first assignee name for display
      const firstMember = members.find((m: any) => m.user_id === selectedAssigneeIds[0]);
      assigneeName = firstMember?.profiles?.full_name || firstMember?.profiles?.email;
      if (selectedAssigneeIds.length > 1) {
        assigneeName = `${assigneeName} +${selectedAssigneeIds.length - 1}`;
      }

      // Send DM notification to each assignee
      for (const uid of selectedAssigneeIds) {
        const member = members.find((m: any) => m.user_id === uid);
        const name = member?.profiles?.full_name || member?.profiles?.email || "";
        await sendTaskNotification(card, name, uid);
      }
    }

    // Mirror to hub boards (fire-and-forget)
    fetch("/api/cards/mirror", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: card.id, board_id: selectedBoardId }),
    }).catch(() => {});

    // Sync due date to Google Calendar of assignees (fire-and-forget)
    if (card.due_date) {
      fetch("/api/cards/gcal-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      }).catch(() => {});
    }

    const board = boards.find((b) => b.id === selectedBoardId);
    const column = columns.find((c) => c.id === selectedColumnId);

    setLoading(false);
    onCreated(card, assigneeName, {
      boardName: board?.name,
      columnName: column?.name,
    });
  }

  async function sendTaskNotification(card: any, assigneeName: string, assigneeId: string) {
    if (!assigneeId || assigneeId === currentUserId) return;

    // Find or create DM channel with assignee
    const { data: existingDMs } = await supabase
      .from("channels")
      .select("id, channel_members!inner(user_id)")
      .eq("type", "dm")
      .eq("org_id", orgId);

    let dmChannelId: string | null = null;

    if (existingDMs) {
      for (const ch of existingDMs) {
        const memberIds = (ch as any).channel_members?.map((m: any) => m.user_id) || [];
        if (memberIds.includes(currentUserId) && memberIds.includes(assigneeId)) {
          dmChannelId = ch.id;
          break;
        }
      }
    }

    // If no existing DM, create one
    if (!dmChannelId) {
      const { data: newDM } = await supabase
        .from("channels")
        .insert({
          org_id: orgId,
          name: assigneeName,
          type: "dm",
          created_by: currentUserId,
          is_archived: false,
        })
        .select()
        .single();

      if (newDM) {
        dmChannelId = newDM.id;
        const now = new Date().toISOString();
        await supabase.from("channel_members").insert([
          { channel_id: newDM.id, user_id: currentUserId, last_read_at: now, notifications: "all" },
          { channel_id: newDM.id, user_id: assigneeId, last_read_at: now, notifications: "all" },
        ]);
      }
    }

    if (!dmChannelId) return;

    // Get board and column names
    const board = boards.find((b) => b.id === selectedBoardId);
    const column = columns.find((c) => c.id === selectedColumnId);

    // Build task summary message
    let msg = `📋 **Nova tarefa atribuída a você:**\n`;
    msg += `\n**${card.title}**`;
    if (board) msg += `\n📌 Board: ${board.name}`;
    if (column) msg += `\n📊 Coluna: ${column.name}`;
    if (card.due_date) msg += `\n📅 Prazo: ${new Date(card.due_date).toLocaleDateString("pt-BR")}`;

    await supabase.from("messages").insert({
      channel_id: dmChannelId,
      user_id: currentUserId,
      content: msg,
      mentions: [assigneeId],
    });
  }

  const toggleAssignee = (uid: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  if (loadingData) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative bg-card border border-border rounded-xl p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            Criar Tarefa
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Título da tarefa</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              required
            />
          </div>

          {/* Attachment preview */}
          {attachmentFile && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <Paperclip className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{attachmentFile.name}</p>
                <p className="text-xs text-muted-foreground">Será anexado automaticamente à tarefa</p>
              </div>
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          )}

          {/* Board */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Kanban className="w-4 h-4 text-muted-foreground" />
              Board
            </label>
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {boards.length === 0 && (
              <p className="text-xs text-destructive">Crie um board primeiro em Boards</p>
            )}
          </div>

          {/* Column (Funil) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Coluna / Funil</label>
            <div className="flex gap-2 flex-wrap">
              {columns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setSelectedColumnId(col.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                    selectedColumnId === col.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: col.color }}
                  />
                  {col.name}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date (required) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Prazo de entrega <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className={cn(
                "w-full px-3 py-2 bg-background border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                !dueDate ? "border-destructive/50" : "border-input"
              )}
            />
            {!dueDate && (
              <p className="text-xs text-destructive">Obrigatório</p>
            )}
          </div>

          {/* Assign to */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4 text-muted-foreground" />
              Atribuir a
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {members.map((m: any) => {
                const p = m.profiles;
                const memberName = p?.full_name || p?.email || "?";
                const isSelected = selectedAssigneeIds.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleAssignee(m.user_id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm border transition-all text-left",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    {p?.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={memberName}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: generateColor(memberName) }}
                      >
                        {getInitials(memberName)}
                      </div>
                    )}
                    <span className="truncate">{memberName}</span>
                  </button>
                );
              })}
            </div>
            {selectedAssigneeIds.length > 0 && selectedAssigneeIds.some((id) => id !== currentUserId) && (
              <p className="text-xs text-primary">
                Uma mensagem automática será enviada no DM de cada responsável
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || !title.trim() || !selectedBoardId || !selectedColumnId}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Tarefa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
