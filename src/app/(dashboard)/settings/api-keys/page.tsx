"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Key, Plus, Loader2, Copy, Check, Trash2, AlertTriangle, BookOpen, Search, ChevronDown, ChevronRight } from "lucide-react";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useUIStore } from "@/lib/stores/ui-store";
import { API_CATALOG, ALL_SCOPES, AUTH_DOCS, type EndpointDoc, type EndpointCategory } from "@/lib/api/catalog";

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

type TabId = "keys" | "docs";

export default function ApiKeysPage() {
  const { activeOrgId: orgId } = useUIStore();
  const [tab, setTab] = useState<TabId>("keys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(ALL_SCOPES.map(s => s.value));
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) loadKeys();
  }, [orgId]);

  async function loadKeys() {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/api-keys?org_id=${orgId}`);
      const json = await res.json();
      setKeys(json.data || []);
    } catch (err) {
      console.error("Failed to load keys:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
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
        setShowCreate(false);
        loadKeys();
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
    } finally {
      setCreating(false);
    }
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

  // Group scopes by group
  const scopeGroups = useMemo(() => {
    const groups: Record<string, typeof ALL_SCOPES> = {};
    for (const s of ALL_SCOPES) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    }
    return groups;
  }, []);

  return (
    <PermissionGuard permission="canAccessSettings">
      <div className="p-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Key className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">API</h1>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border mb-6">
          <button
            onClick={() => setTab("keys")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "keys"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Key className="w-4 h-4" />
              Chaves
            </span>
          </button>
          <button
            onClick={() => setTab("docs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "docs"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Documentação
            </span>
          </button>
        </div>

        {tab === "keys" && (
          <KeysTab
            keys={keys}
            loading={loading}
            showCreate={showCreate}
            setShowCreate={setShowCreate}
            newKeyName={newKeyName}
            setNewKeyName={setNewKeyName}
            newKeyScopes={newKeyScopes}
            toggleScope={toggleScope}
            scopeGroups={scopeGroups}
            creating={creating}
            handleCreate={handleCreate}
            createdKey={createdKey}
            setCreatedKey={setCreatedKey}
            copied={copied}
            handleCopy={handleCopy}
            handleDelete={handleDelete}
            deletingId={deletingId}
          />
        )}

        {tab === "docs" && <DocsTab />}
      </div>
    </PermissionGuard>
  );
}

// ============================================================
// Keys Tab
// ============================================================
function KeysTab(props: any) {
  const {
    keys, loading, showCreate, setShowCreate, newKeyName, setNewKeyName,
    newKeyScopes, toggleScope, scopeGroups, creating, handleCreate,
    createdKey, setCreatedKey, copied, handleCopy, handleDelete, deletingId,
  } = props;

  return (
    <>
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
            <div className="mt-2 space-y-3 max-h-72 overflow-y-auto pr-2">
              {Object.entries(scopeGroups).map(([group, scopes]: any) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{group}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {scopes.map((scope: any) => (
                      <label key={scope.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newKeyScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          className="rounded border-input"
                        />
                        <span className="text-foreground text-xs">{scope.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
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
          {keys.map((key: ApiKey) => (
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
    </>
  );
}

// ============================================================
// Docs Tab
// ============================================================
function DocsTab() {
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
    // Open first category by default
    return API_CATALOG.length > 0 ? { [API_CATALOG[0].slug]: true } : {};
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return API_CATALOG;
    const q = search.toLowerCase();
    return API_CATALOG
      .map(cat => ({
        ...cat,
        endpoints: cat.endpoints.filter(
          e =>
            e.path.toLowerCase().includes(q) ||
            e.summary.toLowerCase().includes(q) ||
            e.method.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.endpoints.length > 0);
  }, [search]);

  const totalEndpoints = API_CATALOG.reduce((sum, c) => sum + c.endpoints.length, 0);

  function toggleCategory(slug: string) {
    setOpenCategories(prev => ({ ...prev, [slug]: !prev[slug] }));
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Documentação completa da API v1 — <strong>{totalEndpoints} endpoints</strong> em {API_CATALOG.length} categorias.
        Toda a API pode ser consumida via <strong>Bearer token</strong> (cookie/JWT) ou <strong>API Key</strong>.
      </p>

      {/* Auth panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <AuthBlock title={AUTH_DOCS.bearer.title} description={AUTH_DOCS.bearer.description} example={AUTH_DOCS.bearer.example} />
        <AuthBlock title={AUTH_DOCS.apiKey.title} description={AUTH_DOCS.apiKey.description} example={AUTH_DOCS.apiKey.example} />
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar endpoint (ex: cards, POST, /channels)..."
          className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {filtered.map(cat => (
          <CategoryBlock
            key={cat.slug}
            category={cat}
            isOpen={!!openCategories[cat.slug] || !!search.trim()}
            onToggle={() => toggleCategory(cat.slug)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum endpoint encontrado.</p>
        )}
      </div>
    </div>
  );
}

function AuthBlock({ title, description, example }: { title: string; description: string; example: string }) {
  return (
    <div className="p-3 bg-muted/30 border border-border rounded-lg">
      <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{description}</p>
      <pre className="text-[11px] bg-background border border-border rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap text-foreground">{example}</pre>
    </div>
  );
}

function CategoryBlock({ category, isOpen, onToggle }: { category: EndpointCategory; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="font-medium text-foreground text-sm">{category.name}</span>
          <span className="text-xs text-muted-foreground">— {category.description}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
          {category.endpoints.length}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-border divide-y divide-border">
          {category.endpoints.map((ep, i) => (
            <EndpointBlock key={`${ep.method}-${ep.path}-${i}`} endpoint={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  POST: "bg-green-500/10 text-green-500 border-green-500/30",
  PATCH: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  PUT: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  DELETE: "bg-red-500/10 text-red-500 border-red-500/30",
};

function EndpointBlock({ endpoint }: { endpoint: EndpointDoc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3 bg-background hover:bg-muted/30 transition-colors">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center gap-3">
          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${METHOD_COLORS[endpoint.method]}`}>
            {endpoint.method}
          </span>
          <code className="text-xs font-mono text-foreground">{endpoint.path}</code>
          <span className="text-xs text-muted-foreground flex-1 truncate">— {endpoint.summary}</span>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pl-12 space-y-3 text-xs">
          {endpoint.description && (
            <p className="text-muted-foreground">{endpoint.description}</p>
          )}

          {endpoint.scopes && endpoint.scopes.length > 0 && (
            <div>
              <p className="font-semibold text-foreground mb-1">Scopes (API Key)</p>
              <div className="flex gap-1 flex-wrap">
                {endpoint.scopes.map(s => (
                  <code key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                    {s}
                  </code>
                ))}
              </div>
            </div>
          )}

          {endpoint.query && endpoint.query.length > 0 && (
            <ParamTable title="Query Params" params={endpoint.query} />
          )}

          {endpoint.body && endpoint.body.length > 0 && (
            <ParamTable title="Body" params={endpoint.body} />
          )}

          {endpoint.response_example && (
            <div>
              <p className="font-semibold text-foreground mb-1">Resposta exemplo</p>
              <pre className="bg-muted/50 border border-border rounded p-2 overflow-x-auto font-mono text-[11px] text-foreground">{endpoint.response_example}</pre>
            </div>
          )}

          {/* curl example */}
          <div>
            <p className="font-semibold text-foreground mb-1">curl</p>
            <pre className="bg-muted/50 border border-border rounded p-2 overflow-x-auto font-mono text-[11px] text-foreground">
{`curl -X ${endpoint.method} 'https://hub.eiai.com.br${endpoint.path.replace(/:(\w+)/g, "<$1>")}' \\
  -H 'X-API-Key: eiai_xxxxxxxxxxxx'${endpoint.body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '{...}'` : ""}`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamTable({ title, params }: { title: string; params: { name: string; type: string; required?: boolean; description: string }[] }) {
  return (
    <div>
      <p className="font-semibold text-foreground mb-1">{title}</p>
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2 py-1 font-semibold text-foreground">Nome</th>
              <th className="text-left px-2 py-1 font-semibold text-foreground">Tipo</th>
              <th className="text-left px-2 py-1 font-semibold text-foreground">Descrição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {params.map(p => (
              <tr key={p.name}>
                <td className="px-2 py-1 font-mono">
                  {p.name}
                  {p.required && <span className="text-red-500 ml-1">*</span>}
                </td>
                <td className="px-2 py-1 font-mono text-muted-foreground">{p.type}</td>
                <td className="px-2 py-1 text-muted-foreground">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
