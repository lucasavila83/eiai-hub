import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const OMIE_BASE = "https://app.omie.com.br/api/v1";

async function omieCall(endpoint: string, call: string, params: any, appKey: string, appSecret: string) {
  const res = await fetch(`${OMIE_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: appKey,
      app_secret: appSecret,
      param: [params],
    }),
  });
  return res.json();
}

async function fetchAllPages(endpoint: string, call: string, listKey: string, appKey: string, appSecret: string) {
  const all: any[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await omieCall(endpoint, call, { pagina: page, registros_por_pagina: 500 }, appKey, appSecret);
    totalPages = data.total_de_paginas || 1;
    const items = data[listKey] || [];
    all.push(...items);
    page++;
    if (page <= totalPages) await new Promise((r) => setTimeout(r, 1000));
  }

  return all;
}

/**
 * POST /api/omie/sync
 * Syncs categories and departments from OMIE for all active configs in the org.
 * Body: { org_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { org_id } = await req.json();

    if (!org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    // Get all active OMIE configs for this org
    const { data: configs } = await admin
      .from("omie_config")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (!configs || configs.length === 0) {
      return NextResponse.json({ error: "Nenhuma config OMIE encontrada. Configure em Integracoes." }, { status: 404 });
    }

    const stats = { categories: 0, departments: 0 };

    for (const config of configs) {
      const { app_key, app_secret } = config;

      // ── Sync Categories ──
      const categories = await fetchAllPages("geral/categorias/", "ListarCategorias", "categoria_cadastro", app_key, app_secret);

      for (const cat of categories) {
        const tipo = cat.codigo.startsWith("1.") ? "receita"
          : cat.codigo.startsWith("2.") ? "despesa"
          : cat.codigo.startsWith("0.") ? "transferencia"
          : "outro";

        await admin.from("omie_categories").upsert({
          org_id,
          omie_key: app_key,
          codigo: cat.codigo,
          descricao: cat.descricao,
          parent_codigo: cat.categoria_superior || null,
          tipo,
          is_active: cat.conta_inativa !== "S",
          synced_at: new Date().toISOString(),
        }, { onConflict: "org_id,omie_key,codigo" });

        stats.categories++;
      }

      // ── Sync Departments ──
      const departments = await fetchAllPages("geral/departamentos/", "ListarDepartamentos", "departamentos", app_key, app_secret);

      for (const dep of departments) {
        await admin.from("omie_departments").upsert({
          org_id,
          omie_id: String(dep.codigo),
          codigo: dep.estrutura || String(dep.codigo),
          descricao: dep.descricao,
          is_active: dep.inativo !== "S",
          synced_at: new Date().toISOString(),
        }, { onConflict: "org_id,omie_id,codigo" });

        stats.departments++;
      }

      // Update last_sync_at
      await admin.from("omie_config")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", config.id);
    }

    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/omie/sync?org_id=xxx&type=categories|departments
 * Returns synced categories or departments for the org.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const type = searchParams.get("type") || "categories";

    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    if (type === "departments") {
      const { data } = await admin
        .from("omie_departments")
        .select("id, omie_id, codigo, descricao, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("codigo");

      return NextResponse.json(data || []);
    }

    // Default: categories
    const { data } = await admin
      .from("omie_categories")
      .select("id, codigo, descricao, parent_codigo, tipo, is_active")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("codigo");

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
