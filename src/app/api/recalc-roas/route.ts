import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 120

// Recalculate `calculated_roas` for every campaign and automation row using the
// current template_type_costs rate card. For each row:
//   1. Find a template_type by joining on the creatives table
//      (campaigns join on campaign_id, automations on automation_name).
//      If a row has multiple templates of different types, the first one
//      encountered wins — typically all templates for a single
//      campaign/automation share the same type anyway.
//   2. Look up that type's cost_per_message.
//   3. cost     = delivered × cost_per_message
//   4. revenue  = sales (campaigns) / sales + recovered_amount (automations)
//   5. calculated_roas = revenue / cost   (NULL if cost or revenue is 0)
//
// Stored separately from the CSV-provided `roas` so both stay distinct in the
// DB; the UI displays `roas ?? calculated_roas` so they look identical.
export async function POST() {
  try {
    const supabase = createAdminClient()

    // Pull the rate card once.
    const { data: rateRows, error: rateErr } = await supabase
      .from('template_type_costs')
      .select('template_type, cost_per_message')
    if (rateErr) throw rateErr
    const rateMap = new Map<string, number>()
    for (const r of (rateRows || []) as { template_type: string; cost_per_message: number }[]) {
      rateMap.set(r.template_type, Number(r.cost_per_message))
    }

    // Build campaign_id → template_type and automation_name → template_type maps
    // (first match wins).
    const { data: campCreatives, error: ccErr } = await supabase
      .from('campaign_creatives')
      .select('campaign_id, template_type')
      .not('template_type', 'is', null)
    if (ccErr) throw ccErr
    const campTypeByCid = new Map<string, string>()
    for (const r of (campCreatives || []) as { campaign_id: string; template_type: string }[]) {
      if (!campTypeByCid.has(r.campaign_id)) campTypeByCid.set(r.campaign_id, r.template_type)
    }

    const { data: autoCreatives, error: acErr } = await supabase
      .from('automation_creatives')
      .select('automation_name, template_type')
      .not('template_type', 'is', null)
    if (acErr) throw acErr
    const autoTypeByName = new Map<string, string>()
    for (const r of (autoCreatives || []) as { automation_name: string; template_type: string }[]) {
      if (!autoTypeByName.has(r.automation_name)) autoTypeByName.set(r.automation_name, r.template_type)
    }

    // Iterate campaigns + automations and recompute calculated_roas.
    // Use batched range queries to avoid the 1000-row default cap.
    async function processTable(
      table: 'campaigns' | 'automations',
      keyCol: 'campaign_id' | 'name',
      typeMap: Map<string, string>,
      revenueExpr: (r: { sales: number; recovered_amount?: number }) => number,
    ) {
      const BATCH = 1000
      let from = 0
      let updated = 0
      while (true) {
        const selectCols = `id, ${keyCol}, delivered, sales${table === 'automations' ? ', recovered_amount' : ''}`
        const { data: rows, error } = await supabase
          .from(table)
          .select(selectCols)
          .range(from, from + BATCH - 1)
        if (error) throw error
        if (!rows || rows.length === 0) break

        const updates: { id: string; calculated_roas: number | null }[] = []
        for (const row of rows as unknown as Array<Record<string, unknown>>) {
          const key = String(row[keyCol] ?? '')
          const ttype = typeMap.get(key)
          const rate = ttype ? rateMap.get(ttype) : undefined
          const delivered = Number(row.delivered ?? 0)
          const revenue = revenueExpr({
            sales: Number(row.sales ?? 0),
            recovered_amount: Number(row.recovered_amount ?? 0),
          })
          let calc: number | null = null
          if (rate && rate > 0 && delivered > 0 && revenue > 0) {
            const cost = delivered * rate
            calc = Math.round((revenue / cost) * 10000) / 10000
          }
          updates.push({ id: String(row.id), calculated_roas: calc })
        }

        // Apply updates. Supabase JS doesn't bulk-update arbitrary values, so we
        // group by calc value to reduce round-trips (lots of NULLs in practice).
        const byValue = new Map<string, string[]>()
        for (const u of updates) {
          const k = u.calculated_roas === null ? 'NULL' : String(u.calculated_roas)
          const arr = byValue.get(k) || []
          arr.push(u.id)
          byValue.set(k, arr)
        }
        for (const [k, ids] of byValue) {
          const calc = k === 'NULL' ? null : Number(k)
          const { error: updErr } = await supabase
            .from(table)
            .update({ calculated_roas: calc })
            .in('id', ids)
          if (updErr) throw updErr
          updated += ids.length
        }

        if (rows.length < BATCH) break
        from += BATCH
      }
      return updated
    }

    const campaignsUpdated   = await processTable('campaigns',   'campaign_id', campTypeByCid, r => r.sales)
    const automationsUpdated = await processTable('automations', 'name',        autoTypeByName, r => r.sales + (r.recovered_amount || 0))

    return NextResponse.json({
      ok: true,
      campaigns_updated: campaignsUpdated,
      automations_updated: automationsUpdated,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Recalc ROAS error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
