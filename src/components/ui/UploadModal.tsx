'use client'
import { useState, useRef } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { ExportType, UploadResult } from '@/types'
import { useDashStore } from '@/lib/store'

interface UploadModalProps { onClose: () => void }

// Format spec shown in the "Expected format" panel below the type picker so
// uploaders know exactly which columns the parser looks for and how the file
// should be structured before they drop a file.
interface FormatSpec {
  ext: '.csv' | '.xlsx / .xls'
  required: string[]
  optional?: string[]
  example: string[][]    // header row + sample data row(s)
  notes?: string[]
}

const FORMAT_SPECS: Record<ExportType, FormatSpec> = {
  campaigns: {
    ext: '.csv',
    required: ['Name','Channel','Sent','Delivered','Seen','CTR','Clicks','Buyers','Unsubscribers','Sales','Orders','Source','Date','Cost','ROAS'],
    example: [
      ['Name','Channel','Sent','Delivered','Date','Sales','Source'],
      ['C130_RET_4000<LTV_LOD_Within_540D_USP_IMG_OF-RS_LD','whatsapp','1024','856','2026-05-18','42130','segment - Included Segment\\n4000<LTV_LOD_Within_540D'],
    ],
    notes: [
      'Date format: YYYY-MM-DD (preferred) or DD-MM-YYYY.',
      'Source column can contain multi-line text; the segment is parsed from the line after "Included Segment".',
      'campaign_id, segment, offer, format are auto-parsed from Name.',
    ],
  },
  automations: {
    ext: '.csv',
    required: ['Name','Channel','Sent','Delivered','Seen','CTR','Clicks','Buyers','Sales','Orders','Cost','ROAS'],
    optional: ['Date (per-row)','Unsubscribers','Templates Used'],
    example: [
      ['Date','Name','Channel','Sent','Delivered','Seen','CTR','Clicks','Buyers','Sales','Orders','Cost'],
      ['18-05-2026','Abandoned Cart','whatsapp','779','558','0','1.97%','11','4','4281.25','4','267.38'],
    ],
    notes: [
      'Either include a Date column per row, OR pick a single snapshot date / date range in the field above.',
      'Multiple rows with the same (Name, Date) are kept if their metrics differ; only byte-identical duplicates are skipped.',
    ],
  },
  automation_creatives: {
    ext: '.xlsx / .xls',
    required: ['Automation Name','Template Name','Template Copy','Creative Media Link'],
    example: [
      ['Automation Name','Template Name','Template Copy','Creative Media Link'],
      ['Homepage_Page_New_User_KwikPass','rs_mar_off_hp_t1','Hi {{1}}, here is 15% off…','https://drive.google.com/file/d/1abc…/view'],
      ['','sn_mar_off_hp_v1_t2','Hi {{1}}, exclusive welcome offer…','https://drive.google.com/file/d/1xyz…/view'],
    ],
    notes: [
      'Automation Name in row 2+ may be blank — it forward-fills from the most recent non-blank value (like merged cells).',
      'Creative Media Link can be a Drive file URL or a Drive folder URL.',
      'Automation Name must match the Name column of an uploaded automation CSV (case-insensitive) for the drawer to find it.',
    ],
  },
  campaign_creatives: {
    ext: '.xlsx / .xls',
    required: ['Campaign ID','Channel','Template Name','Template Copy','Creative Media Link'],
    example: [
      ['Campaign ID','Channel','Template Name','Template Copy','Creative Media Link'],
      ['C123','WhatsApp','confirmation_order_v22','Hi {{1}}, your order is confirmed…','https://drive.google.com/drive/folders/17EJg…'],
      ['','WhatsApp','order_confirm_ship_v1','Hi {{1}}, your order is on its way…','https://drive.google.com/drive/folders/17EJg…'],
    ],
    notes: [
      'Campaign ID & Channel in row 2+ may be blank — they forward-fill from the most recent non-blank value.',
      'Campaign ID must match the campaign_id parsed from a campaign Name (e.g. C123).',
    ],
  },
  // Legacy — UI no longer exposes this option, but the backend route still accepts it.
  gokwik_carts: {
    ext: '.csv',
    required: ['Name','Channel','Sent','Delivered','Recovered Amount','Recovered Carts','Cost'],
    example: [['Name','Channel','Sent','Delivered','Recovered Amount','Recovered Carts'],['Cart Recovery','whatsapp','450','312','85420','22']],
    notes: ['Deprecated — upload as Automations instead.'],
  },
}

// Build a CSV blob (RFC 4180 quoting) from a 2-D array.
function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}
function aoaToCsvBlob(aoa: string[][]): Blob {
  const lines = aoa.map(row => row.map(csvEscape).join(','))
  return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
}
function aoaToXlsxBlob(aoa: string[][]): Blob {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Template download — gives the user a real file with the header row + a sample
// data row so they can fill in their own data without guessing column names.
function downloadTemplate(type: ExportType, spec: FormatSpec) {
  // For the actual template we want ALL required columns as headers + the
  // example sample row(s). We extend the example's first row to include any
  // required columns the example didn't list, so the user gets the full
  // header surface area.
  const headerSet = new Set<string>([...spec.example[0], ...spec.required])
  const headers = [...headerSet]
  const headerIdx = (col: string) => spec.example[0].indexOf(col)
  const sampleRows = spec.example.slice(1).map(row => {
    return headers.map(h => {
      const idx = headerIdx(h)
      return idx >= 0 ? (row[idx] ?? '') : ''
    })
  })
  const aoa = [headers, ...sampleRows]

  const isXlsx = spec.ext.includes('xlsx')
  const filename = `template_${type}.${isXlsx ? 'xlsx' : 'csv'}`
  const blob = isXlsx ? aoaToXlsxBlob(aoa) : aoaToCsvBlob(aoa)
  triggerDownload(blob, filename)
}

function FormatPanel({ type }: { type: ExportType }) {
  const [open, setOpen] = useState(false)
  const spec = FORMAT_SPECS[type]
  if (!spec) return null
  return (
    <div className="mb-4 border border-black/[0.08] rounded-lg overflow-hidden bg-gray-50/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100/60 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 text-[12px] text-gray-700 text-left"
        >
          {open ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
          <FileText size={13} className="text-gray-400" />
          <span className="font-medium">Expected format</span>
          <span className="text-gray-400 font-mono text-[11px]">{spec.ext}</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); downloadTemplate(type, spec) }}
          title="Download a sample file with the right column headers"
          className="flex items-center gap-1 text-[11px] px-2 h-7 rounded-md border border-black/[0.1] bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
        >
          <Download size={12} /> Template
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Required columns</p>
            <div className="flex flex-wrap gap-1">
              {spec.required.map(c => (
                <code key={c} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{c}</code>
              ))}
            </div>
          </div>
          {spec.optional && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Optional columns</p>
              <div className="flex flex-wrap gap-1">
                {spec.optional.map(c => (
                  <code key={c} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{c}</code>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Example</p>
            <div className="overflow-x-auto rounded border border-black/[0.08] bg-white">
              <table className="w-full text-[10.5px] font-mono">
                <thead className="bg-gray-50">
                  <tr>{spec.example[0].map(h => <th key={h} className="px-2 py-1 text-left text-gray-600 font-medium whitespace-nowrap border-b border-black/[0.06]">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {spec.example.slice(1).map((row, i) => (
                    <tr key={i} className={i % 2 ? 'bg-gray-50/40' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[180px] truncate" title={cell}>{cell || <span className="text-gray-300">(blank)</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {spec.notes && (
            <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
              {spec.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const [file, setFile]       = useState<File | null>(null)
  const [type, setType]       = useState<ExportType>('campaigns')
  const [snapshotDate, setSnapshotDate] = useState('')
  const [snapshotDateFrom, setSnapshotDateFrom] = useState('')
  const [snapshotDateTo, setSnapshotDateTo] = useState('')
  const [status, setStatus]   = useState<'idle'|'uploading'|'done'|'error'>('idle')
  const [result, setResult]   = useState<UploadResult | null>(null)
  const [errMsg, setErrMsg]   = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)
  const { fetchCampaigns, fetchAutomations } = useDashStore()

  const isAutoCreatives = type === 'automation_creatives'
  const isCampCreatives = type === 'campaign_creatives'
  const isCreatives = isAutoCreatives || isCampCreatives
  const needsDate = type === 'automations'
  const hasRange = Boolean(snapshotDateFrom || snapshotDateTo)
  const dateValid = !needsDate || (
    /^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) ||
    (snapshotDateFrom && snapshotDateTo && /^\d{4}-\d{2}-\d{2}$/.test(snapshotDateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(snapshotDateTo))
  )

  const handleFile = (f: File) => {
    setFile(f)
    // Auto-detect type from filename + extension
    const n = f.name.toLowerCase()
    const isXl = n.endsWith('.xlsx') || n.endsWith('.xls')
    if (isXl && n.includes('campaign')) setType('campaign_creatives')
    else if (isXl || n.includes('creative')) setType('automation_creatives')
    else if (n.includes('auto') || n.includes('gokwik') || n.includes('carts')) setType('automations')
    else                                              setType('campaigns')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    if (needsDate && !dateValid) {
      setErrMsg('Please pick the date this snapshot belongs to')
      setStatus('error')
      return
    }
    setStatus('uploading')
    try {
      const fd = new FormData()
      fd.append('file', file)
      let endpoint = '/api/upload'
      if (isAutoCreatives) {
        endpoint = '/api/automation-creatives'
      } else if (isCampCreatives) {
        endpoint = '/api/campaign-creatives'
      } else {
        fd.append('type', type)
        if (needsDate) {
          if (snapshotDateFrom && snapshotDateTo) {
            fd.append('date_from', snapshotDateFrom)
            fd.append('date_to', snapshotDateTo)
          } else {
            fd.append('date', snapshotDate)
          }
        }
      }
      const res  = await fetch(endpoint, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setResult(json)
      setStatus('done')
      // Refresh data
      if (type === 'campaigns') fetchCampaigns()
      else if (!isCreatives) fetchAutomations()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-[480px] max-w-[95vw] p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-semibold text-gray-900">Upload Export</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Export type picker */}
        <div className="mb-4">
          <label className="text-[12px] font-medium text-gray-600 mb-1.5 block">Export type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['campaigns','automations','automation_creatives','campaign_creatives'] as ExportType[]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 px-3 text-[12px] rounded-lg border transition-colors ${
                  type === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-black/10 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'campaigns' ? 'Campaigns'
                  : t === 'automations' ? 'Automations'
                  : t === 'automation_creatives' ? 'Auto Creatives'
                  : 'Camp Creatives'}
              </button>
            ))}
          </div>
        </div>

        {/* Format guide — collapsible reference for the chosen export type. */}
        {(status === 'idle' || status === 'error') && <FormatPanel type={type} />}

        {/* Snapshot date/range — only for automations (campaigns derive date per-row from the CSV) */}
        {needsDate && (status === 'idle' || status === 'error') && (
          <div className="mb-4">
            <label className="text-[12px] font-medium text-gray-600 mb-1.5 block">
              Snapshot date or range <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="snapshot-date-from"
                type="date"
                value={snapshotDateFrom || snapshotDate}
                onChange={e => { setSnapshotDateFrom(e.target.value); setSnapshotDate('') }}
                max={new Date().toISOString().slice(0,10)}
                className={`w-full px-3 py-2 text-[13px] rounded-lg border bg-white focus:outline-none transition-colors ${
                  snapshotDateFrom && !dateValid
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-black/10 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                }`}
              />
              <input
                id="snapshot-date-to"
                type="date"
                value={snapshotDateTo}
                onChange={e => { setSnapshotDateTo(e.target.value); setSnapshotDate('') }}
                max={new Date().toISOString().slice(0,10)}
                className={`w-full px-3 py-2 text-[13px] rounded-lg border bg-white focus:outline-none transition-colors ${
                  snapshotDateTo && !dateValid
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-black/10 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                }`}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Provide either a single snapshot date, or a from+to date range. If rows contain their own dates, those will be used instead.
            </p>
          </div>
        )}

        {/* Drop zone */}
        {status === 'idle' || status === 'error' ? (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-black/10 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={24} className="mx-auto mb-2 text-gray-400" />
            {file ? (
              <p className="text-[13px] font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-[13px] font-medium text-gray-700">
                  {isCreatives ? 'Drop .xlsx here or click to browse' : 'Drop CSV here or click to browse'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {isAutoCreatives
                    ? 'Excel: Automation Name, Template Name, Template Copy, Creative Media Link'
                    : isCampCreatives
                    ? 'Excel: Campaign ID, Channel, Template Name, Template Copy, Creative Media Link'
                    : 'Accepts KwikEngage / Tellephant export files'}
                </p>
              </>
            )}
            <input ref={inputRef} type="file" accept={isCreatives ? '.xlsx,.xls' : '.csv'} className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : status === 'uploading' ? (
          <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center">
            <Loader2 size={24} className="mx-auto mb-2 text-blue-500 animate-spin" />
            <p className="text-[13px] text-gray-600">Uploading and ingesting…</p>
          </div>
        ) : status === 'done' && result ? (
          <div className="border-2 border-green-200 bg-green-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-green-600" />
              <p className="text-[13px] font-semibold text-green-800">Upload successful</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                ['Inserted', result.inserted,        'New rows'],
                ['Updated',  result.updated ?? 0,    'Values changed'],
                ['Skipped',  result.skipped,         'Identical rows'],
                ['Errors',   result.errors.length,   ''],
              ].map(([l, v, title]) => (
                <div key={l as string} className="bg-white rounded-lg p-1.5 text-center" title={title as string}>
                  <p className="text-[10px] text-gray-500">{l}</p>
                  <p className="text-[15px] font-semibold text-gray-800 tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 bg-red-50 rounded-lg p-3">
                <p className="text-[11px] font-medium text-red-700 mb-1">Errors (first 10):</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-600">{e}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-red-200 bg-red-50 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-[13px] text-red-700">{errMsg}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          {status === 'done' ? (
            <button onClick={onClose} className="px-4 py-2 text-[13px] bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || status === 'uploading' || (needsDate && !dateValid)}
                className="px-4 py-2 text-[13px] bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload & Ingest
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
