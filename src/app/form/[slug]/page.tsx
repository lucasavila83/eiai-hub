"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, CheckCircle2, AlertTriangle, Workflow, Send,
} from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface FieldDef {
  id: string;
  field_key: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  options: { value: string; label: string }[];
  default_value: any;
  position: number;
}

interface FormData {
  pipe: { id: string; name: string; icon: string; color: string };
  orgId: string;
  orgName: string;
  startPhase: { id: string; name: string };
  fields: FieldDef[];
}

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/bpm/public-form?slug=${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Formulário não encontrado");
        return r.json();
      })
      .then((data) => {
        setFormData(data);
        // Initialize checklist values
        const initial: Record<string, any> = {};
        for (const f of data.fields) {
          if (f.field_type === "checklist" && f.options?.length) {
            initial[f.id] = f.options.map((o: any) => ({ label: o.label, checked: false }));
          }
        }
        setValues(initial);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [slug]);

  function validate(): boolean {
    if (!formData) return false;
    const errs: Record<string, string> = {};
    if (!title.trim()) errs["__title"] = "Campo obrigatório";
    for (const f of formData.fields) {
      if (f.is_required) {
        const val = values[f.id];
        if (val === null || val === undefined || val === "") {
          errs[f.id] = "Campo obrigatório";
        } else if (f.field_type === "checklist" && Array.isArray(val)) {
          const allUnchecked = val.every((i: any) => !i.checked);
          if (allUnchecked) errs[f.id] = "Marque pelo menos um item";
        }
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/bpm/public-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, values }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao enviar");
      }

      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Formulário indisponível</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enviado com sucesso!</h1>
          <p className="text-gray-500 text-sm">Seu formulário foi recebido. Obrigado!</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle("");
              setValues({});
              setFieldErrors({});
              // Re-initialize checklists
              const initial: Record<string, any> = {};
              for (const f of formData!.fields) {
                if (f.field_type === "checklist" && f.options?.length) {
                  initial[f.id] = f.options.map((o: any) => ({ label: o.label, checked: false }));
                }
              }
              setValues(initial);
            }}
            className="mt-6 inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Enviar outro
          </button>
        </div>
      </div>
    );
  }

  if (!formData) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: formData.pipe.color + "20" }}
              >
                <Workflow className="w-5 h-5" style={{ color: formData.pipe.color }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{formData.pipe.name}</h1>
                {formData.orgName && (
                  <p className="text-xs text-gray-400">{formData.orgName}</p>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Title field (always first) */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nome ou título do card"
                className={cn(
                  "w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
                  fieldErrors["__title"] ? "border-red-400" : "border-gray-200"
                )}
                required
              />
              {fieldErrors["__title"] && (
                <p className="text-xs text-red-500">{fieldErrors["__title"]}</p>
              )}
            </div>

            {/* Dynamic fields */}
            {formData.fields.map((field) => (
              <PublicDynamicField
                key={field.id}
                field={field}
                value={values[field.id] ?? null}
                orgId={formData?.orgId}
                onChange={(val) => setValues((prev) => ({ ...prev, [field.id]: val }))}
                error={fieldErrors[field.id] || null}
              />
            ))}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar formulário
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Formulário gerenciado por {formData.orgName}
        </p>
      </div>
    </div>
  );
}

// Simplified DynamicField for public form (no auth needed, light theme)
function PublicDynamicField({
  field,
  value,
  onChange,
  error,
  orgId,
}: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
  error: string | null;
  orgId?: string;
}) {
  const [omieOptions, setOmieOptions] = useState<{ value: string; label: string }[]>([]);
  const [omieLoading, setOmieLoading] = useState(false);

  useEffect(() => {
    if (!orgId || (field.field_type !== "omie_category" && field.field_type !== "omie_department")) return;
    const type = field.field_type === "omie_category" ? "categories" : "departments";
    setOmieLoading(true);
    fetch(`/api/omie/sync?org_id=${orgId}&type=${type}`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (type === "categories") {
          setOmieOptions(data.map((c: any) => ({ value: c.codigo, label: `${c.codigo} — ${c.descricao}` })));
        } else {
          setOmieOptions(data.map((d: any) => ({ value: d.omie_id, label: d.descricao })));
        }
      })
      .catch(() => setOmieOptions([]))
      .finally(() => setOmieLoading(false));
  }, [orgId, field.field_type]);
  const baseClass = cn(
    "w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-gray-900",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
    error ? "border-red-400" : "border-gray-200"
  );

  function renderField() {
    switch (field.field_type) {
      case "text":
        return <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} className={baseClass} />;
      case "textarea":
        return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} rows={3} className={cn(baseClass, "resize-none")} />;
      case "number":
        return <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} placeholder={field.placeholder || ""} className={baseClass} />;
      case "currency":
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
            <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} step="0.01" min="0" className={cn(baseClass, "pl-9")} />
          </div>
        );
      case "date":
        return <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={baseClass} />;
      case "select":
        return (
          <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={baseClass}>
            <option value="">{field.placeholder || "Selecione..."}</option>
            {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case "email":
        return <input type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || "email@exemplo.com"} className={baseClass} />;
      case "phone":
        return <input type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || "(00) 00000-0000"} className={baseClass} />;
      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600 w-4 h-4" />
            <span className="text-sm text-gray-700">{field.placeholder || "Sim"}</span>
          </label>
        );
      case "checklist": {
        const items: { label: string; checked: boolean }[] = Array.isArray(value)
          ? value
          : (field.options || []).map((o) => ({ label: o.label, checked: false }));
        if (!Array.isArray(value) && field.options?.length) onChange(items);
        const allChecked = items.length > 0 && items.every((i) => i.checked);
        const checkedCount = items.filter((i) => i.checked).length;
        return (
          <div className="space-y-1 bg-gray-50 rounded-lg p-3">
            {items.length > 1 && (
              <label className="flex items-center gap-2 cursor-pointer py-1 border-b border-gray-200 mb-1">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => onChange(items.map((i) => ({ ...i, checked: !allChecked })))}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-xs font-medium text-gray-500">{allChecked ? "Desmarcar todos" : "Marcar todos"}</span>
                <span className="text-xs text-gray-400 ml-auto">{checkedCount}/{items.length}</span>
              </label>
            )}
            {items.map((item, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => {
                    const updated = [...items];
                    updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
                    onChange(updated);
                  }}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className={cn("text-sm", item.checked ? "text-gray-400 line-through" : "text-gray-700")}>{item.label}</span>
              </label>
            ))}
          </div>
        );
      }
      case "omie_category":
      case "omie_department":
        return (
          <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={baseClass} disabled={omieLoading}>
            <option value="">{omieLoading ? "Carregando..." : field.placeholder || (field.field_type === "omie_category" ? "Selecionar categoria..." : "Selecionar departamento...")}</option>
            {omieOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      default:
        return <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} className={baseClass} />;
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
        {field.label}
        {field.is_required && <span className="text-red-500">*</span>}
      </label>
      {renderField()}
      {field.help_text && <p className="text-xs text-gray-400">{field.help_text}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
