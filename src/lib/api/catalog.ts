/**
 * API v1 Endpoint Catalog
 * Single source of truth for documentation rendered in /settings/api-keys
 *
 * When adding a new endpoint, register it here so it appears in the docs tab.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface EndpointParam {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface EndpointDoc {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  scopes?: string[]; // Required scopes for API Key auth (Bearer = full access)
  query?: EndpointParam[];
  body?: EndpointParam[];
  response_example?: string;
}

export interface EndpointCategory {
  slug: string;
  name: string;
  description: string;
  endpoints: EndpointDoc[];
}

// ---------- All scopes available in the system ----------
export const ALL_SCOPES: { value: string; label: string; group: string }[] = [
  { value: "read:orgs", label: "Ler organização", group: "Org" },
  { value: "write:orgs", label: "Editar organização", group: "Org" },
  { value: "read:users", label: "Ler usuários", group: "Usuários" },
  { value: "write:users", label: "Editar usuários", group: "Usuários" },
  { value: "read:teams", label: "Ler times", group: "Times" },
  { value: "write:teams", label: "Editar times", group: "Times" },
  { value: "read:boards", label: "Ler boards", group: "Boards" },
  { value: "write:boards", label: "Editar boards", group: "Boards" },
  { value: "read:cards", label: "Ler cards", group: "Cards" },
  { value: "write:cards", label: "Editar cards", group: "Cards" },
  { value: "read:labels", label: "Ler labels", group: "Cards" },
  { value: "write:labels", label: "Editar labels", group: "Cards" },
  { value: "read:channels", label: "Ler canais", group: "Chat" },
  { value: "write:channels", label: "Editar canais", group: "Chat" },
  { value: "read:messages", label: "Ler mensagens", group: "Chat" },
  { value: "write:messages", label: "Enviar mensagens", group: "Chat" },
  { value: "read:bpm", label: "Ler BPM (pipes/cards)", group: "BPM" },
  { value: "write:bpm", label: "Editar BPM (pipes/cards)", group: "BPM" },
  { value: "read:goals", label: "Ler metas", group: "Metas" },
  { value: "write:goals", label: "Editar metas", group: "Metas" },
  { value: "read:events", label: "Ler eventos", group: "Calendário" },
  { value: "write:events", label: "Editar eventos", group: "Calendário" },
  { value: "read:notifications", label: "Ler notificações", group: "Notificações" },
  { value: "write:notifications", label: "Editar notificações", group: "Notificações" },
  { value: "read:automations", label: "Ler automações", group: "Automações" },
  { value: "write:automations", label: "Editar automações", group: "Automações" },
];

// ---------- Catalog ----------
export const API_CATALOG: EndpointCategory[] = [
  {
    slug: "auth",
    name: "Autenticação",
    description: "Login, refresh e perfil do usuário autenticado.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/auth/login",
        summary: "Login com email e senha",
        description: "Retorna access_token e refresh_token. Use o access_token no header Authorization: Bearer <token> para chamadas autenticadas.",
        body: [
          { name: "email", type: "string", required: true, description: "Email do usuário" },
          { name: "password", type: "string", required: true, description: "Senha" },
        ],
        response_example: `{ "data": { "access_token": "...", "refresh_token": "...", "user": {...} } }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/refresh",
        summary: "Renovar access token",
        body: [{ name: "refresh_token", type: "string", required: true, description: "Refresh token recebido no login" }],
      },
      {
        method: "GET",
        path: "/api/v1/auth/me",
        summary: "Perfil do usuário autenticado",
        description: "Requer Bearer token. Retorna dados do usuário, organizações e permissões.",
      },
    ],
  },
  {
    slug: "orgs",
    name: "Organizações",
    description: "Gerenciamento de organizações e membros.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/orgs",
        summary: "Listar organizações do usuário",
        scopes: ["read:orgs"],
      },
      {
        method: "GET",
        path: "/api/v1/orgs/:orgId/members",
        summary: "Listar membros da organização",
        scopes: ["read:users"],
        query: [
          { name: "page", type: "number", description: "Página (padrão 1)" },
          { name: "limit", type: "number", description: "Por página, máx 100 (padrão 20)" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/v1/orgs/:orgId/members/:memberId",
        summary: "Atualizar role/nome de um membro",
        scopes: ["write:users"],
        body: [
          { name: "role", type: "owner|admin|member|guest", description: "Novo papel" },
          { name: "full_name", type: "string", description: "Novo nome" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/orgs/:orgId/members/:memberId",
        summary: "Remover membro da organização",
        scopes: ["write:users"],
      },
    ],
  },
  {
    slug: "users",
    name: "Usuários",
    description: "Perfis individuais.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/users/:userId",
        summary: "Detalhes de um usuário",
        scopes: ["read:users"],
      },
    ],
  },
  {
    slug: "boards",
    name: "Boards",
    description: "Quadros Kanban: boards, colunas, cards.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/boards",
        summary: "Listar boards",
        scopes: ["read:boards"],
        query: [
          { name: "page", type: "number", description: "Página" },
          { name: "limit", type: "number", description: "Por página" },
          { name: "sort", type: "name|created_at|updated_at", description: "Campo de ordenação" },
          { name: "order", type: "asc|desc", description: "Direção" },
          { name: "archived", type: "boolean", description: "Listar arquivados" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/boards",
        summary: "Criar board",
        scopes: ["write:boards"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome do board" },
          { name: "description", type: "string", description: "Descrição" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/boards/:boardId",
        summary: "Detalhes do board (com colunas e contagens)",
        scopes: ["read:boards"],
      },
      {
        method: "PATCH",
        path: "/api/v1/boards/:boardId",
        summary: "Atualizar board",
        scopes: ["write:boards"],
        body: [
          { name: "name", type: "string", description: "Novo nome" },
          { name: "description", type: "string", description: "Nova descrição" },
          { name: "is_archived", type: "boolean", description: "Arquivar/desarquivar" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/boards/:boardId",
        summary: "Arquivar board (soft delete)",
        scopes: ["write:boards"],
      },
      {
        method: "GET",
        path: "/api/v1/boards/:boardId/columns",
        summary: "Listar colunas do board",
        scopes: ["read:boards"],
      },
      {
        method: "POST",
        path: "/api/v1/boards/:boardId/columns",
        summary: "Criar coluna",
        scopes: ["write:boards"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome da coluna" },
          { name: "color", type: "string", description: "Cor hex (#RRGGBB)" },
          { name: "position", type: "number", description: "Posição" },
        ],
      },
    ],
  },
  {
    slug: "cards",
    name: "Cards",
    description: "Tarefas dentro dos boards. Suporta assignees, comentários, subtasks e anexos.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/cards",
        summary: "Listar cards",
        scopes: ["read:cards"],
        query: [
          { name: "board_id", type: "uuid", description: "Filtrar por board" },
          { name: "column_id", type: "uuid", description: "Filtrar por coluna" },
          { name: "assignee_id", type: "uuid", description: "Filtrar por responsável" },
          { name: "priority", type: "urgent|high|medium|low|none", description: "Prioridade" },
          { name: "is_archived", type: "boolean", description: "Arquivados" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/cards",
        summary: "Criar card",
        scopes: ["write:cards"],
        body: [
          { name: "board_id", type: "uuid", required: true, description: "Board" },
          { name: "column_id", type: "uuid", required: true, description: "Coluna" },
          { name: "title", type: "string", required: true, description: "Título" },
          { name: "description", type: "string", description: "Descrição" },
          { name: "priority", type: "string", description: "Prioridade" },
          { name: "due_date", type: "ISO date", description: "Data de vencimento" },
          { name: "assignee_ids", type: "uuid[]", description: "IDs de usuários a atribuir" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/cards/:cardId",
        summary: "Detalhes do card (com assignees, subtasks, labels, anexos)",
        scopes: ["read:cards"],
      },
      {
        method: "PATCH",
        path: "/api/v1/cards/:cardId",
        summary: "Atualizar card",
        scopes: ["write:cards"],
        body: [
          { name: "title", type: "string", description: "Novo título" },
          { name: "description", type: "string", description: "Nova descrição" },
          { name: "priority", type: "string", description: "Prioridade" },
          { name: "due_date", type: "ISO date", description: "Vencimento" },
          { name: "column_id", type: "uuid", description: "Mover de coluna" },
          { name: "position", type: "number", description: "Reordenar" },
          { name: "is_archived", type: "boolean", description: "Arquivar" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/cards/:cardId",
        summary: "Arquivar card (soft delete)",
        scopes: ["write:cards"],
      },
      {
        method: "GET",
        path: "/api/v1/cards/:cardId/comments",
        summary: "Listar comentários do card",
        scopes: ["read:cards"],
      },
      {
        method: "POST",
        path: "/api/v1/cards/:cardId/comments",
        summary: "Adicionar comentário",
        scopes: ["write:cards"],
        body: [{ name: "content", type: "string", required: true, description: "Texto do comentário" }],
      },
      {
        method: "GET",
        path: "/api/v1/cards/:cardId/subtasks",
        summary: "Listar subtarefas",
        scopes: ["read:cards"],
      },
      {
        method: "POST",
        path: "/api/v1/cards/:cardId/subtasks",
        summary: "Criar subtarefa",
        scopes: ["write:cards"],
        body: [
          { name: "title", type: "string", required: true, description: "Título" },
          { name: "assigned_to", type: "uuid", description: "Usuário atribuído" },
          { name: "due_date", type: "ISO date", description: "Vencimento" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/cards/:cardId/assignees",
        summary: "Listar responsáveis pelo card",
        scopes: ["read:cards"],
      },
      {
        method: "POST",
        path: "/api/v1/cards/:cardId/assignees",
        summary: "Atribuir usuário ao card",
        scopes: ["write:cards"],
        body: [{ name: "user_id", type: "uuid", required: true, description: "ID do usuário" }],
      },
    ],
  },
  {
    slug: "labels",
    name: "Labels",
    description: "Rótulos coloridos por board.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/labels",
        summary: "Listar labels",
        scopes: ["read:labels"],
        query: [{ name: "board_id", type: "uuid", required: true, description: "Board ao qual os labels pertencem" }],
      },
      {
        method: "POST",
        path: "/api/v1/labels",
        summary: "Criar label",
        scopes: ["write:labels"],
        body: [
          { name: "board_id", type: "uuid", required: true, description: "Board" },
          { name: "name", type: "string", required: true, description: "Nome" },
          { name: "color", type: "string", required: true, description: "Cor hex" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/labels/:labelId",
        summary: "Deletar label",
        scopes: ["write:labels"],
      },
    ],
  },
  {
    slug: "channels",
    name: "Chat — Canais",
    description: "Canais de chat (públicos, privados e DMs).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/channels",
        summary: "Listar canais que o usuário participa",
        scopes: ["read:channels"],
        query: [
          { name: "type", type: "public|private|dm", description: "Filtrar por tipo" },
          { name: "team_id", type: "uuid", description: "Filtrar por time" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/channels",
        summary: "Criar canal",
        scopes: ["write:channels"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome" },
          { name: "type", type: "public|private", description: "Tipo (padrão public)" },
          { name: "team_id", type: "uuid", description: "Time associado" },
          { name: "description", type: "string", description: "Descrição" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/channels/:channelId",
        summary: "Detalhes do canal",
        scopes: ["read:channels"],
      },
      {
        method: "PATCH",
        path: "/api/v1/channels/:channelId",
        summary: "Atualizar canal",
        scopes: ["write:channels"],
      },
      {
        method: "DELETE",
        path: "/api/v1/channels/:channelId",
        summary: "Arquivar canal",
        scopes: ["write:channels"],
      },
      {
        method: "GET",
        path: "/api/v1/channels/:channelId/messages",
        summary: "Listar mensagens do canal",
        scopes: ["read:messages"],
        query: [
          { name: "limit", type: "number", description: "Quantidade (padrão 50, máx 200)" },
          { name: "before", type: "ISO date", description: "Mensagens antes desta data (paginação)" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/channels/:channelId/messages",
        summary: "Enviar mensagem ao canal",
        scopes: ["write:messages"],
        body: [
          { name: "content", type: "string", required: true, description: "Texto da mensagem (Markdown suportado)" },
          { name: "reply_to", type: "uuid", description: "ID da mensagem a responder (thread)" },
          { name: "mentions", type: "uuid[]", description: "IDs de usuários mencionados" },
        ],
      },
    ],
  },
  {
    slug: "bpm",
    name: "BPM (Pipes & Cards)",
    description: "Processos de negócio com fases e campos customizados.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/bpm/pipes",
        summary: "Listar pipes",
        scopes: ["read:bpm"],
      },
      {
        method: "POST",
        path: "/api/v1/bpm/pipes",
        summary: "Criar pipe",
        scopes: ["write:bpm"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome do processo" },
          { name: "description", type: "string", description: "Descrição" },
          { name: "icon", type: "string", description: "Ícone (lucide name)" },
          { name: "color", type: "string", description: "Cor hex" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/bpm/pipes/:pipeId",
        summary: "Detalhes do pipe (com fases e campos)",
        scopes: ["read:bpm"],
      },
      {
        method: "PATCH",
        path: "/api/v1/bpm/pipes/:pipeId",
        summary: "Atualizar pipe",
        scopes: ["write:bpm"],
      },
      {
        method: "DELETE",
        path: "/api/v1/bpm/pipes/:pipeId",
        summary: "Arquivar pipe",
        scopes: ["write:bpm"],
      },
      {
        method: "GET",
        path: "/api/v1/bpm/cards",
        summary: "Listar cards de BPM",
        scopes: ["read:bpm"],
        query: [
          { name: "pipe_id", type: "uuid", description: "Filtrar por pipe" },
          { name: "phase_id", type: "uuid", description: "Filtrar por fase atual" },
          { name: "assignee_id", type: "uuid", description: "Filtrar por responsável" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/bpm/cards",
        summary: "Criar card BPM",
        scopes: ["write:bpm"],
        body: [
          { name: "pipe_id", type: "uuid", required: true, description: "Pipe destino" },
          { name: "title", type: "string", required: true, description: "Título" },
          { name: "assignee_id", type: "uuid", description: "Responsável" },
          { name: "priority", type: "urgent|high|medium|low|none", description: "Prioridade" },
          { name: "values", type: "object", description: "Valores dos campos da fase inicial: { field_id: value }" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/bpm/cards/:cardId",
        summary: "Detalhes do card BPM",
        scopes: ["read:bpm"],
      },
      {
        method: "PATCH",
        path: "/api/v1/bpm/cards/:cardId",
        summary: "Atualizar card (mover fase, alterar campos)",
        scopes: ["write:bpm"],
        body: [
          { name: "current_phase_id", type: "uuid", description: "Mover para fase" },
          { name: "assignee_id", type: "uuid", description: "Reatribuir" },
          { name: "priority", type: "string", description: "Prioridade" },
          { name: "values", type: "object", description: "Atualizar valores de campos" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/bpm/cards/:cardId",
        summary: "Arquivar card BPM",
        scopes: ["write:bpm"],
      },
    ],
  },
  {
    slug: "goals",
    name: "Metas",
    description: "Metas de orçamento (budget_goals) e metas individuais (member_goals).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/goals/budget",
        summary: "Listar metas de orçamento",
        scopes: ["read:goals"],
        query: [
          { name: "year_month", type: "string (YYYY-MM)", description: "Filtrar por mês" },
          { name: "department_id", type: "uuid", description: "Filtrar por departamento" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/goals/budget",
        summary: "Criar/atualizar meta de orçamento",
        scopes: ["write:goals"],
        body: [
          { name: "year_month", type: "string", required: true, description: "Ex: '2026-03'" },
          { name: "limit_amount", type: "number", required: true, description: "Limite em R$" },
          { name: "department_id", type: "uuid", description: "Departamento" },
          { name: "category_id", type: "uuid", description: "Categoria OMIE" },
          { name: "alert_percent", type: "number", description: "Alertar em % do limite (padrão 80)" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/goals/budget/:goalId",
        summary: "Remover meta de orçamento",
        scopes: ["write:goals"],
      },
      {
        method: "GET",
        path: "/api/v1/goals/member",
        summary: "Listar metas individuais",
        scopes: ["read:goals"],
        query: [
          { name: "user_id", type: "uuid", description: "Filtrar por usuário" },
          { name: "year_month", type: "string", description: "Filtrar por mês" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/goals/member",
        summary: "Criar meta individual",
        scopes: ["write:goals"],
        body: [
          { name: "user_id", type: "uuid", required: true, description: "Usuário alvo" },
          { name: "goal_type", type: "tasks_completed|sla_met|avg_time|custom", required: true, description: "Tipo" },
          { name: "goal_name", type: "string", required: true, description: "Nome descritivo" },
          { name: "target_value", type: "number", required: true, description: "Valor alvo" },
          { name: "year_month", type: "string", required: true, description: "Mês de referência" },
        ],
      },
    ],
  },
  {
    slug: "events",
    name: "Eventos (Calendário)",
    description: "Eventos de calendário (independentes ou vinculados a cards).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/events",
        summary: "Listar eventos",
        scopes: ["read:events"],
        query: [
          { name: "from", type: "ISO date", description: "Data inicial" },
          { name: "to", type: "ISO date", description: "Data final" },
          { name: "card_id", type: "uuid", description: "Filtrar por card vinculado" },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/events",
        summary: "Criar evento",
        scopes: ["write:events"],
        body: [
          { name: "title", type: "string", required: true, description: "Título" },
          { name: "start_at", type: "ISO date", required: true, description: "Início" },
          { name: "end_at", type: "ISO date", description: "Fim" },
          { name: "all_day", type: "boolean", description: "Dia inteiro" },
          { name: "description", type: "string", description: "Descrição" },
          { name: "location", type: "string", description: "Local" },
          { name: "color", type: "string", description: "Cor hex" },
          { name: "card_id", type: "uuid", description: "Card vinculado" },
          { name: "participant_ids", type: "uuid[]", description: "Participantes" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/events/:eventId",
        summary: "Detalhes do evento",
        scopes: ["read:events"],
      },
      {
        method: "PATCH",
        path: "/api/v1/events/:eventId",
        summary: "Atualizar evento",
        scopes: ["write:events"],
      },
      {
        method: "DELETE",
        path: "/api/v1/events/:eventId",
        summary: "Excluir evento",
        scopes: ["write:events"],
      },
    ],
  },
  {
    slug: "notifications",
    name: "Notificações",
    description: "Notificações in-app do usuário autenticado.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/notifications",
        summary: "Listar notificações",
        scopes: ["read:notifications"],
        query: [
          { name: "is_read", type: "boolean", description: "Filtrar lidas/não lidas" },
          { name: "limit", type: "number", description: "Quantidade" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/v1/notifications/:notificationId",
        summary: "Marcar como lida/não lida",
        scopes: ["write:notifications"],
        body: [{ name: "is_read", type: "boolean", required: true, description: "true = lida" }],
      },
      {
        method: "POST",
        path: "/api/v1/notifications/mark-all-read",
        summary: "Marcar todas como lidas",
        scopes: ["write:notifications"],
      },
    ],
  },
  {
    slug: "teams",
    name: "Times",
    description: "Times (sub-grupos dentro da organização).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/teams",
        summary: "Listar times",
        scopes: ["read:teams"],
      },
      {
        method: "POST",
        path: "/api/v1/teams",
        summary: "Criar time",
        scopes: ["write:teams"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome" },
          { name: "description", type: "string", description: "Descrição" },
          { name: "color", type: "string", description: "Cor hex" },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/teams/:teamId",
        summary: "Detalhes do time (com membros)",
        scopes: ["read:teams"],
      },
      {
        method: "PATCH",
        path: "/api/v1/teams/:teamId",
        summary: "Atualizar time",
        scopes: ["write:teams"],
      },
      {
        method: "DELETE",
        path: "/api/v1/teams/:teamId",
        summary: "Excluir time",
        scopes: ["write:teams"],
      },
    ],
  },
  {
    slug: "automations",
    name: "Automações",
    description: "Regras automáticas baseadas em eventos de cards.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/automations",
        summary: "Listar automações",
        scopes: ["read:automations"],
        query: [{ name: "board_id", type: "uuid", description: "Filtrar por board" }],
      },
      {
        method: "POST",
        path: "/api/v1/automations",
        summary: "Criar automação",
        scopes: ["write:automations"],
        body: [
          { name: "name", type: "string", required: true, description: "Nome" },
          { name: "board_id", type: "uuid", description: "Board específico (opcional)" },
          { name: "trigger_type", type: "card_moved_to_column|card_created|card_overdue|card_completed", required: true, description: "Gatilho" },
          { name: "trigger_config", type: "object", description: "Configuração do gatilho" },
          { name: "action_type", type: "mark_completed|set_priority|assign_member|send_notification|move_to_column", required: true, description: "Ação" },
          { name: "action_config", type: "object", description: "Configuração da ação" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/v1/automations/:automationId",
        summary: "Atualizar automação",
        scopes: ["write:automations"],
      },
      {
        method: "DELETE",
        path: "/api/v1/automations/:automationId",
        summary: "Excluir automação",
        scopes: ["write:automations"],
      },
    ],
  },
  {
    slug: "api-keys",
    name: "API Keys",
    description: "Gerenciamento de chaves de API (apenas via cookie auth, requer admin).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/api-keys?org_id=:orgId",
        summary: "Listar chaves da organização",
      },
      {
        method: "POST",
        path: "/api/v1/api-keys",
        summary: "Criar nova chave (a chave bruta só é exibida UMA vez)",
        body: [
          { name: "org_id", type: "uuid", required: true, description: "Organização" },
          { name: "name", type: "string", required: true, description: "Nome descritivo" },
          { name: "scopes", type: "string[]", description: "Permissões (padrão: todas read+write)" },
          { name: "expires_at", type: "ISO date", description: "Validade (NULL = nunca expira)" },
          { name: "rate_limit", type: "number", description: "Requests/minuto (padrão 100)" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/v1/api-keys?id=:id&org_id=:orgId",
        summary: "Desativar chave",
      },
    ],
  },
];

/**
 * Auth modes documentation
 */
export const AUTH_DOCS = {
  bearer: {
    title: "Bearer Token (Cookie/JWT)",
    description: "Para integrações server-to-server com login por usuário. Use POST /auth/login para obter o access_token e envie em todas as requisições:",
    example: `Authorization: Bearer eyJhbGciOiJIUzI1...
X-Org-Id: <org_uuid>`,
  },
  apiKey: {
    title: "API Key",
    description: "Para integrações externas (apps mobile, Zapier, webhooks). Crie uma chave nesta página e envie no header:",
    example: `X-API-Key: eiai_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
  },
};
