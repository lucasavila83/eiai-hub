"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, X, Send } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { createClient } from "@/lib/supabase/client";

interface Props {
  channelId: string;
  onAudioSent: (audioUrl: string, transcript: string | null, duration: number) => void;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioRecorder({ channelId, onAudioSent, onClose }: Props) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [recording]);

  const cancelRecording = useCallback(() => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
    onClose();
  }, [recording, audioUrl, onClose]);

  const sendAudio = useCallback(async () => {
    if (!audioBlob) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Upload audio to Supabase Storage
      const timestamp = Date.now();
      const path = `${channelId}/${timestamp}_audio.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("chat-files")
        .upload(path, audioBlob, { contentType: "audio/webm", upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("chat-files").getPublicUrl(path);

      // Transcribe via API
      setTranscribing(true);
      let transcript: string | null = null;
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          transcript = data.text || null;
        }
      } catch {
        // Transcription failed silently — audio is still sent
      }
      setTranscribing(false);

      onAudioSent(publicUrl, transcript, duration);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar áudio");
      setUploading(false);
      setTranscribing(false);
    }
  }, [audioBlob, channelId, duration, onAudioSent]);

  // Auto-start recording on mount
  useEffect(() => {
    if (!recording && !audioBlob) {
      startRecording();
    }
  }, []);

  return (
    <div className="mx-0 bg-card border border-primary/30 rounded-xl p-3 animate-in slide-in-from-bottom-2 duration-200">
      {error && (
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm text-destructive flex-1">{error}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!error && (
        <div className="flex items-center gap-3">
          {/* Recording indicator */}
          {recording && (
            <>
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-foreground">
                Gravando {formatDuration(duration)}
              </span>
              <div className="flex-1" />
              <button
                onClick={cancelRecording}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={stopRecording}
                className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                title="Parar gravação"
              >
                <Square className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Preview after recording */}
          {!recording && audioBlob && !uploading && (
            <>
              <Mic className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Áudio ({formatDuration(duration)})
              </span>
              {audioUrl && (
                <audio src={audioUrl} controls className="h-8 flex-1 max-w-[200px]" />
              )}
              <div className="flex-1" />
              <button
                onClick={cancelRecording}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Descartar"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={sendAudio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                title="Enviar áudio"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </>
          )}

          {/* Uploading/Transcribing */}
          {uploading && (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">
                {transcribing ? "Transcrevendo..." : "Enviando áudio..."}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
