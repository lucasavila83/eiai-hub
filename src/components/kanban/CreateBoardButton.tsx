"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Loader2, Globe, Lock, Users, Check } from "lucide-react";

interface Props {
  orgId: string;
}

type Visibility = "public" | "private" | "team";

interface MemberOption {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export function CreateBoardButton({ orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [loading, setLoading] = useState(false);
  const [orgMembers, setOrgMembers] = useState<MemberOption[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const membersRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load org members when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("user_id, profiles:user_id(id, full_name, avatar_url, email)")
        .eq("org_id", orgId);
      if (data) {
        setOrgMembers(
          data.map((m: any) => ({
            user_id: m.user_id,
            full_name: m.profiles?.full_name || m.profiles?.email || "Sem nome",
            email: m.profiles?.email || "",
            avatar_url: m.profiles?.avatar_url || null,
          }))
        );
      }
    })();
  }, [open, orgId]);

  // Click outside to close members dropdown
  useEffect(() => {
    if (!showMembers) return;
    function handleClick(e: MouseEvent) {
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) {
        setShowMembers(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMembers]);

  function toggleMember(userId: string) {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const currentUser = (await supabase.auth.getUser()).data.user;
    const userId = currentUser?.id ?? null;

    const { data: board, error } = await supabase
      .from("boards")
      .insert({
        org_id: orgId,
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        is_archived: false,
        settings: {},
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      setLoading(false);
      return;
    }

    if (board) {
      // Create default columns
      const defaultColumns = [
        { name: "A Fazer", position: 0, color: "#6366f1" },
        { name: "Em Progresso", position: 1, color: "#f59e0b" },
        { name: "Concluído", position: 2, color: "#22c55e", is_done_column: true },
      ];

      await supabase.from("columns").insert(
        defaultColumns.map((col) => ({
          board_id: board.id,
          name: col.name,
          position: col.position,
          color: col.color,
          is_done_column: col.is_done_column ?? false,
        }))
      );

      // Add creator as admin member
      if (userId) {
        await supabase.from("board_members").insert({
          board_id: board.id,
          user_id: userId,
          role: "admin",
        }).then(() => {});
      }

      // Add selected members
      if (selectedMembers.length > 0) {
        const membersToAdd = selectedMembers
          .filter((id) => id !== userId) // Don't duplicate creator
          .map((id) => ({
            board_id: board.id,
            user_id: id,
            role: "member" as const,
          }));

        if (membersToAdd.length > 0) {
          await supabase.from("board_members").insert(membersToAdd);
        }
      }

      setOpen(false);
      setName("");
      setDescription("");
      setVisibility("public");
      setSelectedMembers([]);
      setLoading(false);
      router.push(`/boards/${board.id}`);
      router.refresh();
    }
  }

  const visibilityOptions = [
    { value: "public" as Visibility, label: "Público", desc: "Todos da organização", icon: Globe, color: "text-green-500" },
    { value: "private" as Visibility, label: "Privado", desc: "Apenas membros selecionados", icon: Lock, color: "text-orange-500" },
    { value: "team" as Visibility, label: "Equipe", desc: "Membros de uma equipe", icon: Users, color: "text-blue-500" },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Novo Board
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Novo Board</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Nome */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Sprint 01"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  autoFocus
                  required
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o board..."
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
                />
              </div>

              {/* Visibilidade */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Visibilidade</label>
                <div className="grid grid-cols-3 gap-2">
                  {visibilityOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = visibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVisibility(opt.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/30 hover:bg-accent/50"
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? opt.color : "text-muted-foreground"}`} />
                        <span className={`text-xs font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {visibilityOptions.find((o) => o.value === visibility)?.desc}
                </p>
              </div>

              {/* Membros */}
              <div className="space-y-2" ref={membersRef}>
                <label className="text-sm font-medium text-foreground">
                  Membros {selectedMembers.length > 0 && (
                    <span className="text-xs text-primary font-normal ml-1">
                      ({selectedMembers.length} selecionado{selectedMembers.length > 1 ? "s" : ""})
                    </span>
                  )}
                </label>

                {/* Selected members pills */}
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedMembers.map((id) => {
                      const member = orgMembers.find((m) => m.user_id === id);
                      if (!member) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full"
                        >
                          {member.avatar_url ? (
                            <img src={member.avatar_url} className="w-4 h-4 rounded-full" alt="" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold">
                              {member.full_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          {member.full_name.split(" ")[0]}
                          <button
                            type="button"
                            onClick={() => toggleMember(id)}
                            className="hover:text-destructive ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMembers(!showMembers)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-left text-muted-foreground hover:border-primary/50 transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Adicionar membros...
                  </span>
                  <span className="text-xs">{orgMembers.length} disponíveis</span>
                </button>

                {showMembers && (
                  <div className="bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {orgMembers.map((member) => {
                      const isSelected = selectedMembers.includes(member.user_id);
                      return (
                        <button
                          key={member.user_id}
                          type="button"
                          onClick={() => toggleMember(member.user_id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-accent"
                          }`}
                        >
                          {member.avatar_url ? (
                            <img src={member.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                              {member.full_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                    {orgMembers.length === 0 && (
                      <p className="text-xs text-muted-foreground p-3 text-center">Nenhum membro encontrado</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Criar Board
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>

            <p className="text-xs text-muted-foreground mt-3">
              Colunas padrão: A Fazer, Em Progresso, Concluído
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
