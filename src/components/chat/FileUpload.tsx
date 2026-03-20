"use client";

import { useState, useRef, useCallback } from "react";
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
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
].join(",");

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

export function FileUpload({ channelId, onFileUploaded, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      setError(null);

      if (selected.size > MAX_FILE_SIZE) {
        setError("Arquivo muito grande (max. 10MB)");
        setFile(null);
        setPreview(null);
        return;
      }

      setFile(selected);

      if (isImageType(selected.type)) {
        const reader = new FileReader();
        reader.onload = (ev) => setPreview(ev.target?.result as string);
        reader.readAsDataURL(selected);
      } else {
        setPreview(null);
      }
    },
    []
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${channelId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("chat-files").getPublicUrl(path);

      onFileUploaded(publicUrl, file.name, file.type);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erro ao enviar arquivo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [file, channelId, onFileUploaded, onClose]);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div className="mx-4 mb-2 bg-card border border-border rounded-xl p-3 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Anexar arquivo
          </span>
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
        onChange={handleFileSelect}
        className="hidden"
      />

      {!file ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <Paperclip className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Clique para selecionar um arquivo
          </span>
          <span className="text-xs text-muted-foreground/70">
            Imagens, PDFs, documentos (max. 10MB)
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          {/* File preview */}
          <div className="flex items-center gap-3 bg-muted rounded-lg p-3">
            {preview ? (
              <img
                src={preview}
                alt={file.name}
                className="w-12 h-12 object-cover rounded-md border border-border"
              />
            ) : isImageType(file.type) ? (
              <div className="w-12 h-12 flex items-center justify-center bg-primary/5 rounded-md border border-border">
                <ImageIcon className="w-6 h-6 text-primary" />
              </div>
            ) : (
              <div className="w-12 h-12 flex items-center justify-center bg-orange-50 rounded-md border border-border">
                <FileText className="w-6 h-6 text-orange-500" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>

            {!uploading && (
              <button
                onClick={handleRemoveFile}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Trocar arquivo
            </button>
            <div className="flex-1" />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 mt-2">{error}</p>
      )}
    </div>
  );
}
