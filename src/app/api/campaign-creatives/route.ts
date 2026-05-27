import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 120

interface CreativeRow {
  campaign_id: string
  channel: string | null
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
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (rows.length === 0) return []

  const header = rows[0].map(c => cell(c).toLowerCase())
  const idx = {
    campaign: header.findIndex(h => h.includes('campaign') && h.includes('id')),
    channel: header.findIndex(h => h.includes('channel')),
    template_name: header.findIndex(h => h.includes('template') && h.includes('name')),
    template_copy: header.findIndex(h => h.includes('template') && h.includes('copy')),
    media: header.findIndex(h => h.includes('creative') || h.includes('media')),
  }
  if (idx.campaign < 0 || idx.template_name < 0) {
    throw new Error('Excel must have "Campaign ID" and "Template Name" columns')
  }

  const out: CreativeRow[] = []
  let lastCampaign = ''
  let lastChannel = ''
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const cid = cell(r[idx.campaign])
    if (cid) lastCampaign = cid
    const ch = idx.channel >= 0 ? cell(r[idx.channel]) : ''
    if (ch) lastChannel = ch
    const template = cell(r[idx.template_name])
    if (!template || !lastCampaign) continue
    out.push({
      campaign_id: lastCampaign,
      channel: lastChannel ? lastChannel.toLowerCase() : null,
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
      .from('campaign_creatives')
      .upsert(rows, { onConflict: 'campaign_id,template_name', ignoreDuplicates: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      inserted: rows.length,
      updated: 0,
      skipped: 0,
      errors: [],
      export_type: 'campaign_creatives',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Campaign creatives upload error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaign_id')
    const supabase = createAdminClient()

    let query = supabase.from('campaign_creatives').select('*').order('template_name')
    if (campaignId) {
      query = query.ilike('campaign_id', campaignId)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data, count: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
