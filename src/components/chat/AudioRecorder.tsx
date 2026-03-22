"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, X, Send, Play, Pause, Trash2 } from "lucide-react";
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
  const [playing, setPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

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

  const togglePlayback = useCallback(() => {
    if (!audioElRef.current || !audioUrl) return;
    if (playing) {
      audioElRef.current.pause();
      setPlaying(false);
    } else {
      audioElRef.current.play();
      setPlaying(true);
    }
  }, [playing, audioUrl]);

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
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive flex-1">{error}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-accent p-1.5 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!error && (
        <div className="flex items-center gap-3">
          {/* ── Recording state ── */}
          {recording && (
            <>
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  Gravando...
                </span>
                <span className="text-sm font-mono text-red-500">
                  {formatDuration(duration)}
                </span>
                {/* Waveform animation */}
                <div className="flex items-center gap-0.5 flex-1">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-red-400 rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 16}px`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={cancelRecording}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Descartar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={stopRecording}
                className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                title="Parar e revisar"
              >
                <Square className="w-4 h-4" />
              </button>
            </>
          )}

          {/* ── Preview after recording ── */}
          {!recording && audioBlob && !uploading && (
            <>
              <button
                onClick={togglePlayback}
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors"
                title={playing ? "Pausar" : "Ouvir"}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              {audioUrl && (
                <audio
                  ref={audioElRef}
                  src={audioUrl}
                  onEnded={() => setPlaying(false)}
                  className="hidden"
                />
              )}
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/50 rounded-full w-full" />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatDuration(duration)}
                </span>
              </div>
              <button
                onClick={cancelRecording}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Descartar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={sendAudio}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                title="Enviar áudio"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </>
          )}

          {/* ── Uploading/Transcribing ── */}
          {uploading && (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              <span className="text-sm text-foreground">
                {transcribing ? "Transcrevendo áudio..." : "Enviando áudio..."}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
