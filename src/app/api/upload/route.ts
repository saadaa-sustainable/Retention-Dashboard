import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { parseExport } from '@/lib/parser'
import type { ExportType, UploadResult } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 500

// Fields compared to decide "is this row byte-identical to what's already in DB?"
// Excludes keys (name/date for campaigns, name for automations) and auto fields
// (id, ingested_at). Also excludes campaigns.source_raw — that's display text,
// volatile to whitespace, not a meaningful metric.
const CAMPAIGN_COMPARE_FIELDS = [
  'campaign_id','source_type','segment','offer','format','channel',
  'sent','delivered','seen','ctr','clicks','buyers',
  'unsubscribers','sales','orders','cost','roas',
] as const

const AUTOMATION_COMPARE_FIELDS = [
  'type','channel','date',
  'sent','delivered','seen','ctr','clicks','buyers',
  'unsubscribers','sales','orders','cost','roas',
  'recovered_amount','recovered_carts',
] as const

// Round to 4 decimals — DB stores NUMERIC(*,2..4), so a parsed float like
// 430725.9499999996 (CSV) reads back as 430725.95 after a round-trip.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.round(a * 10000) === Math.round(b * 10000)
  }
  // Supabase may return NUMERIC as string in some configs — coerce.
  const an = typeof a === 'string' && !isNaN(Number(a)) ? Number(a) : a
  const bn = typeof b === 'string' && !isNaN(Number(b)) ? Number(b) : b
  if (typeof an === 'number' && typeof bn === 'number') {
    return Math.round(an * 10000) === Math.round(bn * 10000)
  }
  return a === b
}

function rowsIdentical(
  candidate: Record<string, unknown>,
  existing: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  for (const f of fields) {
    if (!valuesEqual(candidate[f], existing[f])) return false
  }
  return true
}

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const typeHint  = formData.get('type') as ExportType | null
    const dateInput = (formData.get('date') as string | null)?.trim() || null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Only CSV files are accepted' }, { status: 400 })
    }

    // Validate snapshot date (YYYY-MM-DD) — required for automations & gokwik_carts
    const needsDate = typeHint === 'automations' || typeHint === 'gokwik_carts'
    if (needsDate) {
      if (!dateInput) {
        return NextResponse.json({ error: 'A snapshot date is required for automations and GoKwik Carts uploads' }, { status: 400 })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
      }
    }

    const raw      = await file.text()
    const { type, data } = parseExport(raw, typeHint || undefined, dateInput)
    const supabase = createAdminClient()

    let inserted = 0
    let updated  = 0
    let skipped  = 0
    const errors: string[] = []

    type UpsertRow = { name: string } & Record<string, unknown>
    const rows = data as UpsertRow[]

    if (type === 'campaigns') {
      // Campaigns table has NO unique constraint on (name, date) — multiple rows
      // with the same (name, date) but different metric values can coexist.
      // Dedup is purely "is this row byte-identical to ANY existing row with the
      // same (name, date)?". If yes → skip. If no → insert as a new row.
      const selectCols = ['name','date',...CAMPAIGN_COMPARE_FIELDS].join(',')

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const names = [...new Set(batch.map(r => r.name))]
        const dates = [...new Set(batch.map(r => r.date as string).filter(Boolean))]

        // Pre-fetch ALL existing rows for these (name, date) combinations.
        // Multiple rows per key are now possible, so we group by key.
        const { data: existing, error: fErr } = await supabase
          .from('campaigns')
          .select(selectCols)
          .in('name', names)
          .in('date', dates)

        if (fErr) {
          errors.push(`Batch ${i + 1}-${i + batch.length} (lookup): ${fErr.message}`)
          continue
        }

        // key → array of existing variants at this (name, date)
        const existingMap = new Map<string, Record<string, unknown>[]>()
        for (const ex of (existing ?? []) as unknown as Record<string, unknown>[]) {
          const key = `${ex.name}|${ex.date}`
          const arr = existingMap.get(key) ?? []
          arr.push(ex)
          existingMap.set(key, arr)
        }

        const toInsert: UpsertRow[] = []
        let bSkipped = 0

        for (const r of batch) {
          const key = `${r.name}|${r.date}`
          const variants = existingMap.get(key) ?? []
          // Skip only if a byte-identical row already exists at this (name, date).
          // Otherwise insert — even if (name, date) matches an existing row whose
          // values differ, both rows will coexist.
          const isDup = variants.some(v => rowsIdentical(r, v, CAMPAIGN_COMPARE_FIELDS))
          if (isDup) {
            bSkipped++
          } else {
            toInsert.push(r)
            // Track this row as "existing" so the next candidate in the same batch
            // with identical values is treated as a duplicate of THIS one (prevents
            // intra-batch duplicate inserts).
            variants.push(r as Record<string, unknown>)
            existingMap.set(key, variants)
          }
        }

        if (toInsert.length) {
          const { error } = await supabase.from('campaigns').insert(toInsert)
          if (error) {
            errors.push(`Batch ${i + 1}-${i + batch.length}: ${error.message}`)
            continue
          }
        }

        inserted += toInsert.length
        skipped  += bSkipped
      }
    } else {
      // Automations + GoKwik — unique on `name` only
      const selectCols = ['name',...AUTOMATION_COMPARE_FIELDS].join(',')

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const names = [...new Set(batch.map(r => r.name))]

        const { data: existing, error: fErr } = await supabase
          .from('automations')
          .select(selectCols)
          .in('name', names)

        if (fErr) {
          errors.push(`Batch ${i + 1}-${i + batch.length} (lookup): ${fErr.message}`)
          continue
        }

        const existingMap = new Map<string, Record<string, unknown>>()
        for (const ex of (existing ?? []) as unknown as Record<string, unknown>[]) {
          existingMap.set(ex.name as string, ex)
        }

        const toUpsert: UpsertRow[] = []
        let bUpdated = 0
        let bSkipped = 0

        for (const r of batch) {
          const ex = existingMap.get(r.name)
          if (!ex) {
            toUpsert.push(r)
          } else if (rowsIdentical(r, ex, AUTOMATION_COMPARE_FIELDS)) {
            bSkipped++
          } else {
            toUpsert.push(r)
            bUpdated++
          }
        }

        if (toUpsert.length) {
          const { error } = await supabase
            .from('automations')
            .upsert(toUpsert, { onConflict: 'name', ignoreDuplicates: false })
          if (error) {
            errors.push(`Batch ${i + 1}-${i + batch.length}: ${error.message}`)
            continue
          }
        }

        inserted += toUpsert.length - bUpdated
        updated  += bUpdated
        skipped  += bSkipped
      }
    }

    // Log to raw_exports — keep existing columns (inserted/skipped only).
    // "inserted" here is truly-new; "updated" is shown in the API response but not logged.
    await supabase.from('raw_exports').insert({
      filename:    file.name,
      export_type: type,
      row_count:   data.length,
      inserted,
      skipped,
    })

    const result: UploadResult = {
      success: errors.length === 0,
      inserted,
      updated,
      skipped,
      errors: errors.slice(0, 10),   // cap error list
      export_type: type,
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Upload error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
