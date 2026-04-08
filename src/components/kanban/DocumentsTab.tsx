"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Plus, FolderPlus, Trash2, Pin, PinOff,
  ChevronRight, ChevronDown, ArrowLeft, Pencil, Loader2,
  MoreHorizontal, X, Folder, Search, Upload, Link2,
  Download, ExternalLink, File, Image as ImageIcon,
} from "lucide-react";
import { cn, getInitials, generateColor } from "@/lib/utils/helpers";

type DocumentType = "text" | "file" | "link";

interface Document {
  id: string;
  board_id: string;
  folder_id: string | null;
  title: string;
  content: string;
  icon: string;
  is_pinned: boolean;
  document_type: DocumentType;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

interface DocFolder {
  id: string;
  board_id: string;
  name: string;
  icon: string;
  position: number;
  created_at: string;
}

interface Props {
  boardId: string;
  currentUserId: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null) {
  if (!fileType) return <File className="w-5 h-5 text-muted-foreground" />;
  if (fileType.startsWith("image/")) return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return <FileText className="w-5 h-5 text-green-600" />;
  if (fileType.includes("word") || fileType.includes("document")) return <FileText className="w-5 h-5 text-blue-600" />;
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) return <FileText className="w-5 h-5 text-orange-500" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
}

function getDocIcon(doc: Document) {
  if (doc.document_type === "link") return "🔗";
  if (doc.document_type === "file") {
    if (doc.file_type?.startsWith("image/")) return "🖼️";
    if (doc.file_type === "application/pdf") return "📕";
    if (doc.file_type?.includes("spreadsheet") || doc.file_type?.includes("excel")) return "📊";
    if (doc.file_type?.includes("word") || doc.file_type?.includes("document")) return "📝";
    return "📎";
  }
  return doc.icon;
}

export function DocumentsTab({ boardId, currentUserId }: Props) {
  const supabase = createClient();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; type: "doc" | "folder" } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [targetFolderId, setTargetFolderId] = useState<string | undefined>();

  useEffect(() => {
    loadData();
  }, [boardId]);

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    }
    if (contextMenu || showNewMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [contextMenu, showNewMenu]);

  async function loadData() {
    setLoading(true);
    const [docsRes, foldersRes] = await Promise.all([
      supabase
        .from("board_documents")
        .select("*, profiles:created_by(full_name, avatar_url)")
        .eq("board_id", boardId)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
      supabase
        .from("board_document_folders")
        .select("*")
        .eq("board_id", boardId)
        .order("position"),
    ]);
    if (docsRes.data) setDocuments(docsRes.data as unknown as Document[]);
    if (foldersRes.data) setFolders(foldersRes.data as DocFolder[]);
    setLoading(false);
  }

  async function createDocument(folderId?: string) {
    const { data } = await supabase
      .from("board_documents")
      .insert({
        board_id: boardId,
        folder_id: folderId || null,
        title: "Novo documento",
        content: "",
        document_type: "text",
        created_by: currentUserId,
        updated_by: currentUserId,
      } as any)
      .select("*, profiles:created_by(full_name, avatar_url)")
      .single();
    if (data) {
      const doc = data as unknown as Document;
      setDocuments((prev) => [doc, ...prev]);
      setSelectedDoc(doc);
      setEditTitle(doc.title);
      setEditContent(doc.content);
      setEditing(true);
    }
    setShowNewMenu(false);
  }

  async function handleFileUpload(files: FileList, folderId?: string) {
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_FILE_SIZE) continue;

        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `boards/${boardId}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path);

        await supabase.from("board_documents").insert({
          board_id: boardId,
          folder_id: folderId || null,
          title: file.name,
          content: "",
          icon: "📎",
          document_type: "file",
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          created_by: currentUserId,
          updated_by: currentUserId,
        } as any);
      }
      await loadData();
    } finally {
      setUploading(false);
      setShowNewMenu(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function createLink() {
    if (!linkUrl.trim()) return;
    const title = linkTitle.trim() || linkUrl.trim();
    await supabase.from("board_documents").insert({
      board_id: boardId,
      folder_id: targetFolderId || null,
      title,
      content: linkUrl.trim(),
      icon: "🔗",
      document_type: "link",
      file_url: linkUrl.trim(),
      created_by: currentUserId,
      updated_by: currentUserId,
    } as any);
    setLinkUrl("");
    setLinkTitle("");
    setShowLinkModal(false);
    setTargetFolderId(undefined);
    await loadData();
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const { data } = await supabase
      .from("board_document_folders")
      .insert({
        board_id: boardId,
        name: newFolderName.trim(),
        position: folders.length,
      } as any)
      .select()
      .single();
    if (data) {
      setFolders((prev) => [...prev, data as DocFolder]);
      setExpandedFolders((prev) => new Set([...prev, (data as any).id]));
    }
    setNewFolderName("");
    setShowNewFolderInput(false);
  }

  async function saveDocument() {
    if (!selectedDoc || !editTitle.trim()) return;
    setSaving(true);
    const updates: any = {
      title: editTitle.trim(),
      content: editContent,
      updated_by: currentUserId,
      updated_at: new Date().toISOString(),
    };
    if (selectedDoc.document_type === "link") {
      updates.file_url = editContent;
    }
    const { data } = await supabase
      .from("board_documents")
      .update(updates)
      .eq("id", selectedDoc.id)
      .select("*, profiles:created_by(full_name, avatar_url)")
      .single();
    if (data) {
      const updated = data as unknown as Document;
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDoc(updated);
    }
    setSaving(false);
    setEditing(false);
  }

  async function deleteDocument(id: string) {
    const doc = documents.find((d) => d.id === id);
    // Delete file from storage if it's a file document
    if (doc?.document_type === "file" && doc.file_url) {
      try {
        const url = new URL(doc.file_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
        if (pathMatch) {
          await supabase.storage.from("documents").remove([decodeURIComponent(pathMatch[1])]);
        }
      } catch {}
    }
    await supabase.from("board_documents").delete().eq("id", id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (selectedDoc?.id === id) {
      setSelectedDoc(null);
      setEditing(false);
    }
    setContextMenu(null);
  }

  async function deleteFolder(id: string) {
    await supabase.from("board_documents").update({ folder_id: null } as any).eq("folder_id", id);
    await supabase.from("board_document_folders").delete().eq("id", id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setDocuments((prev) => prev.map((d) => (d.folder_id === id ? { ...d, folder_id: null } : d)));
    setContextMenu(null);
  }

  async function togglePin(doc: Document) {
    const { data } = await supabase
      .from("board_documents")
      .update({ is_pinned: !doc.is_pinned } as any)
      .eq("id", doc.id)
      .select("*, profiles:created_by(full_name, avatar_url)")
      .single();
    if (data) {
      const updated = data as unknown as Document;
      setDocuments((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          })
      );
      if (selectedDoc?.id === doc.id) setSelectedDoc(updated);
    }
    setContextMenu(null);
  }

  function toggleFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function handleDocClick(doc: Document) {
    if (doc.document_type === "link" && doc.file_url) {
      window.open(doc.file_url, "_blank", "noopener");
    } else if (doc.document_type === "file" && doc.file_url) {
      setSelectedDoc(doc);
    } else {
      setSelectedDoc(doc);
    }
  }

  // Drag and drop handler
  const handleDrop = useCallback((e: React.DragEvent, folderId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files, folderId);
    }
  }, [boardId, currentUserId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const filteredDocs = searchQuery
    ? documents.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : documents;

  const rootDocs = filteredDocs.filter((d) => !d.folder_id);
  const docsInFolder = (folderId: string) => filteredDocs.filter((d) => d.folder_id === folderId);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  // --- File detail view ---
  if (selectedDoc && selectedDoc.document_type === "file") {
    const isImage = selectedDoc.file_type?.startsWith("image/");
    const isPdf = selectedDoc.file_type === "application/pdf";
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setSelectedDoc(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="mr-1">{getDocIcon(selectedDoc)}</span>
          <h3 className="flex-1 text-lg font-bold text-foreground truncate">
            {selectedDoc.title}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => togglePin(selectedDoc)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              title={selectedDoc.is_pinned ? "Desafixar" : "Fixar"}
            >
              {selectedDoc.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
            {selectedDoc.file_url && (
              <a
                href={selectedDoc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download={selectedDoc.file_name || undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/10"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar
              </a>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isImage && selectedDoc.file_url && (
            <div className="flex justify-center">
              <img src={selectedDoc.file_url} alt={selectedDoc.title} className="max-w-full max-h-[70vh] rounded-lg border border-border" />
            </div>
          )}
          {isPdf && selectedDoc.file_url && (
            <iframe src={selectedDoc.file_url} className="w-full h-[70vh] rounded-lg border border-border" />
          )}
          {!isImage && !isPdf && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {getFileIcon(selectedDoc.file_type)}
              <p className="text-sm font-medium text-foreground mt-3">{selectedDoc.file_name}</p>
              {selectedDoc.file_size && (
                <p className="text-xs text-muted-foreground mt-1">{formatFileSize(selectedDoc.file_size)}</p>
              )}
              {selectedDoc.file_url && (
                <a
                  href={selectedDoc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={selectedDoc.file_name || undefined}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  <Download className="w-4 h-4" />
                  Baixar arquivo
                </a>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
          <span>Criado em {formatDate(selectedDoc.created_at)}</span>
          {selectedDoc.file_size && <span>{formatFileSize(selectedDoc.file_size)}</span>}
          {selectedDoc.profiles && <span>por {selectedDoc.profiles.full_name || "?"}</span>}
        </div>
      </div>
    );
  }

  // --- Text document detail / editor view ---
  if (selectedDoc && selectedDoc.document_type !== "file") {
    const isLink = selectedDoc.document_type === "link";
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <button
            onClick={() => { setSelectedDoc(null); setEditing(false); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 text-lg font-bold bg-transparent text-foreground focus:outline-none border-b border-primary/30 pb-0.5"
              autoFocus
            />
          ) : (
            <h3 className="flex-1 text-lg font-bold text-foreground truncate">
              <span className="mr-2">{getDocIcon(selectedDoc)}</span>
              {selectedDoc.title}
            </h3>
          )}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditTitle(selectedDoc.title); setEditContent(selectedDoc.content); }}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveDocument}
                  disabled={saving || !editTitle.trim()}
                  className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Salvar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => togglePin(selectedDoc)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={selectedDoc.is_pinned ? "Desafixar" : "Fixar"}
                >
                  {selectedDoc.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                {isLink && selectedDoc.file_url && (
                  <a
                    href={selectedDoc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/10 flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Abrir
                  </a>
                )}
                <button
                  onClick={() => { setEditing(true); setEditTitle(selectedDoc.title); setEditContent(selectedDoc.content); }}
                  className="px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/10 flex items-center gap-1.5"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {editing ? (
            isLink ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">URL</label>
                  <input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="https://..."
                    className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Escreva o conteúdo do documento aqui...&#10;&#10;Dica: Use Markdown para formatar (# título, **negrito**, - lista, etc.)"
                className="w-full h-full min-h-[400px] bg-transparent text-foreground text-sm leading-relaxed resize-none focus:outline-none font-mono"
              />
            )
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {isLink ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Link2 className="w-10 h-10 text-primary mb-4" />
                  <a
                    href={selectedDoc.file_url || selectedDoc.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline text-lg break-all"
                  >
                    {selectedDoc.file_url || selectedDoc.content}
                  </a>
                </div>
              ) : selectedDoc.content ? (
                <MarkdownRenderer content={selectedDoc.content} />
              ) : (
                <p className="text-muted-foreground italic">
                  Documento vazio. Clique em "Editar" para adicionar conteúdo.
                </p>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className="px-6 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
            <span>Criado em {formatDate(selectedDoc.created_at)}</span>
            <span>Atualizado em {formatDate(selectedDoc.updated_at)}</span>
            {selectedDoc.profiles && (
              <span>por {selectedDoc.profiles.full_name || "?"}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Document list view ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onDrop={(e) => handleDrop(e)} onDragOver={handleDragOver}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFileUpload(e.target.files, targetFolderId);
        }}
      />

      {/* Link modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowLinkModal(false)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              Adicionar link
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">URL *</label>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") createLink(); }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Título (opcional)</label>
                <input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Nome do link"
                  className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => { if (e.key === "Enter") createLink(); }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowLinkModal(false); setLinkUrl(""); setLinkTitle(""); }}
                  className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={createLink}
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-foreground">Documentos</h3>
        <span className="text-xs text-muted-foreground">({documents.length})</span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="pl-8 pr-3 py-1.5 text-xs bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
          />
        </div>
        <button
          onClick={() => setShowNewFolderInput(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Pasta
        </button>
        {/* New document dropdown */}
        <div className="relative" ref={newMenuRef}>
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo
            <ChevronDown className="w-3 h-3" />
          </button>
          {showNewMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => { setTargetFolderId(undefined); createDocument(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
              >
                <FileText className="w-3.5 h-3.5" />
                Documento de texto
              </button>
              <button
                onClick={() => { setTargetFolderId(undefined); fileInputRef.current?.click(); setShowNewMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload de arquivo
              </button>
              <button
                onClick={() => { setTargetFolderId(undefined); setShowLinkModal(true); setShowNewMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
              >
                <Link2 className="w-3.5 h-3.5" />
                Adicionar link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 px-6 py-2 bg-primary/5 border-b border-border">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-primary font-medium">Enviando arquivo...</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* New folder input */}
        {showNewFolderInput && (
          <div className="flex items-center gap-2 mb-3 px-2">
            <Folder className="w-4 h-4 text-muted-foreground" />
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta..."
              className="flex-1 text-sm bg-background border border-input rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); }
              }}
            />
            <button onClick={createFolder} className="text-xs text-primary font-medium">Criar</button>
            <button onClick={() => { setShowNewFolderInput(false); setNewFolderName(""); }} className="text-xs text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Folders */}
        {folders.map((folder) => {
          const folderDocs = docsInFolder(folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          return (
            <div key={folder.id} className="mb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 group cursor-pointer">
                <button onClick={() => toggleFolder(folder.id)} className="flex items-center gap-2 flex-1 text-left">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-sm">{folder.icon}</span>
                  <span className="text-sm font-medium text-foreground">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">({folderDocs.length})</span>
                </button>
                <button
                  onClick={() => { setTargetFolderId(folder.id); fileInputRef.current?.click(); }}
                  className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  title="Upload nesta pasta"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => createDocument(folder.id)}
                  className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  title="Novo documento nesta pasta"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setContextMenu(contextMenu?.id === folder.id ? null : { id: folder.id, type: "folder" })}
                    className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {contextMenu?.id === folder.id && contextMenu.type === "folder" && (
                    <div ref={contextMenuRef} className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={() => deleteFolder(folder.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left"
                      >
                        <Trash2 className="w-3 h-3" />
                        Excluir pasta
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {isExpanded && (
                <div className="ml-6" onDrop={(e) => handleDrop(e, folder.id)} onDragOver={handleDragOver}>
                  {folderDocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-2 italic">Pasta vazia</p>
                  ) : (
                    folderDocs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        onSelect={() => handleDocClick(doc)}
                        onTogglePin={() => togglePin(doc)}
                        onDelete={() => deleteDocument(doc.id)}
                        contextMenu={contextMenu}
                        setContextMenu={setContextMenu}
                        contextMenuRef={contextMenuRef}
                        formatDate={formatDate}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Root documents (no folder) */}
        {rootDocs.length === 0 && folders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h4 className="text-sm font-medium text-foreground mb-1">Nenhum documento</h4>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm">
              Crie documentos, faça upload de arquivos ou adicione links para organizar o conhecimento do seu departamento.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => createDocument()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Documento
              </button>
              <button
                onClick={() => { setTargetFolderId(undefined); fileInputRef.current?.click(); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <button
                onClick={() => { setTargetFolderId(undefined); setShowLinkModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent"
              >
                <Link2 className="w-4 h-4" />
                Link
              </button>
            </div>
          </div>
        )}

        {rootDocs.length > 0 && (
          <div className={folders.length > 0 ? "mt-2" : ""}>
            {folders.length > 0 && (
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sem pasta
              </div>
            )}
            {rootDocs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onSelect={() => handleDocClick(doc)}
                onTogglePin={() => togglePin(doc)}
                onDelete={() => deleteDocument(doc.id)}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                contextMenuRef={contextMenuRef}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function DocumentRow({
  doc,
  onSelect,
  onTogglePin,
  onDelete,
  contextMenu,
  setContextMenu,
  contextMenuRef,
  formatDate,
}: {
  doc: Document;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  contextMenu: { id: string; type: "doc" | "folder" } | null;
  setContextMenu: (v: { id: string; type: "doc" | "folder" } | null) => void;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  formatDate: (d: string) => string;
}) {
  const icon = getDocIcon(doc);
  const isFile = doc.document_type === "file";
  const isLink = doc.document_type === "link";

  let subtitle = "";
  if (isFile && doc.file_size) {
    subtitle = formatFileSize(doc.file_size);
  } else if (isLink && doc.file_url) {
    try {
      subtitle = new URL(doc.file_url).hostname;
    } catch {
      subtitle = doc.file_url;
    }
  } else {
    subtitle = doc.content.replace(/[#*_~`>\-\[\]()]/g, "").substring(0, 80);
  }

  return (
    <div
      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/50 cursor-pointer group transition-colors"
      onClick={onSelect}
    >
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{doc.title}</span>
          {doc.is_pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
          {isLink && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
        {formatDate(doc.updated_at)}
      </span>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setContextMenu(contextMenu?.id === doc.id ? null : { id: doc.id, type: "doc" })}
          className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {contextMenu?.id === doc.id && contextMenu.type === "doc" && (
          <div ref={contextMenuRef} className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={onTogglePin}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent text-left"
            >
              {doc.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              {doc.is_pinned ? "Desafixar" : "Fixar no topo"}
            </button>
            {isFile && doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download={doc.file_name || undefined}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent text-left"
              >
                <Download className="w-3 h-3" />
                Baixar
              </a>
            )}
            {isLink && doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent text-left"
              >
                <ExternalLink className="w-3 h-3" />
                Abrir link
              </a>
            )}
            <button
              onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left"
            >
              <Trash2 className="w-3 h-3" />
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple markdown renderer (no external deps)
function MarkdownRenderer({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-muted rounded-lg p-3 text-xs overflow-x-auto my-3"><code>${code.trim()}</code></pre>`
  );

  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs">$1</code>');

  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary underline">$1</a>');

  html = html.replace(/^---$/gm, '<hr class="border-border my-4" />');

  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc text-sm leading-relaxed">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm leading-relaxed">$1</li>');

  html = html.replace(/((?:<li class="ml-4 list-disc[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-2">$1</ul>');
  html = html.replace(/((?:<li class="ml-4 list-decimal[^>]*>.*<\/li>\n?)+)/g, '<ol class="my-2">$1</ol>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-2 border-primary/30 pl-3 py-1 text-muted-foreground italic my-2">$1</blockquote>');

  html = html.replace(/\n\n/g, '</p><p class="text-sm leading-relaxed mb-3">');
  html = `<p class="text-sm leading-relaxed mb-3">${html}</p>`;

  html = html.replace(/\n/g, "<br />");
  html = html.replace(/<p class="[^"]*"><\/p>/g, "");

  return html;
}
