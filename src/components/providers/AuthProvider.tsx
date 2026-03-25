"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

interface AuthContextType {
  user: any;
  profile: any;
  organizations: any[];
  orgId: string;
  supabase: ReturnType<typeof createClient>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    user: any;
    profile: any;
    organizations: any[];
    orgId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    async function loadUser(userId: string, userEmail?: string) {
      // Fetch profile + orgs in parallel — single round trip
      const [profileRes, orgsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("org_members").select("org_id, organizations(*)").eq("user_id", userId),
      ]);

      if (!mounted) return;

      const orgs = orgsRes.data?.map((o: any) => o.organizations).filter(Boolean) ?? [];

      if (orgs.length === 0) {
        if (userEmail) {
          try {
            const res = await fetch(`/api/invite/check?email=${encodeURIComponent(userEmail)}`);
            if (res.ok) {
              const { token } = await res.json();
              if (token) {
                router.replace(`/invite/${token}`);
                return;
              }
            }
          } catch {}
        }
        router.replace("/register");
        return;
      }

      return { profile: profileRes.data, organizations: orgs, orgId: orgsRes.data?.[0]?.org_id || "" };
    }

    // Initial session check
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      const result = await loadUser(session.user.id, session.user.email);
      if (!mounted || !result) return;

      setState({ user: session.user, ...result });
      setLoading(false);
    })();

    // Listen for auth state changes (token refresh failures, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || (!session && event === "TOKEN_REFRESHED")) {
        // Session lost — redirect to login to stop reconnection loops
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state?.user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", state.user.id).single();
    if (data) setState((prev) => prev ? { ...prev, profile: data } : prev);
  }, [state?.user, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state) return null;

  return (
    <AuthContext.Provider value={{ ...state, supabase, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
