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
// Per the naming convention doc:
//   L3 Content Theme codes: BST, PRC, USP, VRP, EDU, UGC, IMW, OFF, HR
//   L5 Offer codes: appear with prefix variants OFF_, OFF-, OF_, OF-
//     followed by the actual offer name. Names in production are full words
//     like RAHOSAADAA, SAADAA350, FREETOTE, B2G10 — not just the short
//     abbreviations (RS, B2, B3G1) listed in the doc.
//
// IMPORTANT: L3 content themes are NOT offers. The `offer` field only stores
// what follows the OFF/OF prefix — empty string for campaigns that aren't
// running an offer.

const FORMAT_CODES = ['IMG', 'TXT', 'VID', 'DOC', 'ICAR'] as const

// Tokens that can appear after an OFF/OF prefix but aren't real offer codes —
// they're format codes (IMG/TXT/…), L3 themes (USP/BST/…), L5 V2 types
// (PER/VAL/FRE), or template version markers (T1/T2/…). When the regex captures
// one of these we keep looking for a real offer further along the name.
const NON_OFFER_CODES = new Set([
  'BST', 'PRC', 'USP', 'VRP', 'EDU', 'UGC', 'IMW', 'HR',
  'PER', 'VAL', 'FRE',
  'IMG', 'TXT', 'VID', 'DOC', 'ICAR',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6',
  // Suffix / marker tokens that have appeared in real campaign names but
  // aren't offers (campaign tags, content markers, broadcast indicators).
  'NCL', 'CFY', 'LD', 'LFA', 'NPL', 'KWC', 'GE', 'NU', 'BC', 'VDS', 'CTG', 'MAR', 'TOTE',
  // Bare prefix tokens that can appear without an actual offer code following.
  'OFF', 'OF',
])

// V2 offer-type codes (PER/VAL/FRE) optionally followed by an amount, e.g.
// "VAL-400", "PER-15", "FRE-X". These describe the offer TYPE, not the offer
// itself, so they shouldn't be reported as the V1 offer code.
function isV2OfferType(code: string): boolean {
  return /^(?:VAL|PER|FRE)(?:-|$)/i.test(code)
}

function extractOfferCode(name: string): string {
  // 1) Pre-Launch (OF-PL) — the documented V1 code literally contains "OF-",
  // so match it before any generic prefix-stripping logic.
  if (/(?:^|[_-])(?:OFF[_-])?OF[-_]PL(?:[_-]|$)/i.test(name)) return 'OF-PL'

  // 2) FORMAT_<offer> pattern. Handles BOTH naming conventions seen in the
  //    wild:
  //      - legacy: ..._USP_IMG_OF-RAHOSAADAA_LD  (offer follows format with
  //        an OFF/OF prefix)
  //      - new:    ..._IMG_SUMMER300_CFY         (offer follows format
  //        directly, no prefix)
  //    Greedy capture allows dashes inside the offer code (e.g. OF-B2G10),
  //    stopping only at the next underscore. Blacklisted captures are
  //    skipped via iteration so a real offer further along still matches.
  const formatRe = /(?:^|[_-])(?:IMG|TXT|VID|DOC|ICAR)[_-](?:(?:OFF|OF)[_-])?([A-Za-z][A-Za-z0-9-]*)(?=_|$)/gi
  let m: RegExpExecArray | null
  while ((m = formatRe.exec(name)) !== null) {
    const code = m[1].toUpperCase()
    if (!NON_OFFER_CODES.has(code) && !isV2OfferType(code)) return code
  }

  // 3) Legacy fallback — OFF/OF prefix anywhere in the name, for cases where
  //    the offer isn't positioned right after a format token (or the name
  //    doesn't include a format token at all).
  const legacyRe = /(?:^|[_-])(?:OFF|OF)[-_]([A-Za-z][A-Za-z0-9-]*)(?=[_-]|$)/gi
  while ((m = legacyRe.exec(name)) !== null) {
    const code = m[1].toUpperCase()
    if (!NON_OFFER_CODES.has(code) && !isV2OfferType(code)) return code
  }

  return ''
}

function extractFormat(name: string): string {
  for (const f of FORMAT_CODES) {
    const re = new RegExp(`(?:^|[_-])${f}(?:[_-]|$)`, 'i')
    if (re.test(name)) return f
  }
  return ''
}

export function parseCampaignName(name: string) {
  const parts = name.split('_')
  const campaign_id = parts[0] || ''
  const source_type = parts[1] || ''
  // offer = L5 V1 code only (RS, B2, B3G1, OF-PL, LYL). Empty for non-OFF campaigns.
  const offer = extractOfferCode(name)
  return { campaign_id, source_type, offer, format: extractFormat(name) || 'IMG' }
}

// ── Extract included segment from source string ────────────────────────────
// Stop tokens that signal the end of the segment portion in a campaign name.
// Everything after one of these (content theme code or format code) is post-segment.
const SEGMENT_STOP = /_(BST|PRC|USP|VRP|EDU|UGC|IMW|HR|OFF|OF|IMG|TXT|VID|DOC|ICAR)(?:[_-]|$)/i

// Markers that indicate where the segment starts inside the campaign name.
// Anchored to the start of string OR a `_`/`-` separator (NOT \b, which fails
// against `_` since `_` is a word char). The captured group is the marker
// itself, used to compute the segment-start offset.
const SEGMENT_MARKER = /(?:^|[_-])(\d+<LTV(?:<\d+)?|ATC|ABC|CNB|DNC|RNC|failed|KP=\d+|L\d+D|P-L\d+D|Winterwear)/i

function fallbackSegmentFromName(name: string): string {
  const m = name.match(SEGMENT_MARKER)
  if (!m) return ''
  // m.index points at the leading separator (if any). Step past it to land on
  // the actual marker text captured in m[1].
  const leadOffset = m[0].length - m[1].length
  const start = (m.index ?? 0) + leadOffset
  const tail = name.slice(start)
  const stop = tail.match(SEGMENT_STOP)
  const end = stop ? start + (stop.index ?? 0) : name.length
  return name.slice(start, end).replace(/[_-]+$/, '').trim()
}

export function extractSegment(source: string, name: string): string {
  // Preferred: the CSV "Source" column may contain a literal "Included Segment"
  // header followed by the segment name on the next line.
  if (source && typeof source === 'string') {
    const lines = source.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Included Segment') && i + 1 < lines.length) {
        const seg = lines[i + 1].trim()
        if (seg) return seg
      }
    }
  }
  // Fallback: derive a segment portion from the campaign name itself.
  // Crucially we do NOT return the full name — that's what was leaking entire
  // campaign IDs (like "C128_RET_CNB_26042026_USP_IMG_SUMM…") into the raw
  // segments column. If no segment marker exists, return '' so the row is
  // grouped as "Other / no segment" downstream.
  return fallbackSegmentFromName(name)
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
      date:          normalizeDateValue(row['Date']) || '',
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

    // Automation files come in two shapes:
    //   A) Standard automations: have Sales + Orders columns.
    //   B) Cart-recovery automations (GoKwik etc.): have Recovered Amount +
    //      Recovered Carts columns *instead of* Sales/Orders.
    // We read both sets and set the type based on which is populated. The
    // dashboard unifies revenue as `sales + recovered_amount`, so neither
    // shape loses data.
    const recoveredAmount = toNum(valueFrom(row, ['Recovered Amount', 'recovered_amount', 'Recovered_Amount']))
    const recoveredCarts  = toNum(valueFrom(row, ['Recovered Carts',  'recovered_carts',  'Recovered_Carts']))

    return {
      name,
      type: (recoveredAmount > 0 || recoveredCarts > 0) ? 'cart_recovery' as const : 'standard' as const,
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
      recovered_amount: recoveredAmount,
      recovered_carts:  recoveredCarts,
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
