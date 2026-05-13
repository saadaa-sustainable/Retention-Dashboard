import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { parseExport } from '@/lib/parser'
import type { ExportType, UploadResult } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const typeHint  = formData.get('type') as ExportType | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Only CSV files are accepted' }, { status: 400 })
    }

    const raw      = await file.text()
    const { type, data } = parseExport(raw, typeHint || undefined)
    const supabase = createAdminClient()

    let inserted = 0
    let skipped  = 0
    const errors: string[] = []

    type UpsertRow = { name: string } & Record<string, unknown>

    if (type === 'campaigns') {
      // Upsert — on conflict (name + date) do nothing to avoid overwriting
      for (const row of data as UpsertRow[]) {
        const { error } = await supabase
          .from('campaigns')
          .upsert(row, { onConflict: 'name,date', ignoreDuplicates: true })
        if (error) {
          if (error.code === '23505') skipped++      // duplicate
          else errors.push(`${row.name}: ${error.message}`)
        } else {
          inserted++
        }
      }
    } else {
      // Automations + GoKwik — upsert on name (aggregate level)
      for (const row of data as UpsertRow[]) {
        const { error } = await supabase
          .from('automations')
          .upsert(row, { onConflict: 'name', ignoreDuplicates: false })
        if (error) errors.push(`${row.name}: ${error.message}`)
        else inserted++
      }
    }

    // Log to raw_exports
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
