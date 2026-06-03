import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import type { TemplateRow } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

// GET — return a unified list of every template (automation + campaign
// creatives), tagged with retention_type so the UI can show them in one view.
export async function GET() {
  const supabase = createAdminClient()
  const [autoRes, campRes] = await Promise.all([
    supabase.from('automation_creatives').select('*').order('automation_name'),
    supabase.from('campaign_creatives').select('*').order('campaign_id'),
  ])
  if (autoRes.error) return NextResponse.json({ error: autoRes.error.message }, { status: 500 })
  if (campRes.error) return NextResponse.json({ error: campRes.error.message }, { status: 500 })

  type AutoRow = {
    id: string; automation_name: string; template_name: string
    template_copy: string|null; creative_media_link: string|null
    template_type: string|null; status: string|null
    cost_per_message: string|number|null
  }
  type CampRow = {
    id: string; campaign_id: string; template_name: string
    template_copy: string|null; creative_media_link: string|null
    template_type: string|null; status: string|null
    cost_per_message: string|number|null
  }

  const toCost = (v: string|number|null): number|null => {
    if (v == null) return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }

  const rows: TemplateRow[] = [
    ...((autoRes.data || []) as AutoRow[]).map(r => ({
      id: r.id,
      retention_type: 'Automation' as const,
      source_table: 'automation_creatives' as const,
      parent_name: r.automation_name,
      template_name: r.template_name,
      template_copy: r.template_copy,
      creative_media_link: r.creative_media_link,
      template_type: (r.template_type ?? null) as TemplateRow['template_type'],
      status: (r.status ?? null) as TemplateRow['status'],
      cost_per_message: toCost(r.cost_per_message),
    })),
    ...((campRes.data || []) as CampRow[]).map(r => ({
      id: r.id,
      retention_type: 'Campaign' as const,
      source_table: 'campaign_creatives' as const,
      parent_name: r.campaign_id,
      template_name: r.template_name,
      template_copy: r.template_copy,
      creative_media_link: r.creative_media_link,
      template_type: (r.template_type ?? null) as TemplateRow['template_type'],
      status: (r.status ?? null) as TemplateRow['status'],
      cost_per_message: toCost(r.cost_per_message),
    })),
  ]

  return NextResponse.json({ data: rows, count: rows.length })
}

// PATCH — update template_type, status, and/or cost_per_message for one row.
// Body shape: { source_table, id, template_type?, status?, cost_per_message? }
// When cost_per_message changes, calculated_roas is recomputed for every
// campaign/automation row tied to this template's parent (campaign_id or
// automation_name) using cost = delivered × cost_per_message.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { source_table, id, template_type, status, cost_per_message } = body as {
      source_table?: string; id?: string
      template_type?: string|null; status?: string|null
      cost_per_message?: number|null
    }

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (source_table !== 'automation_creatives' && source_table !== 'campaign_creatives') {
      return NextResponse.json({ error: 'source_table must be automation_creatives or campaign_creatives' }, { status: 400 })
    }

    const updates: Record<string, string | number | null> = {}
    if (template_type !== undefined) updates.template_type = template_type || null
    if (status !== undefined)        updates.status        = status        || null
    if (cost_per_message !== undefined) {
      const cost = cost_per_message == null ? null : Number(cost_per_message)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
        return NextResponse.json({ error: 'cost_per_message must be a non-negative number or null' }, { status: 400 })
      }
      updates.cost_per_message = cost
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from(source_table).update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // If cost changed, recalculate calculated_roas for every campaign/automation
    // row whose parent matches this template's parent. Uses the FIRST creative's
    // cost for that parent — consistent with how template_type was already
    // resolved at upload time.
    let recalc: { updated: number } | undefined
    if (cost_per_message !== undefined) {
      recalc = await recalcRoasForTemplate(supabase, source_table, id)
    }

    return NextResponse.json({ ok: true, recalc })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Recalc calculated_roas for all campaign/automation rows linked to the same
// parent (campaign_id or automation_name) as the just-edited template. We use
// the FIRST creative-row's cost_per_message for that parent so the value is
// deterministic when a parent has multiple templates with different costs.
async function recalcRoasForTemplate(
  supabase: ReturnType<typeof createAdminClient>,
  sourceTable: 'automation_creatives' | 'campaign_creatives',
  creativeId: string,
): Promise<{ updated: number }> {
  // 1. Look up the parent_name for this template
  type ParentInfo = { campaign_id?: string; automation_name?: string; cost_per_message: string|number|null }
  const parentCol = sourceTable === 'campaign_creatives' ? 'campaign_id' : 'automation_name'
  const { data: tmpl, error: tErr } = await supabase
    .from(sourceTable)
    .select(`${parentCol}, cost_per_message`)
    .eq('id', creativeId)
    .single()
  if (tErr || !tmpl) return { updated: 0 }

  const parentName = String((tmpl as unknown as ParentInfo)[parentCol as 'campaign_id'|'automation_name'] || '')
  if (!parentName) return { updated: 0 }

  // 2. Find the FIRST creative's cost for this parent (deterministic across
  //    multiple templates with the same parent). Order by ingested_at so the
  //    earliest-known cost wins; this is the same rule the upload-time
  //    template_type lookup uses, keeping behaviour consistent.
  const { data: firstCreatives, error: fcErr } = await supabase
    .from(sourceTable)
    .select('cost_per_message')
    .eq(parentCol, parentName)
    .not('cost_per_message', 'is', null)
    .order('ingested_at', { ascending: true })
    .limit(1)
  if (fcErr) return { updated: 0 }

  const rate = firstCreatives && firstCreatives.length > 0
    ? Number((firstCreatives[0] as { cost_per_message: string|number }).cost_per_message)
    : null

  // 3. Recalc calculated_roas ONLY on rows whose CSV-provided roas is missing
  //    or non-positive. Rows that already have a real ROAS from the CSV are
  //    left completely alone — both their roas (untouched, as always) and
  //    their calculated_roas (kept null) — so a cost edit on a template never
  //    affects rows that came in with explicit ROAS values.
  const targetTable = sourceTable === 'campaign_creatives' ? 'campaigns' : 'automations'
  const matchCol = sourceTable === 'campaign_creatives' ? 'campaign_id' : 'name'
  const cols = `id, delivered, sales${targetTable === 'automations' ? ', recovered_amount' : ''}`

  let updated = 0
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data: rows, error } = await supabase
      .from(targetTable)
      .select(cols)
      .eq(matchCol, parentName)
      .or('roas.is.null,roas.lte.0')
      .range(from, from + PAGE - 1)
    if (error) break
    if (!rows || rows.length === 0) break

    type R = { id: string; delivered: number; sales: number; recovered_amount?: number }
    // Group by computed roas to minimise per-row UPDATEs.
    const buckets = new Map<string, string[]>()
    for (const r of rows as unknown as R[]) {
      const delivered = Number(r.delivered ?? 0)
      const revenue = (targetTable === 'automations'
        ? Number(r.sales ?? 0) + Number(r.recovered_amount ?? 0)
        : Number(r.sales ?? 0))
      let calc: number | null = null
      if (rate && rate > 0 && delivered > 0 && revenue > 0) {
        calc = Math.round((revenue / (delivered * rate)) * 10000) / 10000
      }
      const k = calc === null ? 'NULL' : String(calc)
      const arr = buckets.get(k) || []
      arr.push(r.id)
      buckets.set(k, arr)
    }

    for (const [k, ids] of buckets) {
      const calc = k === 'NULL' ? null : Number(k)
      const { error: uErr } = await supabase
        .from(targetTable)
        .update({ calculated_roas: calc })
        .in('id', ids)
      if (!uErr) updated += ids.length
    }

    if (rows.length < PAGE) break
    from += PAGE
  }

  return { updated }
}
