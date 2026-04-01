/**
 * Resolves {{variable}} placeholders in a template body.
 * Missing variables are replaced with empty string.
 */
export function resolveTemplate(
  body: string,
  variables: Record<string, string>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
}

/** Available placeholder variables with descriptions */
export const TEMPLATE_VARIABLES = [
  { key: "card_title", label: "Título da tarefa", contexts: ["kanban", "bpm"] },
  { key: "card_assignee", label: "Responsável", contexts: ["kanban", "bpm"] },
  { key: "board_name", label: "Nome do board", contexts: ["kanban"] },
  { key: "due_date", label: "Prazo", contexts: ["kanban", "bpm"] },
  { key: "progress", label: "Progresso (%)", contexts: ["kanban"] },
  { key: "phase_name", label: "Fase atual", contexts: ["bpm"] },
  { key: "pipe_name", label: "Nome do processo", contexts: ["bpm"] },
  { key: "org_name", label: "Organizacao", contexts: ["kanban", "bpm"] },
] as const;

/** Sample values for preview */
export const SAMPLE_VARIABLES: Record<string, string> = {
  card_title: "Revisar contrato",
  card_assignee: "Maria Silva",
  board_name: "Juridico",
  due_date: "28/03/2026",
  progress: "75",
  phase_name: "Documentacao",
  pipe_name: "Contratacao",
  org_name: "Minha Empresa",
};
