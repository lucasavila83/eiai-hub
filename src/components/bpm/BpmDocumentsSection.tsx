"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Plus, Trash2, Loader2, Upload, Link2, Download,
  ExternalLink, File, Image as ImageIcon, X, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

type DocumentType = "text" | "file" | "link";

interface BpmDocument {
  id: string;
  card_id: string;
  org_id: string;
  title: string;
  content: string;
  icon: string;
  document_type: DocumentType;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

interface Props {
  cardId: string;
  orgId: string;
  currentUserId: string | null;
  canEdit: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null) {
  if (!fileType) return <File className="w-4 h-4 text-muted-foreground" />;
  if (fileType.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return <FileText className="w-4 h-4 text-green-600" />;
  if (fileType.includes("word") || fileType.includes("document")) return <FileText className="w-4 h-4 text-blue-600" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function getDocIcon(doc: BpmDocument) {
  if (doc.document_type === "link") return <Link2 className="w-4 h-4 text-blue-500" />;
  if (doc.document_type === "file") return getFileIcon(doc.file_type);
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

export function BpmDocumentsSection({ cardId, orgId, currentUserId, canEdit }: Props) {
  const supabase = createClient();
  const [documents, setDocuments] = useState<BpmDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [previewDoc, setPreviewDoc] = useState<BpmDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDocuments();
  }, [cardId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showAddMenu]);

  async function loadDocuments() {
    setLoading(true);
    const { data } = await supabase
      .from("bpm_card_documents")
      .select("*")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false });
    setDocuments((data || []) as BpmDocument[]);
    setLoading(false);
  }

  async function handleFileUpload(files: FileList) {
    if (!currentUserId) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_FILE_SIZE) continue;

        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `bpm/${cardId}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path);

        await supabase.from("bpm_card_documents").insert({
          card_id: cardId,
          org_id: orgId,
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
      await loadDocuments();
    } finally {
      setUploading(false);
      setShowAddMenu(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function createLink() {
    if (!linkUrl.trim() || !currentUserId) return;
    const title = linkTitle.trim() || linkUrl.trim();
    await supabase.from("bpm_card_documents").insert({
      card_id: cardId,
      org_id: orgId,
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
    await loadDocuments();
  }

  async function createTextDoc() {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("bpm_card_documents")
      .insert({
        card_id: cardId,
        org_id: orgId,
        title: "Novo documento",
        content: "",
        document_type: "text",
        created_by: currentUserId,
        updated_by: currentUserId,
      } as any)
      .select()
      .single();
    if (data) {
      setDocuments((prev) => [data as BpmDocument, ...prev]);
      setPreviewDoc(data as BpmDocument);
    }
    setShowAddMenu(false);
  }

  async function deleteDocument(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (doc?.document_type === "file" && doc.file_url) {
      try {
        const url = new URL(doc.file_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
        if (pathMatch) {
          await supabase.storage.from("documents").remove([decodeURIComponent(pathMatch[1])]);
        }
      } catch {}
    }
    await supabase.from("bpm_card_documents").delete().eq("id", id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (previewDoc?.id === id) setPreviewDoc(null);
  }

  function handleDocClick(doc: BpmDocument) {
    if (doc.document_type === "link" && doc.file_url) {
      window.open(doc.file_url, "_blank", "noopener");
    } else {
      setPreviewDoc(doc);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && canEdit) {
      handleFileUpload(files);
    }
  }, [cardId, currentUserId, canEdit]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Preview overlay for files
  if (previewDoc) {
    const isImage = previewDoc.file_type?.startsWith("image/");
    const isPdf = previewDoc.file_type === "application/pdf";
    const isFile = previewDoc.document_type === "file";
    const isText = previewDoc.document_type === "text";

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewDoc(null)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="flex-1 text-sm font-medium text-foreground truncate">{previewDoc.title}</span>
          {isFile && previewDoc.file_url && (
            <a
              href={previewDoc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              download={previewDoc.file_name || undefined}
              className="flex items-center gap-1 px-2 py-1 text-xs text-primary border border-primary/30 rounded hover:bg-primary/10"
            >
              <Download className="w-3 h-3" />
              Baixar
            </a>
          )}
          {previewDoc.document_type === "link" && previewDoc.file_url && (
            <a
              href={previewDoc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 text-xs text-primary border border-primary/30 rounded hover:bg-primary/10"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir
            </a>
          )}
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-background">
          {isFile && isImage && previewDoc.file_url && (
            <img src={previewDoc.file_url} alt={previewDoc.title} className="max-w-full max-h-[300px] mx-auto" />
          )}
          {isFile && isPdf && previewDoc.file_url && (
            <iframe src={previewDoc.file_url} className="w-full h-[300px]" />
          )}
          {isFile && !isImage && !isPdf && (
            <div className="flex flex-col items-center py-8">
              {getFileIcon(previewDoc.file_type)}
              <p className="text-xs text-foreground mt-2">{previewDoc.file_name}</p>
              {previewDoc.file_size && <p className="text-[10px] text-muted-foreground">{formatFileSize(previewDoc.file_size)}</p>}
            </div>
          )}
          {isText && (
            <div className="p-3 text-xs text-foreground whitespace-pre-wrap min-h-[60px]">
              {previewDoc.content || <span className="text-muted-foreground italic">Documento vazio.</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Documentos
        </h4>
        {canEdit && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                <button
                  onClick={createTextDoc}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Documento de texto
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload de arquivo
                </button>
                <button
                  onClick={() => { setShowLinkModal(true); setShowAddMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Adicionar link
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files);
          }
        }}
      />

      {/* Link modal */}
      {showLinkModal && (
        <div className="bg-background border border-border rounded-lg p-3 space-y-2">
          <input
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Titulo (opcional)"
            className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowLinkModal(false); setLinkUrl(""); setLinkTitle(""); }}
              className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={createLink}
              disabled={!linkUrl.trim()}
              className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : uploading ? (
        <div className="flex items-center gap-2 py-3 justify-center text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Enviando...
        </div>
      ) : documents.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          {canEdit ? "Arraste arquivos aqui ou clique + para adicionar." : "Nenhum documento."}
        </p>
      ) : (
        <div className="space-y-0.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => handleDocClick(doc)}
            >
              {getDocIcon(doc)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{doc.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {doc.document_type === "file" && doc.file_size
                    ? formatFileSize(doc.file_size)
                    : doc.document_type === "link" && doc.file_url
                      ? (() => { try { return new URL(doc.file_url).hostname; } catch { return doc.file_url; } })()
                      : "Texto"}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
