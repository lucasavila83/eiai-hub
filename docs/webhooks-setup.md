# Sistema de Webhooks — Guia de Setup

Este documento explica como ativar o sistema de webhooks de saída (outbound) no EIAI Hub depois de aplicar a migration `039_webhook_dispatch.sql`.

## Visão geral

Arquitetura:

```
[Postgres trigger] → pg_net POST → [/api/events/webhook-intake]
                                          ↓
                               (resolve evento + filtros)
                                          ↓
                               [integrations table lookup]
                                          ↓
                               POST paralelo para URLs configuradas
                                          ↓
                               Log em [webhook_deliveries]
```

## Passos de setup

### 1. Aplicar a migration

No painel do Supabase → SQL Editor, rode o conteúdo de `supabase/migrations/039_webhook_dispatch.sql`. Isso:

- Adiciona a coluna `integrations.filters` (jsonb)
- Cria a tabela `webhook_deliveries`
- Cria a tabela `app_settings`
- Instala/habilita a extensão `pg_net`
- Cria a função `notify_webhook_intake()`
- Anexa triggers em: `cards`, `bpm_cards`, `messages`, `org_members`, `card_comments`, `bpm_card_comments`, `events`, `card_assignees`

### 2. Gerar um secret compartilhado

Em qualquer terminal:

```bash
openssl rand -hex 32
# ou no PowerShell:
[Convert]::ToBase64String((1..32 | %{ Get-Random -Max 256 }))
```

Copie o valor resultante.

### 3. Configurar o secret em DOIS lugares (precisam ser iguais)

**a) Postgres (Supabase SQL Editor):**

```sql
UPDATE app_settings
   SET value = 'SEU_SECRET_AQUI',
       updated_at = NOW()
 WHERE key = 'webhook_intake_secret';

-- Opcional: se o domínio de produção mudar no futuro
UPDATE app_settings
   SET value = 'https://eiai-hub.vercel.app/api/events/webhook-intake'
 WHERE key = 'webhook_intake_url';
```

**b) Vercel (Project Settings → Environment Variables):**

Adicione:

| Name | Value | Environment |
|---|---|---|
| `WEBHOOK_INTAKE_SECRET` | `SEU_SECRET_AQUI` | Production, Preview, Development |
| `CRON_SECRET` | (mesmo valor ou outro) | Production |

Depois, faça um redeploy para aplicar as env vars.

### 4. Testar o health check

```bash
curl https://eiai-hub.vercel.app/api/events/webhook-intake
# esperado: {"ok":true,"service":"webhook-intake",...}
```

### 5. Criar uma integração de teste

1. Gere um webhook de teste em https://webhook.site — copie a URL única
2. No Hub: **Integrações → Nova Integração → Webhook**
3. Cole a URL do webhook.site em "URL do Webhook"
4. Marque os eventos desejados (ex.: `Processo: card criado`)
5. (Opcional) Escolha Processo e Fase específicos no bloco "Filtros"
6. Salvar

### 6. Disparar evento real

- Crie/mova um card que bata com os filtros configurados
- Abra webhook.site — deve aparecer o POST em ~1s
- No Hub: Integrações → clique no ícone de **histórico** ao lado da integração — deve mostrar a entrega com status 200

## Estrutura do payload enviado

Todo webhook recebe um POST com `Content-Type: application/json` neste formato:

```json
{
  "event": "bpm_card.moved",
  "org_id": "00000000-0000-0000-0000-000000000000",
  "timestamp": "2026-04-20T12:34:56.789Z",
  "data": {
    "bpm_card": {
      "id": "...", "title": "Amostra Cliente X",
      "priority": "high", "sla_deadline": "2026-04-22T00:00:00Z",
      "started_at": "...", "completed_at": null, "is_archived": false,
      "created_at": "...", "updated_at": "..."
    },
    "pipe": { "id": "...", "name": "Amostras", "org_id": "..." },
    "phase": { "id": "...", "name": "Preparando Envio", "position": 2, "color": "#3b82f6" },
    "assignee": { "id": "...", "full_name": "Andressa", "email": "..." },
    "created_by": { "id": "...", "full_name": "...", "email": "..." },
    "field_values": {
      "codigo_etiqueta": { "label": "Código de Etiqueta", "type": "text", "value": "02321313" },
      "tamanho_caixas":  { "label": "Tamanho das Caixas", "type": "select", "value": "cx_pequena" }
    }
  }
}
```

Headers adicionais:
- `User-Agent: eiai-hub-webhook/1.0`
- `X-Event-Type: <event>` (ex.: `bpm_card.moved`)

## Eventos disponíveis

### Kanban (Boards)
- `card.created`, `card.updated`, `card.moved`, `card.completed`, `card.overdue`
- `card.assigned`, `card.unassigned`, `card.comment_added`, `card.deleted`

### BPM (Processos)
- `bpm_card.created`, `bpm_card.moved`, `bpm_card.completed`, `bpm_card.overdue`
- `bpm_card.comment_added`, `bpm_card.deleted`

### Chat
- `message.sent`

### Membros
- `member.joined`

### Calendário
- `event.created`, `event.updated`, `event.deleted`

## Filtros

Cada integração pode restringir disparos a contextos específicos via `integrations.filters` (jsonb). Chaves suportadas:

| Chave | Aplica-se a | Efeito |
|---|---|---|
| `pipe_id` | `bpm_card.*` | Só dispara para esse processo |
| `phase_id` | `bpm_card.created`, `bpm_card.completed`, etc. | Só dispara quando card está nessa fase |
| `from_phase_id` + `to_phase_id` | `bpm_card.moved` | Só dispara em movimentos específicos |
| `board_id` | `card.*` | Só dispara para esse board |
| `column_id` | `card.created`, `card.completed`, etc. | Só dispara quando na coluna |
| `from_column_id` + `to_column_id` | `card.moved` | Só dispara em movimentos específicos |

Chaves não preenchidas = wildcard (dispara para qualquer valor).

## Troubleshooting

**Nada está chegando no webhook.site:**
1. Verificar que o secret está igual no DB e na Vercel
2. Verificar que a integração está ativa (toggle play/pause)
3. Verificar que o evento está marcado na integração
4. Verificar que o filtro, se houver, bate com o contexto do evento
5. Abrir Logs do Vercel → procurar POST em `/api/events/webhook-intake`
6. No Supabase → Database → Extensions → `pg_net` precisa estar habilitado
7. No Supabase → SQL Editor: `SELECT * FROM net.http_response_collect() ORDER BY id DESC LIMIT 10;` mostra respostas do pg_net

**O histórico mostra erros HTTP 4xx/5xx:**
- A URL do webhook está errada ou o serviço de destino está fora
- O payload foi enviado mas o destino rejeitou — veja `response_body` no histórico

**Cards atrasados não disparam `card.overdue`:**
- Esse evento é disparado por cron (uma vez ao dia, 09:00 BRT)
- Para disparo manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://eiai-hub.vercel.app/api/cron/check-overdue`

## Compatibilidade

- **n8n**: use o nó "Webhook" em modo "Listen". A URL fica em `Webhooks → Production URL`. Cole no campo "URL do Webhook" da integração.
- **Zapier**: use o trigger "Webhooks by Zapier → Catch Hook". Cole a URL gerada.
- **Sistema próprio**: qualquer endpoint HTTP(S) que aceite POST JSON funciona. Recomendado responder 2xx rapidamente (<10s) — o dispatcher tem timeout de 10s.
