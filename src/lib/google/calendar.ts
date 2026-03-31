import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`;

export function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(state: string) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state,
  });
}

export function getCalendarClient(accessToken: string, refreshToken: string) {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: client });
}

/** Refresh token if expired, returns new access_token and expires_at */
export async function refreshIfNeeded(
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<{ access_token: string; expires_at: Date } | null> {
  if (new Date() < new Date(expiresAt.getTime() - 60000)) {
    return null; // Still valid (with 1min margin)
  }
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return {
    access_token: credentials.access_token!,
    expires_at: new Date(credentials.expiry_date!),
  };
}

/** Convert EIAI event to Google Calendar event format */
export function toGoogleEvent(event: {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  all_day: boolean;
  location?: string | null;
}) {
  const base: any = {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
  };

  if (event.all_day) {
    const startDate = event.start_at.slice(0, 10);
    const endDate = event.end_at
      ? new Date(new Date(event.end_at).getTime() + 86400000).toISOString().slice(0, 10)
      : new Date(new Date(event.start_at).getTime() + 86400000).toISOString().slice(0, 10);
    base.start = { date: startDate };
    base.end = { date: endDate };
  } else {
    base.start = { dateTime: event.start_at, timeZone: "America/Sao_Paulo" };
    base.end = {
      dateTime: event.end_at || new Date(new Date(event.start_at).getTime() + 3600000).toISOString(),
      timeZone: "America/Sao_Paulo",
    };
  }

  return base;
}

/** Convert a board card (with due_date) to a Google Calendar all-day event */
export function toGoogleCardEvent(card: {
  title: string;
  description?: string | null;
  due_date: string; // "YYYY-MM-DD"
  board_name?: string;
}) {
  const summary = card.board_name
    ? `[${card.board_name}] ${card.title}`
    : card.title;

  // All-day event: end = next day (Google Calendar exclusive end)
  const endDate = new Date(card.due_date + "T00:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const endStr = endDate.toISOString().slice(0, 10);

  return {
    summary,
    description: card.description || undefined,
    start: { date: card.due_date },
    end: { date: endStr },
    colorId: "11", // Tomato red for tasks/deadlines
  };
}

/** Convert Google Calendar event to EIAI event format */
export function fromGoogleEvent(gEvent: any) {
  const allDay = !!gEvent.start?.date;
  return {
    title: gEvent.summary || "(Sem titulo)",
    description: gEvent.description || null,
    start_at: allDay
      ? new Date(gEvent.start.date + "T00:00:00").toISOString()
      : gEvent.start.dateTime,
    end_at: allDay
      ? new Date(gEvent.end.date + "T23:59:59").toISOString()
      : gEvent.end?.dateTime || null,
    all_day: allDay,
    location: gEvent.location || null,
    google_event_id: gEvent.id,
  };
}
