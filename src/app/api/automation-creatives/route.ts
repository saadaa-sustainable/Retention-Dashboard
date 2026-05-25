import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 120

interface CreativeRow {
  automation_name: string
  template_name: string
  template_copy: string | null
  creative_media_link: string | null
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function parseCreativesWorkbook(buf: ArrayBuffer): CreativeRow[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  // header:1 → array-of-arrays so we can forward-fill blank Automation Name cells
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (rows.length === 0) return []

  const header = rows[0].map(c => cell(c).toLowerCase())
  const idx = {
    automation: header.findIndex(h => h.includes('automation')),
    template_name: header.findIndex(h => h.includes('template') && h.includes('name')),
    template_copy: header.findIndex(h => h.includes('template') && h.includes('copy')),
    media: header.findIndex(h => h.includes('creative') || h.includes('media')),
  }
  if (idx.automation < 0 || idx.template_name < 0) {
    throw new Error('Excel must have "Automation Name" and "Template Name" columns')
  }

  const out: CreativeRow[] = []
  let lastAutomation = ''
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const auto = cell(r[idx.automation])
    if (auto) lastAutomation = auto
    const template = cell(r[idx.template_name])
    if (!template || !lastAutomation) continue
    out.push({
      automation_name: lastAutomation,
      template_name: template,
      template_copy: idx.template_copy >= 0 ? cell(r[idx.template_copy]) || null : null,
      creative_media_link: idx.media >= 0 ? cell(r[idx.media]) || null : null,
    })
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      return NextResponse.json({ error: 'Only .xlsx or .xls files are accepted' }, { status: 400 })
    }

    const buf = await file.arrayBuffer()
    const rows = parseCreativesWorkbook(buf)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No template rows found in file' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('automation_creatives')
      .upsert(rows, { onConflict: 'automation_name,template_name', ignoreDuplicates: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      inserted: rows.length,
      updated: 0,
      skipped: 0,
      errors: [],
      export_type: 'automation_creatives',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Creatives upload error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name')
    const supabase = createAdminClient()

    let query = supabase.from('automation_creatives').select('*').order('template_name')
    if (name) {
      query = query.ilike('automation_name', name)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data, count: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
