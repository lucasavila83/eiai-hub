"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/helpers";

export interface FieldDef {
  id: string;
  phase_id: string;
  field_key: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  options: { value: string; label: string }[];
  default_value: any;
  position: number;
  validations: Record<string, any>;
  assignee_id?: string | null;
}

interface Props {
  field: FieldDef;
  value: any;
  onChange: (value: any) => void;
  members?: { user_id: string; full_name: string | null; email: string }[];
  disabled?: boolean;
  error?: string | null;
  orgId?: string;
}

function useOmieOptions(orgId: string | undefined, type: "categories" | "departments", enabled: boolean) {
  const [options, setOptions] = useState<{ value: string; label: string; extra?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !orgId) return;
    setLoading(true);
    fetch(`/api/omie/sync?org_id=${orgId}&type=${type}`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (type === "categories") {
          setOptions(
            data.map((c: any) => ({ value: c.codigo, label: `${c.codigo} — ${c.descricao}`, extra: c.tipo }))
          );
        } else {
          setOptions(
            data.map((d: any) => ({ value: d.omie_id, label: d.descricao }))
          );
        }
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [orgId, type, enabled]);

  return { options, loading };
}

export function DynamicField({ field, value, onChange, members = [], disabled = false, error, orgId }: Props) {
  const isOmieField = field.field_type === "omie_category" || field.field_type === "omie_department";
  const omieType = field.field_type === "omie_category" ? "categories" : "departments";
  const { options: omieOptions, loading: omieLoading } = useOmieOptions(orgId, omieType, isOmieField);

  const baseInputClass = cn(
    "w-full px-3 py-2 bg-background border rounded-lg text-sm text-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
    error ? "border-destructive" : "border-input",
    disabled && "opacity-60 cursor-not-allowed"
  );

  function renderField() {
    switch (field.field_type) {
      case "text":
        return (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            className={baseInputClass}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "textarea":
        return (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            rows={3}
            className={cn(baseInputClass, "resize-none")}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            placeholder={field.placeholder || ""}
            min={field.validations?.min}
            max={field.validations?.max}
            className={baseInputClass}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "currency":
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <input
              type="number"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
              placeholder={field.placeholder || "0,00"}
              step="0.01"
              min="0"
              className={cn(baseInputClass, "pl-9")}
              disabled={disabled}
              required={field.is_required}
            />
          </div>
        );

      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn(baseInputClass, "cursor-pointer")}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "select":
        return (
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn(baseInputClass, "cursor-pointer")}
            disabled={disabled}
            required={field.is_required}
          >
            <option value="">{field.placeholder || "Selecione..."}</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );

      case "multiselect": {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {(field.options || []).map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      onChange(
                        isSelected
                          ? selected.filter((v) => v !== opt.value)
                          : [...selected, opt.value]
                      );
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <p className="text-xs text-muted-foreground">{selected.length} selecionado{selected.length > 1 ? "s" : ""}</p>
            )}
          </div>
        );
      }

      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="accent-primary w-4 h-4 cursor-pointer"
              disabled={disabled}
            />
            <span className="text-sm text-foreground">{field.placeholder || "Sim"}</span>
          </label>
        );

      case "email":
        return (
          <input
            type="email"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "email@exemplo.com"}
            className={baseInputClass}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "phone":
        return (
          <input
            type="tel"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "(00) 00000-0000"}
            className={baseInputClass}
            disabled={disabled}
            required={field.is_required}
          />
        );

      case "file":
        return (
          <div>
            {value && (
              <div className="mb-2 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <span className="text-xs text-foreground truncate flex-1">{typeof value === "string" ? value : "Arquivo anexado"}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="text-xs text-destructive hover:underline cursor-pointer"
                  >
                    Remover
                  </button>
                )}
              </div>
            )}
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange(file.name);
              }}
              className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary file:cursor-pointer hover:file:bg-primary/20"
              disabled={disabled}
            />
          </div>
        );

      case "checklist": {
        // Value is stored as array of {label: string, checked: boolean}
        // Options define the checklist items; value tracks checked state
        const items: { label: string; checked: boolean }[] = Array.isArray(value)
          ? value
          : (field.options || []).map((opt) => ({ label: opt.label, checked: false }));

        // Build a set of required item labels from field options
        const requiredLabels = new Set(
          (field.options || []).filter((o: any) => o.required).map((o) => o.label)
        );

        // Initialize value if empty
        if (!Array.isArray(value) && field.options?.length) {
          onChange(items);
        }

        const allChecked = items.length > 0 && items.every((i) => i.checked);
        const checkedCount = items.filter((i) => i.checked).length;

        return (
          <div className="space-y-1">
            {items.length > 1 && (
              <label className="flex items-center gap-2 cursor-pointer py-1 border-b border-border mb-1">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => {
                    if (disabled) return;
                    const newState = !allChecked;
                    onChange(items.map((i) => ({ ...i, checked: newState })));
                  }}
                  className="accent-primary w-4 h-4 cursor-pointer"
                  disabled={disabled}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {allChecked ? "Desmarcar todos" : "Marcar todos"}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">{checkedCount}/{items.length}</span>
              </label>
            )}
            {items.map((item, idx) => {
              const isItemRequired = requiredLabels.has(item.label);
              return (
                <label key={idx} className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      if (disabled) return;
                      const updated = [...items];
                      updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
                      onChange(updated);
                    }}
                    className="accent-primary w-4 h-4 cursor-pointer"
                    disabled={disabled}
                  />
                  <span className={cn("text-sm", item.checked ? "text-muted-foreground line-through" : "text-foreground")}>
                    {item.label}
                  </span>
                  {isItemRequired && !item.checked && (
                    <span className="text-[9px] text-destructive font-medium ml-auto">obrigatório</span>
                  )}
                  {isItemRequired && item.checked && (
                    <span className="text-[9px] text-green-500 font-medium ml-auto">✓</span>
                  )}
                </label>
              );
            })}
          </div>
        );
      }

      case "user":
        return (
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn(baseInputClass, "cursor-pointer")}
            disabled={disabled}
            required={field.is_required}
          >
            <option value="">{field.placeholder || "Selecionar pessoa..."}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        );

      case "omie_category": {
        // Filter by tipo from field validations if set (e.g. validations.tipo = "despesa")
        const tipoFilter = field.validations?.tipo;
        const catOptions = tipoFilter
          ? omieOptions.filter((o) => o.extra === tipoFilter)
          : omieOptions;

        return (
          <div className="relative">
            <select
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              className={cn(baseInputClass, "cursor-pointer")}
              disabled={disabled || omieLoading}
              required={field.is_required}
            >
              <option value="">
                {omieLoading ? "Carregando categorias..." : field.placeholder || "Selecionar categoria..."}
              </option>
              {catOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {omieLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>
        );
      }

      case "omie_department":
        return (
          <div className="relative">
            <select
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              className={cn(baseInputClass, "cursor-pointer")}
              disabled={disabled || omieLoading}
              required={field.is_required}
            >
              <option value="">
                {omieLoading ? "Carregando departamentos..." : field.placeholder || "Selecionar departamento..."}
              </option>
              {omieOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {omieLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            className={baseInputClass}
            disabled={disabled}
          />
        );
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground flex items-center gap-1">
        {field.label}
        {field.is_required && <span className="text-destructive">*</span>}
      </label>
      {renderField()}
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
