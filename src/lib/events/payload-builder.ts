/**
 * Payload enrichment for outbound webhooks.
 *
 * When the Postgres trigger fires, the intake endpoint receives raw row
 * changes (just IDs + fields from the changed table). Consumers of our
 * webhooks (n8n, Zapier, custom apps) need human-readable context: board
 * names, column names, phase names, user names/emails, etc.
 *
 * These builders hydrate the raw record into a richer payload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function fetchProfile(admin: SupabaseClient, userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function fetchBoard(admin: SupabaseClient, boardId: string) {
  const { data } = await admin
    .from("boards")
    .select("id, org_id, name, description")
    .eq("id", boardId)
    .maybeSingle();
  return data;
}

async function fetchColumn(admin: SupabaseClient, columnId: string | null) {
  if (!columnId) return null;
  const { data } = await admin
    .from("columns")
    .select("id, name, position")
    .eq("id", columnId)
    .maybeSingle();
  return data;
}

async function fetchCardAssignees(admin: SupabaseClient, cardId: string) {
  const { data } = await admin
    .from("card_assignees")
    .select("user_id, profiles:user_id(id, full_name, email, avatar_url)")
    .eq("card_id", cardId);
  return (data || []).map((r: any) => r.profiles).filter(Boolean);
}

async function fetchPipe(admin: SupabaseClient, pipeId: string) {
  const { data } = await admin
    .from("bpm_pipes")
    .select("id, org_id, name, description")
    .eq("id", pipeId)
    .maybeSingle();
  return data;
}

async function fetchPhase(admin: SupabaseClient, phaseId: string | null) {
  if (!phaseId) return null;
  const { data } = await admin
    .from("bpm_phases")
    .select("id, name, position, is_start, is_end, color")
    .eq("id", phaseId)
    .maybeSingle();
  return data;
}

async function fetchBpmFieldValues(admin: SupabaseClient, cardId: string) {
  const { data } = await admin
    .from("bpm_card_values")
    .select("field_id, value, bpm_fields:field_id(field_key, label, field_type)")
    .eq("card_id", cardId);
  const result: Record<string, any> = {};
  for (const row of data || []) {
    const field = (row as any).bpm_fields;
    if (field?.field_key) {
      result[field.field_key] = {
        label: field.label,
        type: field.field_type,
        value: (row as any).value,
      };
    }
  }
  return result;
}

async function fetchChannel(admin: SupabaseClient, channelId: string) {
  const { data } = await admin
    .from("channels")
    .select("id, org_id, name, type")
    .eq("id", channelId)
    .maybeSingle();
  return data;
}

// ================================================
// Public builders
// ================================================

export async function buildCardPayload(
  admin: SupabaseClient,
  card: any
) {
  const [board, column, assignees, creator] = await Promise.all([
    fetchBoard(admin, card.board_id),
    fetchColumn(admin, card.column_id),
    fetchCardAssignees(admin, card.id),
    fetchProfile(admin, card.created_by),
  ]);

  return {
    card: {
      id: card.id,
      title: card.title,
      description: card.description,
      priority: card.priority,
      due_date: card.due_date,
      position: card.position,
      cover_color: card.cover_color,
      estimated_hours: card.estimated_hours,
      is_archived: card.is_archived,
      completed_at: card.completed_at,
      created_at: card.created_at,
      updated_at: card.updated_at,
    },
    board: board ? { id: board.id, name: board.name, org_id: board.org_id } : null,
    column: column ? { id: column.id, name: column.name, position: column.position } : null,
    assignees,
    created_by: creator,
  };
}

export async function buildBpmCardPayload(
  admin: SupabaseClient,
  bpmCard: any
) {
  const [pipe, phase, assignee, creator, fieldValues] = await Promise.all([
    fetchPipe(admin, bpmCard.pipe_id),
    fetchPhase(admin, bpmCard.current_phase_id),
    fetchProfile(admin, bpmCard.assignee_id),
    fetchProfile(admin, bpmCard.created_by),
    fetchBpmFieldValues(admin, bpmCard.id),
  ]);

  return {
    bpm_card: {
      id: bpmCard.id,
      title: bpmCard.title,
      priority: bpmCard.priority,
      sla_deadline: bpmCard.sla_deadline,
      started_at: bpmCard.started_at,
      completed_at: bpmCard.completed_at,
      is_archived: bpmCard.is_archived,
      created_at: bpmCard.created_at,
      updated_at: bpmCard.updated_at,
    },
    pipe: pipe ? { id: pipe.id, name: pipe.name, org_id: pipe.org_id } : null,
    phase: phase,
    assignee,
    created_by: creator,
    field_values: fieldValues,
  };
}

export async function buildMessagePayload(
  admin: SupabaseClient,
  message: any
) {
  const [channel, sender] = await Promise.all([
    fetchChannel(admin, message.channel_id),
    fetchProfile(admin, message.user_id),
  ]);

  return {
    message: {
      id: message.id,
      content: message.content,
      preview: String(message.content || "").slice(0, 120),
      mentions: message.mentions || [],
      created_at: message.created_at,
    },
    channel: channel ? { id: channel.id, name: channel.name, type: channel.type, org_id: channel.org_id } : null,
    sender,
  };
}

export async function buildMemberPayload(admin: SupabaseClient, member: any) {
  const [profile, inviter] = await Promise.all([
    fetchProfile(admin, member.user_id),
    fetchProfile(admin, member.invited_by),
  ]);

  return {
    member: {
      id: member.id,
      role: member.role,
      joined_at: member.joined_at,
    },
    user: profile,
    invited_by: inviter,
  };
}

export async function buildCardCommentPayload(admin: SupabaseClient, comment: any) {
  const [author, card] = await Promise.all([
    fetchProfile(admin, comment.user_id),
    admin.from("cards").select("id, title, board_id, column_id, created_by").eq("id", comment.card_id).maybeSingle(),
  ]);
  const cardRow = (card as any)?.data;
  const cardPayload = cardRow ? await buildCardPayload(admin, cardRow) : null;

  return {
    comment: {
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
    },
    author,
    ...(cardPayload || {}),
  };
}

export async function buildBpmCardCommentPayload(admin: SupabaseClient, comment: any) {
  const [author, cardRes] = await Promise.all([
    fetchProfile(admin, comment.user_id),
    admin.from("bpm_cards").select("*").eq("id", comment.card_id).maybeSingle(),
  ]);
  const cardRow = (cardRes as any)?.data;
  const cardPayload = cardRow ? await buildBpmCardPayload(admin, cardRow) : null;

  return {
    comment: {
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
    },
    author,
    ...(cardPayload || {}),
  };
}

export async function buildEventPayload(admin: SupabaseClient, event: any) {
  const creator = await fetchProfile(admin, event.created_by);
  return {
    event: {
      id: event.id,
      org_id: event.org_id,
      title: event.title,
      description: event.description,
      start_at: event.start_at,
      end_at: event.end_at,
      all_day: event.all_day,
      location: event.location,
      color: event.color,
      created_at: event.created_at,
    },
    created_by: creator,
  };
}

/**
 * Payload for `bpm_card.field_filled` / `bpm_card.field_updated`.
 *
 * `value` is the bpm_card_values row (has card_id, field_id, value, updated_at).
 * `old_value` is the previous value (optional — only for UPDATE).
 */
export async function buildBpmCardFieldPayload(
  admin: SupabaseClient,
  value: any,
  oldValue: any | null
) {
  const [cardRes, fieldRes] = await Promise.all([
    admin.from("bpm_cards").select("*").eq("id", value.card_id).maybeSingle(),
    admin
      .from("bpm_fields")
      .select("id, phase_id, field_key, field_type, label, is_required, options")
      .eq("id", value.field_id)
      .maybeSingle(),
  ]);
  const cardRow = (cardRes as any)?.data;
  const fieldRow = (fieldRes as any)?.data;
  const cardPayload = cardRow ? await buildBpmCardPayload(admin, cardRow) : {};

  return {
    ...cardPayload,
    field: fieldRow
      ? {
          id: fieldRow.id,
          field_key: fieldRow.field_key,
          label: fieldRow.label,
          type: fieldRow.field_type,
          is_required: fieldRow.is_required,
          options: fieldRow.options,
        }
      : { id: value.field_id },
    field_value: {
      new: value.value,
      old: oldValue?.value ?? null,
      updated_at: value.updated_at,
    },
  };
}

export async function buildCardAssigneePayload(admin: SupabaseClient, row: any) {
  const [user, card] = await Promise.all([
    fetchProfile(admin, row.user_id),
    admin.from("cards").select("*").eq("id", row.card_id).maybeSingle(),
  ]);
  const cardRow = (card as any)?.data;
  const cardPayload = cardRow ? await buildCardPayload(admin, cardRow) : null;

  return {
    user,
    assigned_at: row.assigned_at,
    ...(cardPayload || {}),
  };
}

// Helper to resolve org_id when the changed row doesn't have it directly.
export async function resolveOrgIdForCard(admin: SupabaseClient, boardId: string): Promise<string | null> {
  const { data } = await admin.from("boards").select("org_id").eq("id", boardId).maybeSingle();
  return data?.org_id || null;
}

export async function resolveOrgIdForChannel(admin: SupabaseClient, channelId: string): Promise<string | null> {
  const { data } = await admin.from("channels").select("org_id").eq("id", channelId).maybeSingle();
  return data?.org_id || null;
}
