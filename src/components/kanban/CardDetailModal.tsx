"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDate,
  formatDateTime,
  getInitials,
  generateColor,
} from "@/lib/utils/helpers";
import type { Card } from "@/lib/types/database";
import {
  X,
  Calendar,
  Users,
  Flag,
  Columns3,
  Trash2,
  CheckCircle2,
  MessageSquare,
  Clock,
  Loader2,
  Send,
  Tags,
  Plus,
  ListChecks,
  Square,
  CheckSquare,
  Paperclip,
  Download,
  FileText,
  Link2,
  Mic,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Activity,
  MoreHorizontal,
  CalendarDays,
  User,
  Sparkles,
  Workflow,
} from "lucide-react";
import { AIAssistant } from "./AIAssistant";
import { useUIStore } from "@/lib/stores/ui-store";
import { DynamicField, type FieldDef } from "@/components/bpm/DynamicField";
import { isBpmTask } from "@/lib/bpm/task-sync";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  card: Card & { card_assignees: any[] };
  boardId: string;
  columns: { id: string; name: string; color: string; is_done_column?: boolean; position?: number }[];
  orgMembers: {
    user_id: string;
    profiles: {
      id: string;
      full_name: string;
      email: string;
      avatar_url: string | null;
    };
  }[];
  boardLabels?: { id: string; name: string; color: string }[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (updatedCard: any) => void;
  onDeleted: (cardId: string) => void;
  onLabelsChanged?: () => void;
}

interface Comment {
  id: string;
  card_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string;
  };
}

interface Subtask {
  id: string;
  card_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
}

interface Checklist {
  id: string;
  card_id: string;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  assigned_to: string | null;
  position: number;
  created_at: string;
}

interface Attachment {
  id: string;
  card_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  uploaded_by: string | null;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  type: "activity" | "comment";
  user_id: string;
  content: string;
  action?: string;
  details?: any;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const priorityConfig = {
  urgent: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", label: "Urgente", icon: "🔴" },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Alta", icon: "🟠" },
  medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Media", icon: "🟡" },
  low: { color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", label: "Baixa", icon: "🔵" },
  none: { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", label: "Nenhuma", icon: "⚪" },
};

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

const FIVE_W_TWO_H_ITEMS = [
  { title: "What (O que?) - O que sera feito?" },
  { title: "Why (Por que?) - Por que sera feito?" },
  { title: "Where (Onde?) - Onde sera feito?" },
  { title: "When (Quando?) - Quando sera feito?" },
  { title: "Who (Quem?) - Quem ira fazer?" },
  { title: "How (Como?) - Como sera feito?" },
  { title: "How much (Quanto custa?) - Quanto vai custar?" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getActivityDescription(action: string, details: any): string {
  switch (action) {
    case "created": return "criou esta tarefa";
    case "moved": return `moveu para ${details?.to_column || "outra coluna"}`;
    case "priority_changed": return `alterou prioridade para ${details?.new_priority || "?"}`;
    case "assigned": return `atribuiu a ${details?.assignee_name || "alguem"}`;
    case "unassigned": return `removeu atribuicao de ${details?.assignee_name || "alguem"}`;
    case "completed": return "marcou como concluida";
    case "uncompleted": return "reabriu a tarefa";
    case "attachment_added": return `anexou ${details?.file_name || "um arquivo"}`;
    case "attachment_removed": return `removeu anexo ${details?.file_name || ""}`;
    case "checklist_added": return `criou checklist "${details?.name || ""}"`;
    case "checklist_removed": return `removeu checklist "${details?.name || ""}"`;
    case "description_updated": return "atualizou a descricao";
    case "title_updated": return "alterou o titulo";
    case "due_date_changed": return `alterou prazo para ${details?.due_date || "?"}`;
    case "label_added": return `adicionou label "${details?.label_name || ""}"`;
    case "label_removed": return `removeu label "${details?.label_name || ""}"`;
    case "subtask_completed": return `concluiu subtarefa "${details?.title || ""}"`;
    case "subtask_uncompleted": return `reabriu subtarefa "${details?.title || ""}"`;
    case "checklist_item_completed": return `concluiu "${details?.title || ""}" em ${details?.checklist || "checklist"}`;
    case "checklist_item_uncompleted": return `reabriu "${details?.title || ""}" em ${details?.checklist || "checklist"}`;
    case "progress_updated": return `atualizou progresso para ${details?.progress || 0}%`;
    default: return action;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CardDetailModal({
  card,
  boardId,
  columns,
  orgMembers,
  boardLabels = [],
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
  onLabelsChanged,
}: Props) {
  const supabase = createClient();

  // Card state
  const [title, setTitle] = useState(card.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(card.description || "");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [priority, setPriority] = useState<Card["priority"]>(card.priority);
  const [dueDate, setDueDate] = useState(card.due_date || "");
  const [startDate, setStartDate] = useState((card.metadata as any)?.start_date || "");
  const [columnId, setColumnId] = useState(card.column_id);
  const [completedAt, setCompletedAt] = useState<string | null>(card.completed_at);
  const [assignees, setAssignees] = useState<any[]>(card.card_assignees || []);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [descriptionRecording, setDescriptionRecording] = useState(false);
  const descriptionRecorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);

  // Labels
  const [cardLabels, setCardLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);

  // Subtasks (legacy)
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(true);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");

  // Checklists
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loadingChecklists, setLoadingChecklists] = useState(true);
  const [newChecklistItemTitle, setNewChecklistItemTitle] = useState<Record<string, string>>({});
  const [editingChecklistName, setEditingChecklistName] = useState<string | null>(null);
  const [editingChecklistNameValue, setEditingChecklistNameValue] = useState("");
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistItemTitle, setEditingChecklistItemTitle] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity & Comments
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Start Process (BPM)
  const { activeOrgId } = useUIStore();
  const [showProcessDropdown, setShowProcessDropdown] = useState(false);
  const [availablePipes, setAvailablePipes] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingPipes, setLoadingPipes] = useState(false);
  const [selectedPipe, setSelectedPipe] = useState<{ id: string; name: string } | null>(null);
  const [pipeFields, setPipeFields] = useState<FieldDef[]>([]);
  const [pipeFieldValues, setPipeFieldValues] = useState<Record<string, any>>({});
  const [startingProcess, setStartingProcess] = useState(false);
  const processDropdownRef = useRef<HTMLDivElement>(null);

  // BPM Task fields (when this card IS a BPM task)
  const [bpmFields, setBpmFields] = useState<FieldDef[]>([]);
  const [bpmFieldValues, setBpmFieldValues] = useState<Record<string, any>>({});
  const [loadingBpmFields, setLoadingBpmFields] = useState(false);
  const [savingBpmField, setSavingBpmField] = useState<string | null>(null);

  // Progress acknowledgment gate — auto-acknowledged if user toggles any checklist/subtask
  const [progressAcknowledged, setProgressAcknowledged] = useState(false);
  const [showProgressWarning, setShowProgressWarning] = useState(false);
  const [checklistToggledInSession, setChecklistToggledInSession] = useState(false);

  // Manual progress (interactive bar)
  const [manualProgress, setManualProgress] = useState<number | null>(
    typeof (card.metadata as any)?.manual_progress === "number" ? (card.metadata as any).manual_progress : null
  );
  const [editingPercent, setEditingPercent] = useState(false);
  const [percentInput, setPercentInput] = useState("");
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const percentInputRef = useRef<HTMLInputElement>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // ─── BPM Process helpers ─────────────────────────────────────────────────

  const cardIsBpmTask = isBpmTask(card.metadata);
  const cardLinkedToBpm = !!(card.metadata as any)?.linked_to_bpm;

  async function loadAvailablePipes() {
    if (loadingPipes) return;
    setLoadingPipes(true);

    // Resolve org_id: prefer store, fallback to board's org_id
    let orgId = activeOrgId;
    if (!orgId) {
      const { data: board } = await supabase
        .from("boards")
        .select("org_id")
        .eq("id", boardId)
        .single();
      orgId = board?.org_id;
    }
    if (!orgId) { setLoadingPipes(false); return; }

    // Get pipes linked to this specific board
    const { data: linkedPipes } = await supabase
      .from("bpm_pipe_boards")
      .select("pipe_id")
      .eq("board_id", boardId);

    const linkedPipeIds = (linkedPipes || []).map((lp: any) => lp.pipe_id);

    if (linkedPipeIds.length === 0) {
      // Fallback: if no pipes are linked to any board, show all org pipes
      const { data: anyLinked } = await supabase
        .from("bpm_pipe_boards")
        .select("pipe_id")
        .limit(1);
      if (anyLinked && anyLinked.length > 0) {
        // Some pipes ARE linked to boards, but not this one — show nothing
        setAvailablePipes([]);
        setLoadingPipes(false);
        return;
      }
      // No pipe-board links exist at all — show all pipes (legacy mode)
      const { data } = await supabase
        .from("bpm_pipes")
        .select("id, name, color")
        .eq("org_id", orgId)
        .eq("is_archived", false)
        .order("name");
      setAvailablePipes(data || []);
    } else {
      const { data } = await supabase
        .from("bpm_pipes")
        .select("id, name, color")
        .in("id", linkedPipeIds)
        .eq("is_archived", false)
        .order("name");
      setAvailablePipes(data || []);
    }
    setLoadingPipes(false);
  }

  async function handleSelectPipe(pipe: { id: string; name: string }) {
    setSelectedPipe(pipe);
    setShowProcessDropdown(false);
    setPipeFieldValues({});

    // Load start phase fields
    const { data: phases } = await supabase
      .from("bpm_phases")
      .select("id, is_start")
      .eq("pipe_id", pipe.id)
      .order("position");

    const startPhase = phases?.find((p) => p.is_start) || phases?.[0];
    if (!startPhase) { setPipeFields([]); return; }

    const { data: fields } = await supabase
      .from("bpm_fields")
      .select("*")
      .eq("phase_id", startPhase.id)
      .order("position");

    setPipeFields((fields || []).map((f: any) => ({ ...f, options: f.options || [], validations: f.validations || {} })));
  }

  async function handleStartProcess() {
    if (!selectedPipe || startingProcess) return;
    setStartingProcess(true);
    try {
      const res = await fetch("/api/bpm/start-from-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeId: selectedPipe.id,
          title: title,
          values: pipeFieldValues,
          boardCardId: card.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local card metadata
        onUpdated({ ...card, metadata: { ...(card.metadata as any || {}), linked_to_bpm: true, bpm_card_id: data.cardId, bpm_pipe_name: selectedPipe.name } });
        setSelectedPipe(null);
        setPipeFields([]);
        setPipeFieldValues({});
      }
    } catch {
      // silently fail
    }
    setStartingProcess(false);
  }

  // ─── BPM Task fields (render actual field types) ─────────────────────────

  async function loadBpmTaskFields() {
    const meta = card.metadata as any;
    const fieldIds: string[] = meta?.bpm_field_ids || [];
    const bpmCardId: string = meta?.bpm_card_id;
    if (!cardIsBpmTask || fieldIds.length === 0 || !bpmCardId) return;

    setLoadingBpmFields(true);
    // Load field definitions
    const { data: fields } = await supabase
      .from("bpm_fields")
      .select("*")
      .in("id", fieldIds)
      .order("position");

    if (fields && fields.length > 0) {
      setBpmFields(fields.map((f: any) => ({
        ...f,
        options: f.options || [],
        validations: f.validations || {},
      })));

      // Load current values
      const { data: values } = await supabase
        .from("bpm_card_values")
        .select("field_id, value")
        .eq("card_id", bpmCardId)
        .in("field_id", fieldIds);

      const valMap: Record<string, any> = {};
      for (const v of values || []) valMap[v.field_id] = v.value;
      setBpmFieldValues(valMap);
    }
    setLoadingBpmFields(false);
  }

  async function handleBpmFieldChange(fieldId: string, value: any) {
    const meta = card.metadata as any;
    const bpmCardId = meta?.bpm_card_id;
    if (!bpmCardId) return;

    // Optimistic update
    setBpmFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    setSavingBpmField(fieldId);

    // Upsert to bpm_card_values
    const { data: existing } = await supabase
      .from("bpm_card_values")
      .select("id")
      .eq("card_id", bpmCardId)
      .eq("field_id", fieldId)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("bpm_card_values")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("bpm_card_values")
        .insert({ card_id: bpmCardId, field_id: fieldId, value });
    }

    // Also mark the corresponding checklist item as completed if field has a value
    const field = bpmFields.find((f) => f.id === fieldId);
    if (field) {
      const hasValue = value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
      // Find checklist item matching this field's label and toggle it
      for (const cl of checklists) {
        const item = cl.items.find((i) => i.title === field.label);
        if (item && item.is_completed !== hasValue) {
          await supabase
            .from("checklist_items")
            .update({ is_completed: hasValue })
            .eq("id", item.id);
          setChecklists((prev) =>
            prev.map((c) =>
              c.id === cl.id
                ? { ...c, items: c.items.map((i) => i.id === item.id ? { ...i, is_completed: hasValue } : i) }
                : c
            )
          );
        }
      }
    }

    setSavingBpmField(null);
  }

  // ─── Data loading ────────────────────────────────────────────────────────

  useEffect(() => {
    loadCardLabels();
    loadSubtasks();
    loadChecklists();
    loadAttachments();
    loadActivityFeed();
    if (cardIsBpmTask) loadBpmTaskFields();
  }, []);

  // Close ALL dropdowns on click outside
  useEffect(() => {
    const anyOpen = showLabelDropdown || showAssigneeDropdown || showPriorityDropdown || showColumnDropdown;
    if (!anyOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (showLabelDropdown && labelDropdownRef.current && !labelDropdownRef.current.contains(target)) {
        setShowLabelDropdown(false);
      }
      if (showAssigneeDropdown && assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(target)) {
        setShowAssigneeDropdown(false);
      }
      if (showPriorityDropdown && priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)) {
        setShowPriorityDropdown(false);
      }
      if (showColumnDropdown && columnDropdownRef.current && !columnDropdownRef.current.contains(target)) {
        setShowColumnDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLabelDropdown, showAssigneeDropdown, showPriorityDropdown, showColumnDropdown]);

  async function loadCardLabels() {
    const { data } = await supabase
      .from("card_labels")
      .select("label_id, labels(id, name, color)")
      .eq("card_id", card.id);
    if (data) {
      setCardLabels((data as any[]).map((r) => r.labels).filter(Boolean));
    }
  }

  async function loadSubtasks() {
    setLoadingSubtasks(true);
    const { data } = await supabase
      .from("subtasks")
      .select("*")
      .eq("card_id", card.id)
      .order("position", { ascending: true });
    if (data) setSubtasks(data as Subtask[]);
    setLoadingSubtasks(false);
  }

  async function loadChecklists() {
    setLoadingChecklists(true);
    const { data: checklistData } = await supabase
      .from("checklists")
      .select("*")
      .eq("card_id", card.id)
      .order("position", { ascending: true });

    if (checklistData && checklistData.length > 0) {
      const checklistIds = checklistData.map((c) => c.id);
      const { data: itemsData } = await supabase
        .from("checklist_items")
        .select("*")
        .in("checklist_id", checklistIds)
        .order("position", { ascending: true });

      const itemsByChecklist: Record<string, ChecklistItem[]> = {};
      (itemsData || []).forEach((item) => {
        if (!itemsByChecklist[item.checklist_id]) itemsByChecklist[item.checklist_id] = [];
        itemsByChecklist[item.checklist_id].push(item as ChecklistItem);
      });

      setChecklists(
        checklistData.map((cl) => ({
          ...cl,
          items: itemsByChecklist[cl.id] || [],
        })) as Checklist[]
      );
    } else {
      setChecklists([]);
    }
    setLoadingChecklists(false);
  }

  async function loadAttachments() {
    setLoadingAttachments(true);
    const { data } = await supabase
      .from("card_attachments")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: false });
    if (data) setAttachments(data as Attachment[]);
    setLoadingAttachments(false);
  }

  async function loadActivityFeed() {
    setLoadingActivity(true);

    const [activityRes, commentsRes] = await Promise.all([
      supabase
        .from("activity_logs")
        .select("*, profiles:user_id(id, full_name, avatar_url, email)")
        .eq("card_id", card.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("card_comments")
        .select("*, profiles:user_id(id, full_name, avatar_url, email)")
        .eq("card_id", card.id)
        .order("created_at", { ascending: true }),
    ]);

    const activities: ActivityEntry[] = (activityRes.data || []).map((a: any) => ({
      id: a.id,
      type: "activity" as const,
      user_id: a.user_id,
      content: getActivityDescription(a.action, a.details),
      action: a.action,
      details: a.details,
      created_at: a.created_at,
      profiles: a.profiles,
    }));

    const commentEntries: ActivityEntry[] = (commentsRes.data || []).map((c: any) => ({
      id: c.id,
      type: "comment" as const,
      user_id: c.user_id,
      content: c.content,
      created_at: c.created_at,
      profiles: c.profiles,
    }));

    if (commentsRes.data) setComments(commentsRes.data as unknown as Comment[]);

    const merged = [...activities, ...commentEntries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setActivityFeed(merged);
    setLoadingActivity(false);
  }

  async function logActivity(action: string, details: any = {}) {
    await supabase.from("activity_logs").insert({
      card_id: card.id,
      user_id: currentUserId,
      action,
      details,
    });
  }

  // ─── Card updates ────────────────────────────────────────────────────────

  async function updateCard(fields: Partial<Card>) {
    setSaving(true);
    const { data, error } = await supabase
      .from("cards")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", card.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      onUpdated({ ...data, card_assignees: assignees });
    }
  }

  // Title
  function handleTitleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      setEditingTitle(false);
      return;
    }
    if (trimmed !== card.title) {
      updateCard({ title: trimmed });
      logActivity("title_updated", { old: card.title, new: trimmed });
    }
    setEditingTitle(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleTitleSave();
    else if (e.key === "Escape") { setTitle(card.title); setEditingTitle(false); }
  }

  // Description
  function handleDescriptionSave() {
    const trimmed = description.trim();
    const current = card.description || "";
    if (trimmed !== current) {
      updateCard({ description: trimmed || null });
      logActivity("description_updated");
    }
    setEditingDescription(false);
  }

  // Priority
  async function handlePriorityChange(p: Card["priority"]) {
    setPriority(p);
    setShowPriorityDropdown(false);
    await updateCard({ priority: p });
    logActivity("priority_changed", { new_priority: priorityConfig[p].label });
  }

  // Due date + time
  const [dueTime, setDueTime] = useState(() => {
    if (!card.due_date) return "";
    const t = card.due_date.includes("T") ? card.due_date.split("T")[1]?.substring(0, 5) : "";
    return t || "";
  });
  const [startTime, setStartTime] = useState(() => {
    const sd = (card.metadata as any)?.start_date || "";
    if (!sd) return "";
    const t = sd.includes("T") ? sd.split("T")[1]?.substring(0, 5) : "";
    return t || "";
  });

  async function handleDueDateChange(value: string) {
    const dateOnly = value || "";
    const combined = dateOnly && dueTime ? `${dateOnly}T${dueTime}` : dateOnly;
    setDueDate(combined);
    await updateCard({ due_date: combined || null });
    logActivity("due_date_changed", { due_date: combined || null });
  }

  async function handleDueTimeChange(value: string) {
    setDueTime(value);
    const dateOnly = dueDate ? dueDate.split("T")[0] : "";
    if (!dateOnly) return;
    const combined = value ? `${dateOnly}T${value}` : dateOnly;
    setDueDate(combined);
    await updateCard({ due_date: combined || null });
  }

  async function handleStartDateChange(value: string) {
    const dateOnly = value || "";
    const combined = dateOnly && startTime ? `${dateOnly}T${startTime}` : dateOnly;
    setStartDate(combined);
    const meta = (card.metadata as any) || {};
    await updateCard({ metadata: { ...meta, start_date: combined || null } } as any);
  }

  async function handleStartTimeChange(value: string) {
    setStartTime(value);
    const dateOnly = startDate ? startDate.split("T")[0] : "";
    if (!dateOnly) return;
    const combined = value ? `${dateOnly}T${value}` : dateOnly;
    setStartDate(combined);
    const meta = (card.metadata as any) || {};
    await updateCard({ metadata: { ...meta, start_date: combined || null } } as any);
  }

  // Column
  async function handleColumnChange(newColumnId: string) {
    const oldCol = columns.find((c) => c.id === columnId);
    const newCol = columns.find((c) => c.id === newColumnId);
    setColumnId(newColumnId);
    setShowColumnDropdown(false);
    await updateCard({ column_id: newColumnId });
    logActivity("moved", { from_column: oldCol?.name, to_column: newCol?.name });
  }

  // Completed toggle
  async function handleToggleCompleted() {
    const newVal = completedAt ? null : new Date().toISOString();
    setCompletedAt(newVal);
    await updateCard({ completed_at: newVal });
    logActivity(newVal ? "completed" : "uncompleted");
  }

  // ─── Labels ──────────────────────────────────────────────────────────────

  async function addLabelToCard(label: { id: string; name: string; color: string }) {
    const { error } = await supabase
      .from("card_labels")
      .insert({ card_id: card.id, label_id: label.id });
    if (!error) {
      setCardLabels((prev) => [...prev, label]);
      onLabelsChanged?.();
      logActivity("label_added", { label_name: label.name });
    }
  }

  async function removeLabelFromCard(labelId: string) {
    const label = cardLabels.find((l) => l.id === labelId);
    const { error } = await supabase
      .from("card_labels")
      .delete()
      .eq("card_id", card.id)
      .eq("label_id", labelId);
    if (!error) {
      setCardLabels((prev) => prev.filter((l) => l.id !== labelId));
      onLabelsChanged?.();
      logActivity("label_removed", { label_name: label?.name });
    }
  }

  async function handleCreateLabel() {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("labels")
      .insert({ board_id: boardId, name: trimmed, color: newLabelColor })
      .select()
      .single();
    if (!error && data) {
      setNewLabelName("");
      setNewLabelColor(LABEL_COLORS[0]);
      setCreatingLabel(false);
      onLabelsChanged?.();
      await addLabelToCard(data);
    }
  }

  // ─── Assignees ───────────────────────────────────────────────────────────

  async function addAssignee(userId: string) {
    const { error } = await supabase
      .from("card_assignees")
      .insert({ card_id: card.id, user_id: userId });
    if (!error) {
      const member = orgMembers.find((m) => m.user_id === userId);
      const newAssignees = [...assignees, { user_id: userId, profiles: member?.profiles }];
      setAssignees(newAssignees);
      onUpdated({ ...card, card_assignees: newAssignees });
      logActivity("assigned", { assignee_name: member?.profiles?.full_name });
    }
    setShowAssigneeDropdown(false);
  }

  async function removeAssignee(userId: string) {
    const member = orgMembers.find((m) => m.user_id === userId);
    const { error } = await supabase
      .from("card_assignees")
      .delete()
      .eq("card_id", card.id)
      .eq("user_id", userId);
    if (!error) {
      const newAssignees = assignees.filter((a: any) => a.user_id !== userId);
      setAssignees(newAssignees);
      onUpdated({ ...card, card_assignees: newAssignees });
      logActivity("unassigned", { assignee_name: member?.profiles?.full_name });
    }
  }

  // ─── Create linked card for assigned subtask/checklist item ─────────────

  async function createLinkedCard(itemTitle: string, assigneeId: string, dueDate?: string | null) {
    // Find "A Fazer" column (first column)
    const firstColumn = columns[0];
    if (!firstColumn) return;

    // Check if a linked card already exists for this item
    const { data: existingCards } = await supabase
      .from("cards")
      .select("id")
      .eq("board_id", boardId)
      .contains("metadata", { parent_card_id: card.id, linked_item_title: itemTitle })
      .limit(1);

    if (existingCards && existingCards.length > 0) return; // Already exists

    // Create the linked card
    const { data: newCard } = await supabase
      .from("cards")
      .insert({
        column_id: firstColumn.id,
        board_id: boardId,
        title: itemTitle,
        description: `Subtarefa de: **${card.title}**`,
        priority: card.priority || "none",
        due_date: dueDate || null,
        created_by: currentUserId,
        position: 0,
        is_archived: false,
        metadata: { parent_card_id: card.id, linked_item_title: itemTitle },
      })
      .select()
      .single();

    if (newCard) {
      // Assign to the person
      await supabase.from("card_assignees").insert({
        card_id: newCard.id,
        user_id: assigneeId,
      });

      // Log activity
      await supabase.from("card_activity").insert({
        card_id: card.id,
        user_id: currentUserId,
        action: "linked_card_created",
        details: { linked_card_id: newCard.id, assignee_id: assigneeId, title: itemTitle },
      });
    }
  }

  // ─── Subtasks (legacy) ──────────────────────────────────────────────────

  async function handleAddSubtask() {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    setAddingSubtask(true);
    const nextPos = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.position)) + 1 : 0;
    const { error } = await supabase.from("subtasks").insert({
      card_id: card.id,
      title: trimmed,
      is_completed: false,
      position: nextPos,
      assigned_to: null,
      created_by: currentUserId,
    });
    if (!error) {
      setNewSubtaskTitle("");
      await loadSubtasks();
    }
    setAddingSubtask(false);
  }

  async function handleToggleSubtask(subtaskId: string, currentState: boolean) {
    const subtask = subtasks.find((s) => s.id === subtaskId);
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, is_completed: !currentState } : s))
    );
    setChecklistToggledInSession(true);
    setProgressAcknowledged(true);
    setManualProgress(null); // Clear manual override — let auto-calculation take over
    await supabase.from("subtasks").update({ is_completed: !currentState }).eq("id", subtaskId);
    // Clear manual_progress in DB
    const newMeta = { ...((card.metadata as any) || {}), manual_progress: undefined };
    await supabase.from("cards").update({ metadata: newMeta }).eq("id", card.id);
    if (subtask) {
      logActivity(!currentState ? "subtask_completed" : "subtask_uncompleted", { title: subtask.title });
    }
  }

  async function handleDeleteSubtask(subtaskId: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    await supabase.from("subtasks").delete().eq("id", subtaskId);
  }

  async function handleSubtaskAssignee(subtaskId: string, userId: string | null) {
    const subtask = subtasks.find((s) => s.id === subtaskId);
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, assigned_to: userId } : s))
    );
    await supabase.from("subtasks").update({ assigned_to: userId }).eq("id", subtaskId);

    // Create linked card for the assigned person
    if (userId && subtask) {
      await createLinkedCard(subtask.title, userId, subtask.due_date);
    }
  }

  async function handleSubtaskDueDate(subtaskId: string, date: string | null) {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, due_date: date } : s))
    );
    await supabase.from("subtasks").update({ due_date: date || null }).eq("id", subtaskId);

    // If there's a linked card and assignee, create event in calendar
    const subtask = subtasks.find((s) => s.id === subtaskId);
    if (date && subtask?.assigned_to) {
      // Insert event into calendar for the due date
      const { data: orgMem } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", currentUserId)
        .limit(1)
        .single();

      if (orgMem) {
        await supabase.from("events").insert({
          org_id: orgMem.org_id,
          title: `📋 ${subtask.title}`,
          start_at: new Date(`${date}T09:00:00`).toISOString(),
          end_at: new Date(`${date}T10:00:00`).toISOString(),
          all_day: false,
          color: "#f97316",
          created_by: subtask.assigned_to,
          card_id: card.id,
        });
      }
    }
  }

  async function handleEditSubtaskSave(subtaskId: string) {
    const trimmed = editingSubtaskTitle.trim();
    if (!trimmed) { setEditingSubtaskId(null); return; }
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, title: trimmed } : s))
    );
    setEditingSubtaskId(null);
    await supabase.from("subtasks").update({ title: trimmed }).eq("id", subtaskId);
  }

  // ─── Checklists ─────────────────────────────────────────────────────────

  async function handleAddChecklist(name: string = "Checklist", items?: { title: string }[]) {
    setAddingChecklist(true);
    const nextPos = checklists.length > 0 ? Math.max(...checklists.map((c) => c.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("checklists")
      .insert({
        card_id: card.id,
        name,
        position: nextPos,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (!error && data) {
      if (items && items.length > 0) {
        const itemInserts = items.map((item, idx) => ({
          checklist_id: data.id,
          title: item.title,
          is_completed: false,
          position: idx,
        }));
        await supabase.from("checklist_items").insert(itemInserts);
      }
      logActivity("checklist_added", { name });
      await loadChecklists();
    }
    setAddingChecklist(false);
  }

  async function handleDeleteChecklist(checklistId: string) {
    const cl = checklists.find((c) => c.id === checklistId);
    setChecklists((prev) => prev.filter((c) => c.id !== checklistId));
    await supabase.from("checklist_items").delete().eq("checklist_id", checklistId);
    await supabase.from("checklists").delete().eq("id", checklistId);
    logActivity("checklist_removed", { name: cl?.name });
  }

  async function handleRenameChecklist(checklistId: string) {
    const trimmed = editingChecklistNameValue.trim();
    if (!trimmed) { setEditingChecklistName(null); return; }
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, name: trimmed } : c))
    );
    setEditingChecklistName(null);
    await supabase.from("checklists").update({ name: trimmed }).eq("id", checklistId);
  }

  async function handleAddChecklistItem(checklistId: string) {
    const trimmed = (newChecklistItemTitle[checklistId] || "").trim();
    if (!trimmed) return;
    const cl = checklists.find((c) => c.id === checklistId);
    const nextPos = cl && cl.items.length > 0 ? Math.max(...cl.items.map((i) => i.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({
        checklist_id: checklistId,
        title: trimmed,
        is_completed: false,
        position: nextPos,
      })
      .select()
      .single();

    if (!error && data) {
      setChecklists((prev) =>
        prev.map((c) =>
          c.id === checklistId ? { ...c, items: [...c.items, data as ChecklistItem] } : c
        )
      );
      setNewChecklistItemTitle((prev) => ({ ...prev, [checklistId]: "" }));
    }
  }

  async function handleToggleChecklistItem(checklistId: string, itemId: string, current: boolean) {
    const cl = checklists.find((c) => c.id === checklistId);
    const item = cl?.items.find((i) => i.id === itemId);
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, is_completed: !current } : i)) }
          : c
      )
    );
    setChecklistToggledInSession(true);
    setProgressAcknowledged(true);
    setManualProgress(null); // Clear manual override — let auto-calculation take over
    await supabase.from("checklist_items").update({ is_completed: !current }).eq("id", itemId);
    // Clear manual_progress in DB
    const newMetaCl = { ...((card.metadata as any) || {}), manual_progress: undefined };
    await supabase.from("cards").update({ metadata: newMetaCl }).eq("id", card.id);
    if (item) {
      logActivity(!current ? "checklist_item_completed" : "checklist_item_uncompleted", { title: item.title, checklist: cl?.name });
    }
  }

  async function handleDeleteChecklistItem(checklistId: string, itemId: string) {
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c
      )
    );
    await supabase.from("checklist_items").delete().eq("id", itemId);
  }

  async function handleEditChecklistItemSave(checklistId: string, itemId: string) {
    const trimmed = editingChecklistItemTitle.trim();
    if (!trimmed) { setEditingChecklistItemId(null); return; }
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, title: trimmed } : i)) }
          : c
      )
    );
    setEditingChecklistItemId(null);
    await supabase.from("checklist_items").update({ title: trimmed }).eq("id", itemId);
  }

  async function handleChecklistItemDueDate(checklistId: string, itemId: string, date: string) {
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, due_date: date || null } : i)) }
          : c
      )
    );
    await supabase.from("checklist_items").update({ due_date: date || null }).eq("id", itemId);
  }

  async function handleChecklistItemAssignee(checklistId: string, itemId: string, userId: string | null) {
    // Find the item to get its title and due_date
    const checklist = checklists.find((c) => c.id === checklistId);
    const item = checklist?.items.find((i) => i.id === itemId);

    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, assigned_to: userId } : i)) }
          : c
      )
    );
    await supabase.from("checklist_items").update({ assigned_to: userId }).eq("id", itemId);

    // Create a linked card for the assigned person
    if (userId && item) {
      await createLinkedCard(item.title, userId, item.due_date);
    }
  }

  // ─── Attachments ────────────────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const filePath = `${card.id}/${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(filePath, file, { upsert: true });

      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(filePath);
        const fileUrl = urlData?.publicUrl || "";

        const { error } = await supabase.from("card_attachments").insert({
          card_id: card.id,
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || "application/octet-stream",
          uploaded_by: currentUserId,
        });

        if (!error) {
          logActivity("attachment_added", { file_name: file.name });
        }
      }
    }

    await loadAttachments();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeleteAttachment(attachment: Attachment) {
    const filePath = `${card.id}/${attachment.file_name}`;
    await supabase.storage.from("attachments").remove([filePath]);
    await supabase.from("card_attachments").delete().eq("id", attachment.id);
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    logActivity("attachment_removed", { file_name: attachment.file_name });
  }

  // ─── Comments ───────────────────────────────────────────────────────────

  async function handleAddComment() {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setSendingComment(true);
    const { error } = await supabase
      .from("card_comments")
      .insert({ card_id: card.id, user_id: currentUserId, content: trimmed });
    if (!error) {
      setNewComment("");
      await loadActivityFeed();
    }
    setSendingComment(false);
  }

  function handleCommentKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true);
    await supabase.from("checklist_items").delete().in(
      "checklist_id",
      checklists.map((c) => c.id)
    );
    await supabase.from("checklists").delete().eq("card_id", card.id);
    await supabase.from("card_attachments").delete().eq("card_id", card.id);
    await supabase.from("activity_logs").delete().eq("card_id", card.id);
    await supabase.from("subtasks").delete().eq("card_id", card.id);
    await supabase.from("card_labels").delete().eq("card_id", card.id);
    await supabase.from("card_assignees").delete().eq("card_id", card.id);
    await supabase.from("card_comments").delete().eq("card_id", card.id);
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    setDeleting(false);
    if (!error) {
      onDeleted(card.id);
      onClose();
    }
  }

  // ─── Refs & effects ─────────────────────────────────────────────────────

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [editingDescription]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingTitle && !editingDescription) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTitle, editingDescription, progressAcknowledged]);

  // ─── Computed values ────────────────────────────────────────────────────

  const isOverdue = dueDate && new Date(dueDate) < new Date() && !completedAt;
  const currentColumn = columns.find((c) => c.id === columnId);
  const assignedUserIds = new Set(assignees.map((a: any) => a.user_id));
  const availableMembers = orgMembers.filter((m) => !assignedUserIds.has(m.user_id));

  const completedSubtasks = subtasks.filter((s) => s.is_completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  // Total progress across subtasks + checklists
  const allChecklistItems = checklists.flatMap((cl) => cl.items);
  const totalItems = subtasks.length + allChecklistItems.length;
  const completedItems = completedSubtasks + allChecklistItems.filter((i) => i.is_completed).length;
  const autoProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Effective progress: manual overrides auto
  const effectiveProgress = manualProgress !== null ? manualProgress : autoProgress;

  // Find the done column (is_done_column flag, or last column by position)
  const doneColumn = columns.find((c) => c.is_done_column)
    || [...columns].sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0];

  // Gate close: require progress acknowledgment + auto-move to done if 100%
  async function handleClose() {
    if (!progressAcknowledged) {
      setShowProgressWarning(true);
      setTimeout(() => setShowProgressWarning(false), 3000);
      return;
    }

    // If progress is 100% and card is NOT already in done column, move it
    if (effectiveProgress === 100 && doneColumn && columnId !== doneColumn.id) {
      const supabase = createClient();
      await supabase.from("cards").update({
        column_id: doneColumn.id,
        completed_at: new Date().toISOString(),
      }).eq("id", card.id);
      logActivity("moved", { to_column: doneColumn.name });
      logActivity("completed", {});
      onUpdated({ ...card, column_id: doneColumn.id, completed_at: new Date().toISOString() });
    }

    onClose();
  }

  function acknowledgeProgress() {
    setProgressAcknowledged(true);
    setShowProgressWarning(false);
  }

  // ─── Interactive progress bar ──────────────────────────────────────────

  const lastSavedProgressRef = useRef<number | null>(manualProgress);
  const dragStartedRef = useRef(false);

  function snapTo5(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value / 5) * 5));
  }

  function calcProgressFromEvent(e: React.MouseEvent | MouseEvent) {
    const bar = progressBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return snapTo5((x / rect.width) * 100);
  }

  async function saveManualProgress(value: number) {
    // Skip if value hasn't changed from last save
    if (value === lastSavedProgressRef.current) return;
    lastSavedProgressRef.current = value;
    setManualProgress(value);
    setProgressAcknowledged(true);
    setShowProgressWarning(false);
    const supabase = createClient();
    const newMeta = { ...((card.metadata as any) || {}), manual_progress: value };
    await supabase.from("cards").update({ metadata: newMeta }).eq("id", card.id);
    logActivity("progress_updated", { progress: value });
    // Propagate to parent so card list updates
    onUpdated({ ...card, metadata: newMeta });
  }

  function handleBarMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartedRef.current = true;
    setIsDraggingProgress(true);
    const val = calcProgressFromEvent(e);
    setManualProgress(val);
    setProgressAcknowledged(true);

    const handleMouseMove = (ev: MouseEvent) => {
      const v = calcProgressFromEvent(ev);
      setManualProgress(v);
    };
    const handleMouseUp = (ev: MouseEvent) => {
      setIsDraggingProgress(false);
      const finalVal = calcProgressFromEvent(ev);
      saveManualProgress(finalVal);
      dragStartedRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handlePercentDoubleClick() {
    setEditingPercent(true);
    setPercentInput(String(effectiveProgress));
    setTimeout(() => percentInputRef.current?.select(), 50);
  }

  function handlePercentSubmit() {
    const val = snapTo5(parseInt(percentInput) || 0);
    saveManualProgress(val);
    setEditingPercent(false);
  }

  const descriptionIsLong = description.length > 300;

  function getMemberName(userId: string | null): string {
    if (!userId) return "?";
    const member = orgMembers.find((m) => m.user_id === userId);
    return member?.profiles?.full_name || member?.profiles?.email || "?";
  }

  function getMemberAvatar(userId: string | null) {
    if (!userId) return null;
    const member = orgMembers.find((m) => m.user_id === userId);
    return member?.profiles?.avatar_url || null;
  }

  // ─── Avatar helper ──────────────────────────────────────────────────────

  function renderAvatar(name: string, avatarUrl: string | null, size: "sm" | "md" = "sm") {
    const sizeClasses = size === "sm" ? "w-6 h-6 text-[9px]" : "w-7 h-7 text-[10px]";
    if (avatarUrl) {
      return (
        <img src={avatarUrl} alt={name} className={cn(sizeClasses, "rounded-full object-cover shrink-0")} />
      );
    }
    return (
      <div
        className={cn(sizeClasses, "rounded-full flex items-center justify-center font-bold text-white shrink-0")}
        style={{ backgroundColor: generateColor(name) }}
      >
        {getInitials(name)}
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Cover color bar */}
        {card.cover_color && (
          <div className="h-1.5 shrink-0" style={{ backgroundColor: card.cover_color }} />
        )}

        {/* Top bar: close + saving indicator */}
        <div className="flex items-center justify-between px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center gap-2">
            {/* Completed badge */}
            <button
              onClick={handleToggleCompleted}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                completedAt
                  ? "bg-green-500/15 text-green-500 hover:bg-green-500/25 hover:scale-105"
                  : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary hover:scale-105"
              )}
            >
              <CheckCircle2 className={cn("w-3.5 h-3.5", completedAt && "fill-current")} />
              {completedAt ? "Concluida" : "Marcar concluida"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <button
              onClick={handleClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive progress bar */}
        <div className="px-6 pt-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div
                ref={progressBarRef}
                className={cn(
                  "relative h-3 rounded-full overflow-hidden transition-all select-none",
                  isDraggingProgress ? "cursor-grabbing" : "cursor-pointer",
                  progressAcknowledged ? "bg-muted" : "bg-muted ring-2 ring-primary/40 ring-offset-1 ring-offset-card animate-pulse"
                )}
                onMouseDown={handleBarMouseDown}
                title="Clique ou arraste para ajustar o progresso (5 em 5%)"
              >
                <div
                  className={cn(
                    "h-full rounded-full pointer-events-none",
                    isDraggingProgress ? "transition-none" : "transition-all duration-300",
                    effectiveProgress === 100 ? "bg-green-500" : effectiveProgress >= 50 ? "bg-primary" : "bg-orange-400"
                  )}
                  style={{ width: `${effectiveProgress}%` }}
                />
                {/* Drag handle indicator */}
                {effectiveProgress > 0 && effectiveProgress < 100 && (
                  <div
                    className="absolute top-0 h-full w-1.5 bg-white/80 rounded-full shadow pointer-events-none"
                    style={{ left: `calc(${effectiveProgress}% - 3px)` }}
                  />
                )}
              </div>
            </div>

            {/* Percentage display / editable input */}
            {editingPercent ? (
              <form
                onSubmit={(e) => { e.preventDefault(); handlePercentSubmit(); }}
                className="flex items-center"
              >
                <input
                  ref={percentInputRef}
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={percentInput}
                  onChange={(e) => setPercentInput(e.target.value)}
                  onBlur={handlePercentSubmit}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingPercent(false); }}
                  className="w-14 text-xs font-bold tabular-nums px-2 py-1 rounded-md border border-primary text-center bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </form>
            ) : (
              <button
                onClick={() => { acknowledgeProgress(); }}
                onDoubleClick={handlePercentDoubleClick}
                className={cn(
                  "text-xs font-bold tabular-nums px-2 py-1 rounded-md transition-all min-w-[48px] text-center",
                  progressAcknowledged
                    ? effectiveProgress === 100 ? "text-green-600 bg-green-50 dark:bg-green-500/10" : "text-muted-foreground bg-muted"
                    : "text-primary bg-primary/10 hover:bg-primary/20 ring-1 ring-primary/30 cursor-pointer"
                )}
                title="Clique duplo para digitar o valor"
              >
                {effectiveProgress}%
              </button>
            )}
            {progressAcknowledged && !editingPercent && (
              <span className="text-[10px] text-green-500 font-medium">✓</span>
            )}
          </div>

          {/* Warning toast */}
          {showProgressWarning && (
            <div className="mt-2 flex items-center gap-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg px-3 py-2 animate-in slide-in-from-top-2">
              <span className="text-orange-500 text-sm">⚠️</span>
              <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                Confirme o progresso clicando na barra ou no percentual antes de fechar.
              </p>
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── LEFT COLUMN: Card content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-w-0" style={{ flex: "0 0 65%" }}>
            {/* Title */}
            <div>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  className="w-full text-2xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none pb-1"
                />
              ) : (
                <h2
                  onClick={() => setEditingTitle(true)}
                  className={cn(
                    "text-2xl font-bold text-foreground cursor-pointer hover:text-primary/90 transition-colors leading-tight",
                    completedAt && "line-through text-muted-foreground"
                  )}
                >
                  {title}
                </h2>
              )}
            </div>

            {/* Properties grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Status / Column */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Columns3 className="w-3.5 h-3.5" />
                  Status
                </label>
                <div className="relative" ref={columnDropdownRef}>
                  <button
                    onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent/50 hover:bg-accent transition-colors w-full text-left"
                  >
                    {currentColumn && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentColumn.color }} />
                    )}
                    <span className="truncate">{currentColumn?.name || "—"}</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                  </button>
                  {showColumnDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                      {columns.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => handleColumnChange(col.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                            col.id === columnId && "bg-accent"
                          )}
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                          {col.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Assignees */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Responsaveis
                </label>
                <div className="relative" ref={assigneeDropdownRef}>
                  <div className="flex items-center gap-1 flex-wrap">
                    {assignees.length === 0 ? (
                      <button
                        onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                        className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md bg-accent/50 hover:bg-accent transition-colors w-full text-left"
                      >
                        Nenhum
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 flex-wrap flex-1">
                          {assignees.map((a: any) => {
                            const name = a.profiles?.full_name || a.profiles?.email || "?";
                            return (
                              <div
                                key={a.user_id}
                                className="flex items-center gap-1.5 px-2 py-1 bg-accent/50 rounded-md group"
                              >
                                {renderAvatar(name, a.profiles?.avatar_url)}
                                <span className="text-xs text-foreground">{name.split(" ")[0]}</span>
                                <button
                                  onClick={() => removeAssignee(a.user_id)}
                                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                          disabled={availableMembers.length === 0}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {showAssigneeDropdown && availableMembers.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                      {availableMembers.map((m) => {
                        const name = m.profiles?.full_name || m.profiles?.email || "?";
                        return (
                          <button
                            key={m.user_id}
                            onClick={() => addAssignee(m.user_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            {renderAvatar(name, m.profiles?.avatar_url)}
                            <span className="truncate">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Datas
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Start date + time */}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Inicio</label>
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={startDate ? startDate.split("T")[0] : ""}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 bg-accent/50 border border-transparent hover:border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="w-[72px] px-1.5 py-1 bg-accent/50 border border-transparent hover:border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        title="Hora de início"
                      />
                    </div>
                  </div>
                  {/* Due date + time */}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Prazo</label>
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={dueDate ? dueDate.split("T")[0] : ""}
                        onChange={(e) => handleDueDateChange(e.target.value)}
                        className={cn(
                          "flex-1 min-w-0 px-2 py-1 bg-accent/50 border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                          isOverdue ? "border-destructive text-destructive" : "border-transparent hover:border-border text-foreground"
                        )}
                      />
                      <input
                        type="time"
                        value={dueTime}
                        onChange={(e) => handleDueTimeChange(e.target.value)}
                        className={cn(
                          "w-[72px] px-1.5 py-1 bg-accent/50 border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                          isOverdue ? "border-destructive text-destructive" : "border-transparent hover:border-border text-foreground"
                        )}
                        title="Hora limite"
                      />
                    </div>
                  </div>
                </div>
                {isOverdue && (
                  <p className="text-[10px] text-destructive font-medium">Atrasada!</p>
                )}
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" />
                  Prioridade
                </label>
                <div className="relative" ref={priorityDropdownRef}>
                  <button
                    onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border w-full transition-colors text-left",
                      priorityConfig[priority].bg,
                      priorityConfig[priority].color,
                      priorityConfig[priority].border
                    )}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {priorityConfig[priority].label}
                  </button>
                  {showPriorityDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p}
                          onClick={() => handlePriorityChange(p)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors",
                            priorityConfig[p].color,
                            p === priority && "bg-accent"
                          )}
                        >
                          <Flag className="w-3.5 h-3.5" />
                          {priorityConfig[p].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Labels */}
              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5" />
                    Labels
                  </label>
                  <div className="relative" ref={labelDropdownRef}>
                    <button
                      onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      + Adicionar
                    </button>
                    {showLabelDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-20 max-h-72 overflow-y-auto">
                        <div className="p-2 space-y-1">
                          {boardLabels.map((label) => {
                            const isActive = cardLabels.some((cl) => cl.id === label.id);
                            return (
                              <button
                                key={label.id}
                                onClick={() => isActive ? removeLabelFromCard(label.id) : addLabelToCard(label)}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                                  isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
                                )}
                              >
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                                <span className="truncate flex-1 text-left">{label.name}</span>
                                {isActive && <span className="text-xs text-primary">&#10003;</span>}
                              </button>
                            );
                          })}
                          {boardLabels.length === 0 && !creatingLabel && (
                            <p className="text-xs text-muted-foreground px-3 py-2">Nenhuma label criada</p>
                          )}
                        </div>
                        <div className="border-t border-border p-2">
                          {creatingLabel ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                placeholder="Nome da label"
                                className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleCreateLabel();
                                  if (e.key === "Escape") setCreatingLabel(false);
                                }}
                              />
                              <div className="flex gap-1.5">
                                {LABEL_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => setNewLabelColor(color)}
                                    className={cn(
                                      "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                                      newLabelColor === color ? "border-foreground" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateLabel}
                                  className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:bg-primary/90"
                                >
                                  Criar
                                </button>
                                <button
                                  onClick={() => setCreatingLabel(false)}
                                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-xs"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setCreatingLabel(true)}
                              className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-accent transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Criar nova label
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {cardLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cardLabels.map((label) => (
                      <span
                        key={label.id}
                        className="inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-0.5 font-medium text-white group"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                        <button
                          onClick={() => removeLabelFromCard(label.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white/70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Descricao
              </label>
              {editingDescription ? (
                <div className="space-y-2">
                  <textarea
                    ref={descriptionRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDescription(card.description || "");
                        setEditingDescription(false);
                      }
                    }}
                    rows={8}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                    placeholder="Adicione uma descricao..."
                  />
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={handleDescriptionSave}
                      className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => { setDescription(card.description || ""); setEditingDescription(false); }}
                      className="px-4 py-1.5 text-muted-foreground hover:text-foreground text-xs"
                    >
                      Cancelar
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={async () => {
                        // If already recording, stop
                        if (descriptionRecording && descriptionRecorderRef.current) {
                          descriptionRecorderRef.current.recorder.stop();
                          setDescriptionRecording(false);
                          return;
                        }
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                          const recorder = new MediaRecorder(stream, {
                            mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
                          });
                          const chunks: Blob[] = [];
                          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                          recorder.onstop = async () => {
                            stream.getTracks().forEach(t => t.stop());
                            const blob = new Blob(chunks, { type: "audio/webm" });
                            // Transcribe
                            const formData = new FormData();
                            formData.append("audio", blob, "audio.webm");
                            const res = await fetch("/api/transcribe", { method: "POST", body: formData });
                            if (res.ok) {
                              const { text } = await res.json();
                              if (text) setDescription((prev) => (prev || "") + (prev ? "\n" : "") + text);
                            }
                          };
                          recorder.start();
                          // Stop after user clicks again or after 60s
                          setDescriptionRecording(true);
                          descriptionRecorderRef.current = { recorder, stream };
                        } catch {
                          alert("Não foi possível acessar o microfone.");
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        descriptionRecording
                          ? "bg-red-500 text-white animate-pulse"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                      title={descriptionRecording ? "Parar gravação" : "Gravar e transcrever"}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {descriptionRecording ? "Gravando..." : "Voz"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    onClick={() => setEditingDescription(true)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors whitespace-pre-wrap break-words",
                      description
                        ? "text-foreground hover:bg-accent/50"
                        : "text-muted-foreground bg-muted/30 hover:bg-muted/50 min-h-[48px]",
                      descriptionIsLong && !descriptionExpanded && "max-h-[120px] overflow-hidden relative"
                    )}
                  >
                    {description || "Clique para adicionar uma descricao..."}
                    {descriptionIsLong && !descriptionExpanded && (
                      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                    )}
                  </div>
                  {descriptionIsLong && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDescriptionExpanded(!descriptionExpanded); }}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 font-medium"
                    >
                      {descriptionExpanded ? (
                        <><ChevronUp className="w-3 h-3" /> Recolher</>
                      ) : (
                        <><ChevronDown className="w-3 h-3" /> Expandir</>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Subtasks (legacy) */}
            {(subtasks.length > 0 || !loadingSubtasks) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5" />
                    Subtarefas
                    {subtasks.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({completedSubtasks}/{subtasks.length})
                      </span>
                    )}
                  </label>
                </div>

                {subtasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          subtaskProgress === 100 ? "bg-green-500" : "bg-primary"
                        )}
                        style={{ width: `${subtaskProgress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {subtaskProgress}%
                    </span>
                  </div>
                )}

                {loadingSubtasks ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {subtasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center gap-2 group py-1 px-1.5 rounded-md hover:bg-accent/30 transition-colors"
                      >
                        <button
                          onClick={() => handleToggleSubtask(st.id, st.is_completed)}
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        >
                          {st.is_completed ? (
                            <CheckSquare className="w-4 h-4 text-green-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        {editingSubtaskId === st.id ? (
                          <input
                            type="text"
                            value={editingSubtaskTitle}
                            onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                            onBlur={() => handleEditSubtaskSave(st.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSubtaskSave(st.id);
                              if (e.key === "Escape") setEditingSubtaskId(null);
                            }}
                            className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingSubtaskId(st.id); setEditingSubtaskTitle(st.title); }}
                            className={cn(
                              "flex-1 text-sm cursor-pointer",
                              st.is_completed ? "line-through text-muted-foreground" : "text-foreground"
                            )}
                          >
                            {st.title}
                          </span>
                        )}

                        {/* Due date picker — always visible like checklist items */}
                        <input
                          type="date"
                          value={st.due_date || ""}
                          onChange={(e) => handleSubtaskDueDate(st.id, e.target.value || null)}
                          className="w-[110px] shrink-0 px-1 py-0.5 bg-transparent border border-transparent hover:border-border rounded text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          title="Data de vencimento"
                        />

                        {/* Assignee picker — always visible like checklist items */}
                        <select
                          value={st.assigned_to || ""}
                          onChange={(e) => handleSubtaskAssignee(st.id, e.target.value || null)}
                          className="w-[100px] shrink-0 px-1 py-0.5 bg-transparent border border-transparent hover:border-border rounded text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                          title="Responsável"
                        >
                          <option value="">Ninguem</option>
                          {orgMembers.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.profiles?.full_name || m.profiles?.email}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleDeleteSubtask(st.id)}
                          className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSubtask(); }}
                    placeholder="Adicionar subtarefa..."
                    className="flex-1 px-3 py-1.5 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim() || addingSubtask}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {addingSubtask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* BPM Task Fields — render actual field types */}
            {cardIsBpmTask && bpmFields.length > 0 && (
              <div className="space-y-3">
                <label className="text-xs font-medium text-violet-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Workflow className="w-3.5 h-3.5" />
                  Campos do Processo
                  {loadingBpmFields && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </label>
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-3">
                  {bpmFields.map((field) => (
                    <div key={field.id} className="relative">
                      <DynamicField
                        field={field}
                        value={bpmFieldValues[field.id]}
                        onChange={(val) => handleBpmFieldChange(field.id, val)}
                        members={orgMembers.map((m) => ({ user_id: m.user_id, full_name: m.profiles.full_name, email: m.profiles.email }))}
                      />
                      {savingBpmField === field.id && (
                        <div className="absolute top-0 right-0 mt-1 mr-1">
                          <Loader2 className="w-3 h-3 animate-spin text-violet-500" />
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    Alterações são sincronizadas automaticamente com o processo BPM.
                  </p>
                </div>
              </div>
            )}

            {/* Checklists */}
            <div className="space-y-4">
              {loadingChecklists ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                checklists.map((cl) => {
                  const completedItems = cl.items.filter((i) => i.is_completed).length;
                  const totalItems = cl.items.length;
                  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

                  return (
                    <div key={cl.id} className="space-y-2 bg-accent/20 rounded-lg p-3">
                      {/* Checklist header */}
                      <div className="flex items-center justify-between">
                        {editingChecklistName === cl.id ? (
                          <input
                            type="text"
                            value={editingChecklistNameValue}
                            onChange={(e) => setEditingChecklistNameValue(e.target.value)}
                            onBlur={() => handleRenameChecklist(cl.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameChecklist(cl.id);
                              if (e.key === "Escape") setEditingChecklistName(null);
                            }}
                            className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                        ) : (
                          <h4
                            onClick={() => { setEditingChecklistName(cl.id); setEditingChecklistNameValue(cl.name); }}
                            className="text-sm font-semibold text-foreground cursor-pointer hover:text-primary flex items-center gap-1.5"
                          >
                            <ClipboardList className="w-4 h-4 text-muted-foreground" />
                            {cl.name}
                            {totalItems > 0 && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({completedItems}/{totalItems})
                              </span>
                            )}
                          </h4>
                        )}
                        <button
                          onClick={() => handleDeleteChecklist(cl.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Progress bar */}
                      {totalItems > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                progress === 100 ? "bg-green-500" : "bg-primary"
                              )}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {progress}%
                          </span>
                        </div>
                      )}

                      {/* Items */}
                      <div className="space-y-0.5">
                        {cl.items.map((item) => {
                          const assigneeName = getMemberName(item.assigned_to);
                          const assigneeAvatar = getMemberAvatar(item.assigned_to);

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 group py-1 px-1.5 rounded-md hover:bg-accent/50 transition-colors"
                            >
                              <button
                                onClick={() => handleToggleChecklistItem(cl.id, item.id, item.is_completed)}
                                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                              >
                                {item.is_completed ? (
                                  <CheckSquare className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>

                              {editingChecklistItemId === item.id ? (
                                <input
                                  type="text"
                                  value={editingChecklistItemTitle}
                                  onChange={(e) => setEditingChecklistItemTitle(e.target.value)}
                                  onBlur={() => handleEditChecklistItemSave(cl.id, item.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleEditChecklistItemSave(cl.id, item.id);
                                    if (e.key === "Escape") setEditingChecklistItemId(null);
                                  }}
                                  className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => { setEditingChecklistItemId(item.id); setEditingChecklistItemTitle(item.title); }}
                                  className={cn(
                                    "flex-1 text-sm cursor-pointer min-w-0 truncate",
                                    item.is_completed ? "line-through text-muted-foreground" : "text-foreground"
                                  )}
                                >
                                  {item.title}
                                </span>
                              )}

                              {/* Due date picker — always visible */}
                              <input
                                type="date"
                                value={item.due_date ? item.due_date.split("T")[0] : ""}
                                onChange={(e) => handleChecklistItemDueDate(cl.id, item.id, e.target.value)}
                                className="w-[110px] shrink-0 px-1 py-0.5 bg-transparent border border-transparent hover:border-border rounded text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                title="Data de vencimento"
                              />

                              {/* Assignee picker — always visible */}
                              <select
                                value={item.assigned_to || ""}
                                onChange={(e) => handleChecklistItemAssignee(cl.id, item.id, e.target.value || null)}
                                className="w-[100px] shrink-0 px-1 py-0.5 bg-transparent border border-transparent hover:border-border rounded text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                                title="Responsavel"
                              >
                                <option value="">Ninguem</option>
                                {orgMembers.map((m) => (
                                  <option key={m.user_id} value={m.user_id}>
                                    {m.profiles?.full_name || m.profiles?.email}
                                  </option>
                                ))}
                              </select>

                              <button
                                onClick={() => handleDeleteChecklistItem(cl.id, item.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add item input */}
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={newChecklistItemTitle[cl.id] || ""}
                          onChange={(e) => setNewChecklistItemTitle((prev) => ({ ...prev, [cl.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddChecklistItem(cl.id); }}
                          placeholder="Adicionar subtarefa..."
                          className="flex-1 px-3 py-1.5 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                          onClick={() => handleAddChecklistItem(cl.id)}
                          disabled={!(newChecklistItemTitle[cl.id] || "").trim()}
                          className="px-2 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Add checklist buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleAddChecklist()}
                  disabled={addingChecklist}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-accent/30 hover:bg-accent rounded-md transition-colors"
                >
                  {addingChecklist ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Nova checklist
                </button>
                <button
                  onClick={() => handleAddChecklist("5W2H", FIVE_W_TWO_H_ITEMS)}
                  disabled={addingChecklist}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-md transition-colors"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  5W2H
                </button>

                {/* Start BPM Process — hidden for BPM tasks and already-linked cards */}
                {!cardIsBpmTask && !cardLinkedToBpm && (
                  <div className="relative" ref={processDropdownRef}>
                    <button
                      onClick={() => { if (!showProcessDropdown) loadAvailablePipes(); setShowProcessDropdown(!showProcessDropdown); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-500 hover:text-violet-400 bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/20 rounded-md transition-colors"
                    >
                      <Workflow className="w-3.5 h-3.5" />
                      Iniciar Processo
                    </button>
                    {showProcessDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto">
                        {loadingPipes ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : availablePipes.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-3 py-2">Nenhum processo disponível</p>
                        ) : (
                          availablePipes.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => handleSelectPipe(p)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
                            >
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* BPM link indicator */}
                {cardLinkedToBpm && !cardIsBpmTask && (
                  <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-violet-500 bg-violet-500/10 rounded-md">
                    <Workflow className="w-3 h-3" />
                    {(card.metadata as any)?.bpm_pipe_name || "Processo vinculado"}
                  </span>
                )}
              </div>

              {/* Inline form for starting process */}
              {selectedPipe && (
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Workflow className="w-4 h-4 text-violet-500" />
                      {selectedPipe.name}
                    </h4>
                    <button onClick={() => { setSelectedPipe(null); setPipeFields([]); }} className="p-1 hover:bg-accent rounded cursor-pointer">
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {pipeFields.length > 0 && (
                    <div className="space-y-2.5">
                      {pipeFields.map((field) => (
                        <DynamicField
                          key={field.id}
                          field={field}
                          value={pipeFieldValues[field.id]}
                          onChange={(val) => setPipeFieldValues((prev) => ({ ...prev, [field.id]: val }))}
                          members={orgMembers.map((m) => ({ user_id: m.user_id, full_name: m.profiles.full_name, email: m.profiles.email }))}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={handleStartProcess}
                    disabled={startingProcess}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {startingProcess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Workflow className="w-4 h-4" />}
                    Iniciar Processo
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Attachments */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Anexos
                {attachments.length > 0 && (
                  <span className="text-[10px] font-normal">({attachments.length})</span>
                )}
              </label>

              {loadingAttachments ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : attachments.length > 0 ? (
                <div className="space-y-1">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-accent/30 hover:bg-accent/50 transition-colors group"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{att.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(att.file_size)} &middot; {formatDateTime(att.created_at)}
                        </p>
                      </div>
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Baixar"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteAttachment(att)}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Action links */}
            <div className="flex flex-wrap gap-3 pb-4">
              <button
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Em breve"
              >
                <Link2 className="w-4 h-4" />
                Vincular itens ou adicionar dependencias
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                Anexar arquivo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />

              <button
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors opacity-50 cursor-not-allowed"
                title="Em breve"
                disabled
              >
                <Mic className="w-4 h-4" />
                Gravar audio
              </button>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Activity sidebar ── */}
          <div
            className="border-l border-border flex flex-col bg-accent/10 overflow-hidden"
            style={{ flex: "0 0 35%" }}
          >
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Activity
                {activityFeed.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                    {activityFeed.length}
                  </span>
                )}
              </h3>
            </div>

            {/* Activity feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loadingActivity ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma atividade ainda</p>
                </div>
              ) : (
                activityFeed.map((entry) => {
                  const name = entry.profiles?.full_name || entry.profiles?.email || "?";
                  const avatar = entry.profiles?.avatar_url || null;

                  if (entry.type === "comment") {
                    return (
                      <div key={entry.id} className="flex gap-2">
                        {renderAvatar(name, avatar, "md")}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-semibold text-foreground">{name.split(" ")[0]}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                          </div>
                          <div className="mt-1 px-2.5 py-1.5 bg-card border border-border rounded-lg">
                            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{entry.content}</p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={entry.id} className="flex gap-2 items-start">
                      {renderAvatar(name, avatar)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{name.split(" ")[0]}</span>{" "}
                          {entry.content}
                        </p>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={activityEndRef} />
            </div>

            {/* Comment input */}
            <div className="border-t border-border px-4 py-3 space-y-2 shrink-0">
              <div className="flex items-start gap-2">
                {renderAvatar(
                  orgMembers.find((m) => m.user_id === currentUserId)?.profiles?.full_name || "Eu",
                  orgMembers.find((m) => m.user_id === currentUserId)?.profiles?.avatar_url || null,
                  "md"
                )}
                <div className="flex-1 flex gap-1.5">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Escreva um comentario..."
                    rows={1}
                    className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || sendingComment}
                    className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowAI(!showAI)}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors font-medium",
                  showAI
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground/60 hover:text-primary hover:bg-primary/5"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {showAI ? "Fechar assistente IA" : "Assistente IA"}
              </button>
              {showAI && (
                <div className="mt-2">
                  <AIAssistant
                    cardTitle={title}
                    cardDescription={description}
                    subtasks={subtasks}
                    onClose={() => setShowAI(false)}
                    onInsertContent={async (content, target) => {
                      if (target === "description") {
                        // Append to description
                        const newDesc = (description || "") + (description ? "\n\n" : "") + content;
                        setDescription(newDesc);
                        await supabase.from("cards").update({ description: newDesc }).eq("id", card.id);
                      } else if (target === "subtask") {
                        // Parse lines as subtasks
                        const lines = content.split("\n").filter((l) => l.trim());
                        for (let idx = 0; idx < lines.length; idx++) {
                          let line = lines[idx].replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
                          if (!line) continue;
                          // Remove markdown bold
                          line = line.replace(/\*\*/g, "");
                          const pos = subtasks.length + idx;
                          await supabase.from("subtasks").insert({
                            card_id: card.id,
                            title: line,
                            is_completed: false,
                            position: pos,
                            assigned_to: null,
                            created_by: currentUserId,
                          });
                        }
                        await loadSubtasks();
                      } else if (target === "checklist") {
                        // Create a new checklist with parsed items
                        const lines = content.split("\n").filter((l) => l.trim());
                        const items = lines
                          .map((l) => l.replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim())
                          .filter((l) => l.length > 0);
                        await handleAddChecklist("IA - Checklist", items.map((t) => ({ title: t })));
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer: Created info + Delete */}
            <div className="border-t border-border px-4 py-3 shrink-0 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                Criado em {formatDate(card.created_at)}
              </div>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Deletar tarefa
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
