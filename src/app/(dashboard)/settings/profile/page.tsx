"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Loader2,
  CheckCircle,
  User,
} from "lucide-react";
import { getInitials, generateColor } from "@/lib/utils/helpers";
import type { Profile } from "@/lib/types/database";

const statusOptions = [
  { value: "online", label: "Online", color: "bg-green-500" },
  { value: "away", label: "Ausente", color: "bg-yellow-500" },
  { value: "dnd", label: "Nao perturbe", color: "bg-red-500" },
  { value: "offline", label: "Offline", color: "bg-gray-500" },
] as const;

export default function ProfileSettingsPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<Profile["status"]>("online");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  async function loadProfile() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setJobTitle(profile.job_title ?? "");
        setBio(profile.bio ?? "");
        setStatus(profile.status);
        setAvatarUrl(profile.avatar_url);
        setAvatarPreview(profile.avatar_url);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const allowedExts = ["jpg", "jpeg", "png", "gif", "webp"];
    if (!allowedExts.includes(ext)) {
      setError("Formato de imagem nao suportado. Use JPG, PNG, GIF ou WebP.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no maximo 2MB.");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setError(null);

    try {
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      // Append timestamp to bust cache
      const freshUrl = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(freshUrl);
      setAvatarPreview(freshUrl);

      // Update profile with new avatar URL
      await supabase
        .from("profiles")
        .update({ avatar_url: freshUrl })
        .eq("id", userId);
    } catch (err: any) {
      setError(err.message ?? "Erro ao enviar imagem.");
      setAvatarPreview(avatarUrl); // revert preview
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
          phone: phone || null,
          job_title: jobTitle || null,
          bio: bio || null,
          status,
          avatar_url: avatarUrl,
        })
        .eq("id", userId);

      if (updateError) throw updateError;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message ?? "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = getInitials(fullName || email);
  const avatarBg = generateColor(fullName || email);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas informacoes pessoais
          </p>
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div className="mb-6 flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Perfil atualizado com sucesso!
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Avatar section */}
        <div className="flex flex-col items-center mb-8">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group cursor-pointer"
            disabled={uploading}
          >
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border group-hover:border-primary/50 transition-colors">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: avatarBg }}
                >
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Clique para alterar a foto
          </p>
        </div>

        {/* Form fields */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          {/* Full name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Nome completo
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome completo"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* Job title */}
          <div>
            <label
              htmlFor="jobTitle"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Cargo
            </label>
            <input
              id="jobTitle"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ex: Gerente de TI, Diretor Financeiro"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              O email nao pode ser alterado por aqui
            </p>
          </div>

          {/* Phone */}
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Telefone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* Bio */}
          <div>
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Uma breve descricao sobre voce"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Status
            </label>
            <div className="relative">
              <select
                id="status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Profile["status"])
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors appearance-none cursor-pointer"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    statusOptions.find((o) => o.value === status)?.color ??
                    "bg-gray-500"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6">
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Voltar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar alteracoes
          </button>
        </div>
      </form>
    </div>
  );
}
