"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Zap, CheckCircle, XCircle, UserPlus, Lock, User, Mail, Eye, EyeOff } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<"loading" | "register" | "login" | "accepting" | "accepted" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");

  // Registration form
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Login form (for existing users)
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    // Fetch invite info (public select policy)
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

    // If already accepted, check if user is logged in and redirect
    if (invite.accepted_at) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStatus("accepted");
        setTimeout(() => router.push("/"), 2000);
        return;
      }
    }

    // Check if user is logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      acceptInvite(session.access_token);
      return;
    }

    // Check if account already exists for this email (try sign in with wrong pass to detect)
    // We use a lighter approach: check if signUp returns "already registered"
    // Instead, show register form — if signUp fails with "already registered", switch to login
    setStatus("register");
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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Try to create account
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: inviteEmail,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (signUpError) {
      // If user already exists, switch to login mode
      if (signUpError.message.includes("already") || signUpError.message.includes("User already registered")) {
        setError("Já existe uma conta com este email. Digite sua senha para entrar.");
        setStatus("login");
        setSubmitting(false);
        return;
      }
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    if (data.user) {
      // Sign in to get session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });

      if (signInError) {
        setError("Conta criada, mas houve um erro ao fazer login. Tente fazer login manualmente.");
        setSubmitting(false);
        return;
      }

      // Accept the invite
      await acceptInvite(signInData.session?.access_token);
    }
    setSubmitting(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: inviteEmail,
      password: loginPassword,
    });

    if (signInError) {
      setError("Senha incorreta. Tente novamente.");
      setSubmitting(false);
      return;
    }

    // Accept the invite
    await acceptInvite(data.session?.access_token);
    setSubmitting(false);
  }

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
          <Zap className="w-6 h-6 text-primary" />
        </div>

        {status === "loading" && (
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Verificando convite...</p>
          </div>
        )}

        {status === "register" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg text-left">
            <div className="text-center mb-5">
              <UserPlus className="w-10 h-10 text-primary mx-auto mb-2" />
              <h1 className="text-xl font-bold text-foreground">Você foi convidado!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Para entrar em <strong className="text-foreground">{orgName}</strong>
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm text-center">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={inviteEmail}
                    readOnly
                    className={`${inputClass} bg-muted cursor-not-allowed opacity-70`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Nome completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    className={inputClass}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Crie uma senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    minLength={8}
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar conta e entrar
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Já tem conta?{" "}
              <button
                onClick={() => { setError(null); setStatus("login"); }}
                className="text-primary hover:underline font-medium"
              >
                Fazer login
              </button>
            </p>
          </div>
        )}

        {status === "login" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg text-left">
            <div className="text-center mb-5">
              <UserPlus className="w-10 h-10 text-primary mx-auto mb-2" />
              <h1 className="text-xl font-bold text-foreground">Entrar e aceitar convite</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Organização: <strong className="text-foreground">{orgName}</strong>
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm text-center">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={inviteEmail}
                    readOnly
                    className={`${inputClass} bg-muted cursor-not-allowed opacity-70`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha"
                    className={`${inputClass} pr-10`}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar e aceitar convite
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Não tem conta?{" "}
              <button
                onClick={() => { setError(null); setStatus("register"); }}
                className="text-primary hover:underline font-medium"
              >
                Criar conta
              </button>
            </p>
          </div>
        )}

        {status === "accepting" && (
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground font-medium">Aceitando convite...</p>
            <p className="text-sm text-muted-foreground mt-1">Entrando em {orgName}</p>
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
