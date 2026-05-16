'use client'
import { useState, useRef } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { ExportType, UploadResult } from '@/types'
import { useDashStore } from '@/lib/store'

interface UploadModalProps { onClose: () => void }

export default function UploadModal({ onClose }: UploadModalProps) {
  const [file, setFile]       = useState<File | null>(null)
  const [type, setType]       = useState<ExportType>('campaigns')
  const [snapshotDate, setSnapshotDate] = useState('')
  const [status, setStatus]   = useState<'idle'|'uploading'|'done'|'error'>('idle')
  const [result, setResult]   = useState<UploadResult | null>(null)
  const [errMsg, setErrMsg]   = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)
  const { fetchCampaigns, fetchAutomations } = useDashStore()

  const needsDate = type === 'automations' || type === 'gokwik_carts'
  const dateValid = !needsDate || /^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)

  const handleFile = (f: File) => {
    setFile(f)
    // Auto-detect type from filename
    const n = f.name.toLowerCase()
    if (n.includes('gokwik') || n.includes('carts')) setType('gokwik_carts')
    else if (n.includes('auto'))                      setType('automations')
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
      fd.append('type', type)
      if (needsDate) fd.append('date', snapshotDate)
      const res  = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setResult(json)
      setStatus('done')
      // Refresh data
      if (type === 'campaigns') fetchCampaigns()
      else fetchAutomations()
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
          <h2 className="text-[15px] font-semibold text-gray-900">Upload CSV Export</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Export type picker */}
        <div className="mb-4">
          <label className="text-[12px] font-medium text-gray-600 mb-1.5 block">Export type</label>
          <div className="grid grid-cols-3 gap-2">
            {(['campaigns','automations','gokwik_carts'] as ExportType[]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 px-3 text-[12px] rounded-lg border transition-colors ${
                  type === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-black/10 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'campaigns' ? 'Campaigns' : t === 'automations' ? 'Automations' : 'GoKwik Carts'}
              </button>
            ))}
          </div>
        </div>

        {/* Snapshot date — only for automations & gokwik (campaigns derive date per-row from the CSV) */}
        {needsDate && (status === 'idle' || status === 'error') && (
          <div className="mb-4">
            <label htmlFor="snapshot-date" className="text-[12px] font-medium text-gray-600 mb-1.5 block">
              Snapshot date <span className="text-red-500">*</span>
            </label>
            <input
              id="snapshot-date"
              type="date"
              value={snapshotDate}
              onChange={e => setSnapshotDate(e.target.value)}
              max={new Date().toISOString().slice(0,10)}
              className={`w-full px-3 py-2 text-[13px] rounded-lg border bg-white focus:outline-none transition-colors ${
                snapshotDate && !dateValid
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-black/10 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
              }`}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              The date this data belongs to. Re-uploading the same automation with a new date will overwrite its current snapshot.
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
                <p className="text-[13px] font-medium text-gray-700">Drop CSV here or click to browse</p>
                <p className="text-[11px] text-gray-400 mt-1">Accepts KwikEngage / Tellephant export files</p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".csv" className="hidden"
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
