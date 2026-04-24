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
        supabase.from("org_members").select("org_id, role, joined_at, organizations(*)").eq("user_id", userId),
      ]);

      if (!mounted) return;

      const memberships = orgsRes.data ?? [];

      // Sort: prefer orgs where user is NOT owner (team orgs first), then by oldest join
      memberships.sort((a: any, b: any) => {
        const aIsOwner = a.role === "owner" ? 1 : 0;
        const bIsOwner = b.role === "owner" ? 1 : 0;
        if (aIsOwner !== bIsOwner) return aIsOwner - bIsOwner;
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      });

      const orgs = memberships.map((o: any) => o.organizations).filter(Boolean);

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

      return { profile: profileRes.data, organizations: orgs, orgId: memberships[0]?.org_id || "" };
    }

    // Initial session check — hard-cap at 15s so a hung network (the
    // classic mobile-data hiccup) can't leave the user staring at a
    // spinner forever. If the check doesn't return in time, bounce them
    // to /login and let them retry from a fresh page.
    (async () => {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("auth-timeout")), 15000);
      });

      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          timeout,
        ]);
        const session = (sessionResult as any)?.data?.session;

        if (!session?.user) {
          router.replace("/login");
          return;
        }

        const result = await Promise.race([
          loadUser(session.user.id, session.user.email),
          timeout,
        ]);
        if (!mounted || !result) return;

        setState({ user: session.user, ...result });
        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        // eslint-disable-next-line no-console
        console.warn("[Auth] session check failed/timed out:", err);
        router.replace("/login");
      }
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
