"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Key, Plus, Loader2, Copy, Check, Trash2, AlertTriangle } from "lucide-react";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useUIStore } from "@/lib/stores/ui-store";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  rate_limit: number;
  created_at: string;
  profiles?: { full_name: string; email: string };
}

const AVAILABLE_SCOPES = [
  { value: "read:boards", label: "Ler boards" },
  { value: "write:boards", label: "Escrever boards" },
  { value: "read:cards", label: "Ler cards" },
  { value: "write:cards", label: "Escrever cards" },
  { value: "read:orgs", label: "Ler organização" },
  { value: "read:users", label: "Ler usuários" },
  { value: "write:users", label: "Escrever usuários" },
];

export default function ApiKeysPage() {
  const { activeOrgId: orgId } = useUIStore();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(AVAILABLE_SCOPES.map(s => s.value));
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) loadKeys();
  }, [orgId]);

  async function loadKeys() {
    setLoading(true);
    const res = await fetch(`/api/v1/api-keys?org_id=${orgId}`);
    const json = await res.json();
    setKeys(json.data || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);

    const res = await fetch("/api/v1/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        name: newKeyName.trim(),
        scopes: newKeyScopes,
      }),
    });

    const json = await res.json();
    if (json.data?.key) {
      setCreatedKey(json.data.key);
      setNewKeyName("");
      loadKeys();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/v1/api-keys?id=${id}&org_id=${orgId}`, { method: "DELETE" });
    loadKeys();
    setDeletingId(null);
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function toggleScope(scope: string) {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  return (
    <PermissionGuard permission="canAccessSettings">
      <div className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Key className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Gerencie chaves de acesso à API para integrações externas, aplicativos mobile e automações.
          As chaves permitem acesso autenticado aos endpoints <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/v1/*</code>.
        </p>

        {/* Created key banner */}
        {createdKey && (
          <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground mb-1">Chave criada com sucesso!</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Copie agora — esta chave não será exibida novamente.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background border border-input rounded-lg px-3 py-2 font-mono break-all select-all">
                    {createdKey}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate ? (
          <form onSubmit={handleCreate} className="mb-6 p-4 bg-card border border-border rounded-xl space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da chave</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Ex: App Mobile, Zapier, Dashboard externo"
                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Permissões</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {AVAILABLE_SCOPES.map(scope => (
                  <label key={scope.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="rounded border-input"
                    />
                    <span className="text-foreground">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newKeyName.trim()}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar chave
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewKeyName(""); }}
                className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="mb-6 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Nova API Key
          </button>
        )}

        {/* Keys list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma API key criada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map(key => (
              <div
                key={key.id}
                className={`p-4 bg-card border rounded-xl ${key.is_active ? "border-border" : "border-border opacity-60"}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{key.name}</p>
                      {!key.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                          Desativada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {key.key_prefix}...
                    </p>
                  </div>
                  {key.is_active && (
                    <button
                      onClick={() => handleDelete(key.id)}
                      disabled={deletingId === key.id}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Desativar chave"
                    >
                      {deletingId === key.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Criada em {new Date(key.created_at).toLocaleDateString("pt-BR")}</span>
                  {key.last_used_at && (
                    <span>Último uso: {new Date(key.last_used_at).toLocaleDateString("pt-BR")}</span>
                  )}
                  <span>{key.rate_limit} req/min</span>
                  <span>{key.scopes.length} permissões</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Documentation hint */}
        <div className="mt-8 p-4 bg-muted/50 rounded-xl">
          <h3 className="text-sm font-medium text-foreground mb-2">Como usar</h3>
          <div className="text-xs text-muted-foreground space-y-1.5 font-mono">
            <p># Login com email/senha:</p>
            <p className="pl-2">POST /api/v1/auth/login</p>
            <p className="pl-2">{`Body: { "email": "...", "password": "..." }`}</p>
            <p className="mt-2"># Ou use API Key no header:</p>
            <p className="pl-2">X-API-Key: eiai_xxxxx...</p>
            <p className="mt-2"># Com Bearer token, inclua o org:</p>
            <p className="pl-2">Authorization: Bearer &lt;token&gt;</p>
            <p className="pl-2">X-Org-Id: &lt;org_id&gt;</p>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
