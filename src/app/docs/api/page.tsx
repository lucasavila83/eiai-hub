import { API_CATALOG, ALL_SCOPES, type EndpointDoc } from "@/lib/api/catalog";

export const metadata = {
  title: "EIAI Hub API — Documentação",
  description: "Referência pública da API v1 do EIAI Hub.",
};

const BASE_URL = "https://eiai-hub.vercel.app";

const methodColors: Record<string, string> = {
  GET: "#0ea5e9",
  POST: "#16a34a",
  PATCH: "#d97706",
  PUT: "#d97706",
  DELETE: "#dc2626",
};

function curlExample(ep: EndpointDoc): string {
  const path = ep.path.replace(/:(\w+)/g, "<$1>");
  const lines = [
    `curl -X ${ep.method} '${BASE_URL}${path}' \\`,
    `  -H 'X-API-Key: eiai_xxxxxxxxxxxx'`,
  ];
  if (ep.body) {
    lines[lines.length - 1] += ` \\`;
    lines.push(`  -H 'Content-Type: application/json' \\`);
    if (ep.body_example) {
      // Inline the example body, escaping single quotes for shell
      const escaped = ep.body_example.replace(/'/g, `'\\''`);
      lines.push(`  -d '${escaped}'`);
    } else {
      lines.push(`  -d '{...}'`);
    }
  }
  return lines.join("\n");
}

function ParamTable({ title, params }: { title: string; params: EndpointDoc["query"] }) {
  if (!params || params.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="font-semibold text-sm mb-1">{title}</p>
      <table className="w-full text-sm border border-neutral-300 rounded overflow-hidden">
        <thead className="bg-neutral-100">
          <tr>
            <th className="text-left px-2 py-1 font-medium w-40">Nome</th>
            <th className="text-left px-2 py-1 font-medium w-40">Tipo</th>
            <th className="text-left px-2 py-1 font-medium">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t border-neutral-200">
              <td className="px-2 py-1 font-mono">
                {p.name}
                {p.required && <span className="text-red-600 ml-1">*</span>}
              </td>
              <td className="px-2 py-1 font-mono text-neutral-700">{p.type}</td>
              <td className="px-2 py-1 text-neutral-700">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointBlock({ ep }: { ep: EndpointDoc }) {
  const color = methodColors[ep.method] || "#525252";
  return (
    <div className="border border-neutral-300 rounded-lg p-4 bg-white mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white font-mono"
          style={{ backgroundColor: color }}
        >
          {ep.method}
        </span>
        <code className="font-mono text-sm text-neutral-800 break-all">{ep.path}</code>
      </div>
      <p className="mt-2 text-sm text-neutral-800">{ep.summary}</p>
      {ep.description && (
        <p className="mt-1 text-sm text-neutral-600">{ep.description}</p>
      )}
      {ep.scopes && ep.scopes.length > 0 && (
        <div className="mt-2 text-xs">
          <span className="text-neutral-500">Scopes necessários (API Key): </span>
          {ep.scopes.map((s) => (
            <code
              key={s}
              className="inline-block bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.5 mr-1 font-mono"
            >
              {s}
            </code>
          ))}
        </div>
      )}
      <ParamTable title="Query parameters" params={ep.query} />
      <ParamTable title="Body" params={ep.body} />
      {ep.body_example && (
        <div className="mt-3">
          <p className="font-semibold text-sm mb-1">Exemplo de body</p>
          <pre className="bg-neutral-50 border border-neutral-200 text-xs font-mono rounded p-3 overflow-x-auto text-neutral-800">
{ep.body_example}
          </pre>
        </div>
      )}
      <div className="mt-3">
        <p className="font-semibold text-sm mb-1">curl</p>
        <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono rounded p-3 overflow-x-auto">
{curlExample(ep)}
        </pre>
      </div>
      {ep.response_example && (
        <div className="mt-3">
          <p className="font-semibold text-sm mb-1">Resposta exemplo</p>
          <pre className="bg-neutral-50 border border-neutral-200 text-xs font-mono rounded p-3 overflow-x-auto text-neutral-800">
{ep.response_example}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  const totalEndpoints = API_CATALOG.reduce((sum, c) => sum + c.endpoints.length, 0);

  const scopesByGroup = ALL_SCOPES.reduce<Record<string, typeof ALL_SCOPES>>((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top bar */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">EIAI Hub — API v1</h1>
            <p className="text-xs text-neutral-600">Documentação pública da API REST</p>
          </div>
          <code className="text-xs bg-neutral-100 border border-neutral-200 rounded px-2 py-1 font-mono">
            {BASE_URL}
          </code>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        {/* Sidebar TOC */}
        <nav className="md:sticky md:top-24 self-start">
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
            Conteúdo
          </p>
          <ul className="text-sm space-y-1">
            <li><a className="text-sky-700 hover:underline" href="#intro">Introdução</a></li>
            <li><a className="text-sky-700 hover:underline" href="#auth">Autenticação</a></li>
            <li><a className="text-sky-700 hover:underline" href="#errors">Erros</a></li>
            <li><a className="text-sky-700 hover:underline" href="#scopes">Scopes</a></li>
            <li className="pt-2 text-xs font-bold text-neutral-500 uppercase">Endpoints</li>
            {API_CATALOG.map((cat) => (
              <li key={cat.slug}>
                <a className="text-sky-700 hover:underline" href={`#cat-${cat.slug}`}>
                  {cat.name}{" "}
                  <span className="text-neutral-400">({cat.endpoints.length})</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main>
          {/* Intro */}
          <section id="intro" className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Introdução</h2>
            <p className="text-neutral-700 leading-relaxed">
              A API v1 do EIAI Hub expõe recursos de organizações, usuários,
              boards/kanban, chat, BPM, metas, calendário, notificações e automações.
              Todas as respostas são JSON, com o formato{" "}
              <code className="bg-neutral-100 px-1 rounded">{"{ \"data\": ... }"}</code>{" "}
              em sucesso e{" "}
              <code className="bg-neutral-100 px-1 rounded">{"{ \"error\": { \"code\", \"message\" } }"}</code>{" "}
              em erro.
            </p>
            <p className="text-neutral-700 leading-relaxed mt-2">
              <strong>Base URL:</strong>{" "}
              <code className="bg-neutral-100 px-1 rounded">{BASE_URL}</code>
            </p>
            <p className="text-neutral-700 leading-relaxed mt-2">
              Total de endpoints nesta versão: <strong>{totalEndpoints}</strong>.
            </p>
          </section>

          {/* Auth */}
          <section id="auth" className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Autenticação</h2>
            <p className="text-neutral-700 leading-relaxed">
              Dois métodos de autenticação suportados:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-neutral-700">
              <li>
                <strong>API Key</strong> — crie em{" "}
                <em>Configurações → API Keys</em>. Use o header{" "}
                <code className="bg-neutral-100 px-1 rounded">X-API-Key: eiai_...</code>.
                O acesso é limitado pelos <em>scopes</em> selecionados na criação da chave.
              </li>
              <li>
                <strong>Bearer token</strong> (JWT do Supabase) — obtido via{" "}
                <code className="bg-neutral-100 px-1 rounded">/api/v1/auth/login</code>.
                Envie o token como{" "}
                <code className="bg-neutral-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code>{" "}
                e o header{" "}
                <code className="bg-neutral-100 px-1 rounded">X-Org-Id: &lt;orgId&gt;</code>{" "}
                para indicar a organização ativa. Bearer tem acesso completo baseado no
                role do usuário (sem restrição de scopes).
              </li>
            </ul>
          </section>

          {/* Errors */}
          <section id="errors" className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Erros</h2>
            <p className="text-neutral-700 leading-relaxed mb-2">
              Respostas de erro seguem o padrão:
            </p>
            <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono rounded p-3 overflow-x-auto">
{`{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key."
  }
}`}
            </pre>
            <table className="w-full text-sm border border-neutral-300 rounded overflow-hidden mt-3">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="text-left px-2 py-1 font-medium w-40">Código</th>
                  <th className="text-left px-2 py-1 font-medium w-20">HTTP</th>
                  <th className="text-left px-2 py-1 font-medium">Quando acontece</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                <tr><td className="px-2 py-1 font-mono">UNAUTHORIZED</td><td className="px-2 py-1">401</td><td className="px-2 py-1">Sem auth ou token/API key inválidos</td></tr>
                <tr><td className="px-2 py-1 font-mono">FORBIDDEN</td><td className="px-2 py-1">403</td><td className="px-2 py-1">Sem permissão/role ou scope ausente</td></tr>
                <tr><td className="px-2 py-1 font-mono">NOT_FOUND</td><td className="px-2 py-1">404</td><td className="px-2 py-1">Recurso não encontrado na org</td></tr>
                <tr><td className="px-2 py-1 font-mono">VALIDATION_ERROR</td><td className="px-2 py-1">400</td><td className="px-2 py-1">Body inválido / campo obrigatório</td></tr>
                <tr><td className="px-2 py-1 font-mono">CONFLICT</td><td className="px-2 py-1">409</td><td className="px-2 py-1">Estado conflita (ex.: já é membro)</td></tr>
                <tr><td className="px-2 py-1 font-mono">RATE_LIMITED</td><td className="px-2 py-1">429</td><td className="px-2 py-1">Rate limit da API Key atingido</td></tr>
                <tr><td className="px-2 py-1 font-mono">INTERNAL_ERROR</td><td className="px-2 py-1">500</td><td className="px-2 py-1">Erro inesperado no servidor</td></tr>
              </tbody>
            </table>
          </section>

          {/* Scopes */}
          <section id="scopes" className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Scopes</h2>
            <p className="text-neutral-700 leading-relaxed mb-3">
              Ao criar uma API Key, selecione os scopes necessários. Use{" "}
              <code className="bg-neutral-100 px-1 rounded">*</code> para acesso total.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(scopesByGroup).map(([group, scopes]) => (
                <div key={group} className="border border-neutral-300 rounded p-3 bg-white">
                  <p className="font-semibold text-sm mb-1">{group}</p>
                  <ul className="text-sm space-y-1">
                    {scopes.map((s) => (
                      <li key={s.value} className="flex gap-2">
                        <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">
                          {s.value}
                        </code>
                        <span className="text-neutral-600">{s.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Categories */}
          {API_CATALOG.map((cat) => (
            <section key={cat.slug} id={`cat-${cat.slug}`} className="mb-10">
              <h2 className="text-2xl font-bold mb-1">{cat.name}</h2>
              <p className="text-neutral-600 mb-4">{cat.description}</p>
              {cat.endpoints.map((ep, i) => (
                <EndpointBlock key={`${ep.method}-${ep.path}-${i}`} ep={ep} />
              ))}
            </section>
          ))}

          <footer className="text-xs text-neutral-500 pt-8 border-t border-neutral-200">
            EIAI Hub · API v1 · Gerado automaticamente a partir do catálogo do servidor.
          </footer>
        </main>
      </div>
    </div>
  );
}
