import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['Utility','Marketing','Transactional','RCS','SMS','Email','Authentication'])

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('template_type_costs')
    .select('*')
    .order('template_type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// PATCH a single rate. Body: { template_type, cost_per_message }
// Triggers a downstream recalc of calculated_roas across campaigns + automations.
export async function PATCH(req: NextRequest) {
  try {
    const { template_type, cost_per_message } = await req.json() as {
      template_type?: string
      cost_per_message?: number
    }
    if (!template_type || !VALID_TYPES.has(template_type)) {
      return NextResponse.json({ error: 'invalid template_type' }, { status: 400 })
    }
    const cost = Number(cost_per_message)
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: 'cost_per_message must be a non-negative number' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('template_type_costs')
      .upsert({ template_type, cost_per_message: cost, updated_at: new Date().toISOString() }, { onConflict: 'template_type' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
