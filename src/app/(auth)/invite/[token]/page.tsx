"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Zap, CheckCircle, XCircle, Lock, Eye, EyeOff } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<"loading" | "set-password" | "accepting" | "accepted" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: invite } = await supabase
      .from("invitations")
      .select("*, organizations(name)")
      .eq("token", token)
      .single();

    if (!invite) {
      setStatus("error");
      setError("Convite não encontrado.");
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      setStatus("error");
      setError("Este convite expirou. Peça ao administrador para reenviar.");
      return;
    }

    setOrgName((invite as any).organizations?.name || "");
    setInviteEmail(invite.email);

    // If already accepted and logged in → redirect
    if (invite.accepted_at) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStatus("accepted");
        setTimeout(() => router.push("/"), 2000);
        return;
      }
    }

    // If already logged in → accept directly
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      acceptInvite(session.access_token);
      return;
    }

    // Show password form
    setStatus("set-password");
  }

  async function acceptInvite(accessToken?: string) {
    setStatus("accepting");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });

    const json = await res.json();
    if (res.ok) {
      setStatus("accepted");
      setTimeout(() => router.push("/"), 2000);
    } else {
      setStatus("error");
      setError(json.error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Strategy: try signUp first. If user already exists, try signIn.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: inviteEmail,
      password,
      options: { data: { full_name: inviteEmail.split("@")[0] } },
    });

    if (signUpError) {
      // User already has account → try login with same password
      if (signUpError.message.includes("already") || signUpError.message.includes("User already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: inviteEmail,
          password,
        });

        if (signInError) {
          setError("Senha incorreta. Se você já tem conta, use a senha que cadastrou anteriormente.");
          setSubmitting(false);
          return;
        }

        await acceptInvite(signInData.session?.access_token);
        setSubmitting(false);
        return;
      }

      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    // New account created → sign in to get session
    if (signUpData.user) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });

      if (signInError) {
        setError("Conta criada mas houve um erro. Tente novamente.");
        setSubmitting(false);
        return;
      }

      await acceptInvite(signInData.session?.access_token);
    }
    setSubmitting(false);
  }

  const inputClass = "w-full pl-10 pr-12 py-3 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
          <Zap className="w-6 h-6 text-primary" />
        </div>

        {status === "loading" && (
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Verificando convite...</p>
          </div>
        )}

        {status === "set-password" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <h1 className="text-xl font-bold text-foreground mb-1">
              Entrar em {orgName}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {inviteEmail}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  minLength={8}
                  className={inputClass}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
              </button>
            </form>
          </div>
        )}

        {status === "accepting" && (
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground font-medium">Entrando...</p>
          </div>
        )}

        {status === "accepted" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-foreground mb-2">Bem-vindo!</h1>
            <p className="text-muted-foreground">
              Você entrou em <strong className="text-foreground">{orgName}</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2">Redirecionando...</p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <h1 className="text-xl font-bold text-foreground mb-2">Ops!</h1>
            <p className="text-muted-foreground">{error}</p>
            <Link
              href="/login"
              className="inline-block mt-4 text-primary hover:underline text-sm font-medium"
            >
              Ir para login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
