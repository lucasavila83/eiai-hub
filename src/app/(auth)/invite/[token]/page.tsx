"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Zap, CheckCircle, XCircle, UserPlus } from "lucide-react";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<"loading" | "login-needed" | "accepting" | "accepted" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");

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
      setError("Convite não encontrado ou já foi utilizado.");
      return;
    }

    if (invite.accepted_at) {
      setStatus("error");
      setError("Este convite já foi aceito.");
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      setStatus("error");
      setError("Este convite expirou.");
      return;
    }

    setOrgName((invite as any).organizations?.name || "");
    setInviteEmail(invite.email);

    // Check if user is logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      acceptInvite(session.access_token);
    } else {
      setStatus("login-needed");
    }
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

        {status === "login-needed" && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <UserPlus className="w-10 h-10 text-primary mx-auto mb-3" />
            <h1 className="text-xl font-bold text-foreground mb-2">
              Você foi convidado!
            </h1>
            <p className="text-muted-foreground mb-1">
              Para entrar na organização <strong className="text-foreground">{orgName}</strong>
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Convite para: <strong>{inviteEmail}</strong>
            </p>
            <div className="space-y-3">
              <Link
                href={`/login?redirect=/invite/${token}`}
                className="block w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors text-center"
              >
                Fazer login e aceitar
              </Link>
              <Link
                href={`/register?redirect=/invite/${token}`}
                className="block w-full border border-border text-foreground py-2.5 rounded-lg font-medium text-sm hover:bg-accent transition-colors text-center"
              >
                Criar conta e aceitar
              </Link>
            </div>
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
