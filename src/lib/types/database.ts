export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          plan: "free" | "pro" | "enterprise";
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          is_ai_agent: boolean;
          agent_config: Json | null;
          status: "online" | "away" | "offline" | "dnd";
          last_seen_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      org_members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: "owner" | "admin" | "member" | "guest";
          invited_by: string | null;
          joined_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["org_members"]["Row"], "id" | "joined_at">;
        Update: Partial<Database["public"]["Tables"]["org_members"]["Insert"]>;
      };
      teams: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          color: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["teams"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["teams"]["Insert"]>;
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: "lead" | "member";
        };
        Insert: Omit<Database["public"]["Tables"]["team_members"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["team_members"]["Insert"]>;
      };
      channels: {
        Row: {
          id: string;
          org_id: string;
          team_id: string | null;
          name: string;
          description: string | null;
          type: "public" | "private" | "dm";
          created_by: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["channels"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
      };
      channel_members: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          last_read_at: string;
          notifications: "all" | "mentions" | "none";
        };
        Insert: Omit<Database["public"]["Tables"]["channel_members"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["channel_members"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          content: string;
          reply_to: string | null;
          is_thread_root: boolean;
          thread_count: number;
          mentions: string[];
          edited_at: string | null;
          deleted_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at" | "thread_count">;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["message_reactions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["message_reactions"]["Insert"]>;
      };
      boards: {
        Row: {
          id: string;
          org_id: string;
          team_id: string | null;
          name: string;
          description: string | null;
          visibility: "public" | "team" | "private";
          settings: Json;
          created_by: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["boards"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["boards"]["Insert"]>;
      };
      columns: {
        Row: {
          id: string;
          board_id: string;
          name: string;
          position: number;
          color: string;
          wip_limit: number | null;
          is_done_column: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["columns"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["columns"]["Insert"]>;
      };
      cards: {
        Row: {
          id: string;
          column_id: string;
          board_id: string;
          title: string;
          description: string | null;
          priority: "urgent" | "high" | "medium" | "low" | "none";
          due_date: string | null;
          position: number;
          cover_color: string | null;
          estimated_hours: number | null;
          created_by: string | null;
          completed_at: string | null;
          is_archived: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["cards"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["cards"]["Insert"]>;
      };
      card_assignees: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          assigned_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["card_assignees"]["Row"], "id" | "assigned_at">;
        Update: Partial<Database["public"]["Tables"]["card_assignees"]["Insert"]>;
      };
      card_comments: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["card_comments"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["card_comments"]["Insert"]>;
      };
      labels: {
        Row: {
          id: string;
          board_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["labels"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["labels"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: string;
          token: string;
          invited_by: string | null;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["invitations"]["Row"], "id" | "created_at" | "token">;
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Tipos de conveniência
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type OrgMember = Database["public"]["Tables"]["org_members"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Board = Database["public"]["Tables"]["boards"]["Row"];
export type Column = Database["public"]["Tables"]["columns"]["Row"];
export type Card = Database["public"]["Tables"]["cards"]["Row"];
export type CardComment = Database["public"]["Tables"]["card_comments"]["Row"];
export type Label = Database["public"]["Tables"]["labels"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type Invitation = Database["public"]["Tables"]["invitations"]["Row"];
