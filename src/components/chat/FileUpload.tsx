"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Paperclip,
  X,
  Loader2,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

interface Props {
  channelId: string;
  onFileUploaded: (fileUrl: string, fileName: string, fileType: string) => void;
  onClose: () => void;
  droppedFiles?: File[];
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

const ACCEPTED_TYPES = [
  // Imagens
  "image/*",
  // Documentos
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Texto e código
  "text/*",
  // Compactados
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  // Áudio e vídeo
  "audio/*",
  "video/*",
  // Outros
  "application/json",
  "application/xml",
  "application/octet-stream",
].join(",");

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

interface FileEntry {
  file: File;
  preview: string | null;
  error: string | null;
}

export function FileUpload({ channelId, onFileUploaded, onClose, droppedFiles }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    setGlobalError(null);
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        setGlobalError(`Máximo de ${MAX_FILES} arquivos`);
        return prev;
      }
      const toAdd = newFiles.slice(0, remaining);
      if (newFiles.length > remaining) {
        setGlobalError(`Apenas ${remaining} arquivo(s) adicionado(s) (máximo ${MAX_FILES})`);
      }
      const entries: FileEntry[] = toAdd.map((file) => {
        if (file.size > MAX_FILE_SIZE) {
          return { file, preview: null, error: "Muito grande (max. 10MB)" };
        }
        return { file, preview: null, error: null };
      });
      // Generate previews for images
      entries.forEach((entry, i) => {
        if (!entry.error && isImageType(entry.file.type)) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setFiles((curr) => {
              const idx = prev.length + i;
              if (idx >= curr.length) return curr;
              const updated = [...curr];
              updated[idx] = { ...updated[idx], preview: ev.target?.result as string };
              return updated;
            });
          };
          reader.readAsDataURL(entry.file);
        }
      });
      return [...prev, ...entries];
    });
  }, []);

  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [droppedFiles, addFiles]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;
      addFiles(Array.from(selected));
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles]
  );

  const handleUpload = useCallback(async () => {
    const validFiles = files.filter((f) => !f.error);
    if (validFiles.length === 0) return;

    setUploading(true);
    setGlobalError(null);

    try {
      const supabase = createClient();
      for (const entry of validFiles) {
        const timestamp = Date.now();
        const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${channelId}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-files")
          .upload(path, entry.file, {
            contentType: entry.file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("chat-files").getPublicUrl(path);

        onFileUploaded(publicUrl, entry.file.name, entry.file.type);
      }
      onClose();
    } catch (err: any) {
      setGlobalError(err?.message || "Erro ao enviar arquivo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [files, channelId, onFileUploaded, onClose]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setGlobalError(null);
  }, []);

  const validCount = files.filter((f) => !f.error).length;

  return (
    <div className="mx-4 mb-2 bg-card border border-border rounded-xl p-3 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Anexar arquivo{files.length > 1 ? "s" : ""}
          </span>
          {files.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({files.length}/{MAX_FILES})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {files.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <Paperclip className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Clique para selecionar ou arraste arquivos
          </span>
          <span className="text-xs text-muted-foreground/70">
            Até {MAX_FILES} arquivos, max. 10MB cada
          </span>
        </button>
      ) : (
        <div className="space-y-2">
          {/* File list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((entry, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg p-2 ${
                  entry.error ? "bg-red-500/5 border border-red-500/20" : "bg-muted"
                }`}
              >
                {entry.preview ? (
                  <img
                    src={entry.preview}
                    alt={entry.file.name}
                    className="w-10 h-10 object-cover rounded-md border border-border"
                  />
                ) : isImageType(entry.file.type) ? (
                  <div className="w-10 h-10 flex items-center justify-center bg-primary/5 rounded-md border border-border">
                    <ImageIcon className="w-5 h-5 text-primary" />
                  </div>
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 dark:bg-orange-500/10 rounded-md border border-border">
                    <FileText className="w-5 h-5 text-orange-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.file.name}
                  </p>
                  <p className={`text-xs ${entry.error ? "text-red-500" : "text-muted-foreground"}`}>
                    {entry.error || formatFileSize(entry.file.size)}
                  </p>
                </div>

                {!uploading && (
                  <button
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {files.length < MAX_FILES && (
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                + Adicionar mais
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleUpload}
              disabled={uploading || validCount === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                `Enviar${validCount > 1 ? ` (${validCount})` : ""}`
              )}
            </button>
          </div>
        </div>
      )}

      {globalError && (
        <p className="text-sm text-red-500 mt-2">{globalError}</p>
      )}
    </div>
  );
}
