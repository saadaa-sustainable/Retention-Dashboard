import Papa from 'papaparse'
import type { Campaign, Automation, ExportType } from '@/types'

// ── Detect export type from columns ───────────────────────────────────────
export function detectExportType(headers: string[]): ExportType {
  const h = headers.map(s => s.toLowerCase().trim())
  if (h.includes('recovered amount') || h.includes('recovered carts')) return 'gokwik_carts'
  if (h.includes('automation_name') || h.includes('automation name') || h.includes('templates_used')) return 'automations'
  if (h.includes('source') || h.includes('date')) return 'campaigns'
  return 'automations'
}

// ── Clean numeric ─────────────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '' || v === 'NA' || v === 'N/A') return 0
  const s = String(v).replace(/[₹,%]/g, '').trim()
  return parseFloat(s) || 0
}

function toNullNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === 'NA' || v === 'N/A') return null
  const s = String(v).replace(/[₹,%]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function buildRowLookup(row: Record<string, unknown>) {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) {
    map.set(key.toLowerCase().trim(), value)
  }
  return map
}

function valueFrom(row: Record<string, unknown>, aliases: string[]) {
  const lookup = buildRowLookup(row)
  for (const alias of aliases) {
    const value = lookup.get(alias.toLowerCase())
    if (value !== undefined) return value
  }
  return undefined
}

function normalizeDateValue(v: unknown): string | null {
  const s = String(v || '').trim()
  if (!s) return null

  const iso = s.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]

  const dmy = s.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const slashDmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (slashDmy) {
    const [, d, m, y] = slashDmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

// ── Parse campaign name → dimensions ──────────────────────────────────────
export function parseCampaignName(name: string) {
  const parts = name.split('_')
  const campaign_id  = parts[0] || ''
  const source_type  = parts[1] || ''

  // Extract offer code from name
  const offerCodes = ['USP','NCL','COD','POLL','B2','B3G1','RS','LYL','MAR','UGC','BST']
  const offer = offerCodes.find(o => name.includes(o)) || 'USP'

  // Extract format
  const formats = ['IMG','TXT','VID','DOC','ICAR']
  const format = formats.find(f => name.includes(f)) || 'IMG'

  return { campaign_id, source_type, offer, format }
}

// ── Extract included segment from source string ────────────────────────────
export function extractSegment(source: string, name: string): string {
  if (!source || typeof source !== 'string') {
    // Fall back to parsing from name
    const parts = name.split('_')
    return parts.slice(1, -3).join('_') || name
  }
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Included Segment') && i + 1 < lines.length) {
      return lines[i + 1].trim()
    }
  }
  return name
}

// ── Parse campaigns CSV ───────────────────────────────────────────────────
export function parseCampaignsCSV(raw: string): Omit<Campaign, 'id' | 'ingested_at'>[] {
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true })
  return (result.data as Record<string, unknown>[]).map(row => {
    const name   = String(row['Name'] || '').trim()
    const source = String(row['Source'] || '')
    const { campaign_id, source_type, offer, format } = parseCampaignName(name)
    const segment = extractSegment(source, name)

    return {
      name,
      campaign_id,
      source_type,
      segment,
      offer,
      format,
      channel:       String(row['Channel'] || 'whatsapp').toLowerCase() as Campaign['channel'],
      date:          String(row['Date'] || '').slice(0, 10),
      sent:          toNum(row['Sent']),
      delivered:     toNum(row['Delivered']),
      seen:          toNum(row['Seen']),
      ctr:           toNullNum(row['CTR']),
      clicks:        toNum(row['Clicks']),
      buyers:        toNum(row['Buyers']),
      unsubscribers: toNum(row['Unsubscribers']),
      sales:         toNum(row['Sales']),
      orders:        toNum(row['Orders']),
      cost:          toNum(row['Cost']),
      roas:          toNullNum(row['ROAS']),
      source_raw:    source.slice(0, 1000),
    }
  }).filter(r => r.name && r.date)
}

// ── Parse automations CSV ─────────────────────────────────────────────────
export function parseAutomationsCSV(raw: string, snapshotDate: string | null = null): Omit<Automation, 'id' | 'ingested_at'>[] {
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true })
  // Helper: try to extract a YYYY-MM-DD from any "date-y" column in the row
  function extractDateFromRow(row: Record<string, unknown>, fallback: string | null) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase().includes('date')) {
        const parsed = normalizeDateValue(row[k])
        if (parsed) return parsed
      }
    }
    return fallback
  }

  return (result.data as Record<string, unknown>[]).map(row => {
    const name = String(valueFrom(row, ['Name', 'name', 'Automation Name', 'automation_name']) || '').trim()
    const perRowDate = extractDateFromRow(row, snapshotDate)

    return {
      name,
      type: 'standard' as const,
      channel:          String(valueFrom(row, ['Channel', 'channel']) || 'whatsapp').toLowerCase() as Automation['channel'],
      date:             perRowDate,
      sent:             toNum(valueFrom(row, ['Sent', 'sent'])),
      delivered:        toNum(valueFrom(row, ['Delivered', 'delivered'])),
      seen:             toNum(valueFrom(row, ['Seen', 'seen', 'Opened', 'opened'])),
      ctr:              toNullNum(valueFrom(row, ['CTR', 'ctr'])),
      clicks:           toNum(valueFrom(row, ['Clicks', 'clicks', 'Clicked', 'clicked'])),
      buyers:           toNum(valueFrom(row, ['Buyers', 'buyers'])),
      unsubscribers:    toNum(valueFrom(row, ['Unsubscribers', 'unsubscribers'])),
      sales:            toNum(valueFrom(row, ['Sales', 'sales', 'Revenue INR', 'revenue_inr'])),
      orders:           toNum(valueFrom(row, ['Orders', 'orders'])),
      cost:             toNum(valueFrom(row, ['Cost', 'cost', 'Cost INR', 'cost_inr'])),
      roas:             toNullNum(valueFrom(row, ['ROAS', 'roas'])),
      recovered_amount: 0,
      recovered_carts:  0,
    }
  }).filter(r => r.name)
}

// ── Parse GoKwik carts CSV ────────────────────────────────────────────────
export function parseGokwikCSV(raw: string, snapshotDate: string | null = null): Omit<Automation, 'id' | 'ingested_at'>[] {
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true })
  // Allow per-row date in GoKwik exports as well (fall back to snapshotDate)
  function extractDateFromRow(row: Record<string, unknown>, fallback: string | null) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase().includes('date')) {
        const parsed = normalizeDateValue(row[k])
        if (parsed) return parsed
      }
    }
    return fallback
  }

  return (result.data as Record<string, unknown>[]).map(row => ({
    name:             String(row['Name'] || row['name'] || '').trim(),
    type:             'cart_recovery' as const,
    channel:          String(row['Channel'] || row['channel'] || 'whatsapp').toLowerCase() as Automation['channel'],
    date:             extractDateFromRow(row, snapshotDate),
    sent:             toNum(row['Sent']),
    delivered:        toNum(row['Delivered']),
    seen:             toNum(row['Seen']),
    ctr:              toNullNum(row['CTR']),
    clicks:           toNum(row['Clicks']),
    buyers:           toNum(row['Buyers']),
    unsubscribers:    toNum(row['Unsubscribers']),
    sales:            0,
    orders:           0,
    cost:             toNum(row['Cost']),
    roas:             toNullNum(row['ROAS']),
    recovered_amount: toNum(row['Recovered Amount']),
    recovered_carts:  toNum(row['Recovered Carts']),
  })).filter(r => r.name)
}

// ── Auto-detect and parse any export ──────────────────────────────────────
export function parseExport(raw: string, forceType?: ExportType, snapshotDate: string | null = null) {
  const firstLine = raw.split('\n')[0]
  const headers   = firstLine.split(',').map(h => h.replace(/"/g, '').trim())
  const type      = forceType || detectExportType(headers)

  if (type === 'campaigns')    return { type, data: parseCampaignsCSV(raw) }
  if (type === 'gokwik_carts') return { type, data: parseGokwikCSV(raw, snapshotDate) }
  return { type: 'automations' as ExportType, data: parseAutomationsCSV(raw, snapshotDate) }
}
