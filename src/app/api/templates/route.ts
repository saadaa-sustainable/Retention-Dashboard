import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import type { TemplateRow } from '@/types'

export const runtime = 'nodejs'

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
  }
  type CampRow = {
    id: string; campaign_id: string; template_name: string
    template_copy: string|null; creative_media_link: string|null
    template_type: string|null; status: string|null
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
    })),
  ]

  return NextResponse.json({ data: rows, count: rows.length })
}

// PATCH — update template_type and/or status for one row. Body shape:
//   { source_table, id, template_type?, status? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { source_table, id, template_type, status } = body as {
      source_table?: string; id?: string
      template_type?: string|null; status?: string|null
    }

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (source_table !== 'automation_creatives' && source_table !== 'campaign_creatives') {
      return NextResponse.json({ error: 'source_table must be automation_creatives or campaign_creatives' }, { status: 400 })
    }

    const updates: Record<string, string | null> = {}
    if (template_type !== undefined) updates.template_type = template_type || null
    if (status !== undefined)        updates.status        = status        || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from(source_table).update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
