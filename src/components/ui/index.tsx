'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Info, RefreshCw, TrendingUp } from 'lucide-react'

// ── Badge ──────────────────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'red' | 'neutral' | 'blue' | 'amber'

const BADGE_CLS: Record<BadgeVariant, string> = {
  green:   'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  red:     'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-600/15',
  neutral: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-500/10',
  blue:    'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/15',
  amber:   'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
}

export function Badge({ children, variant = 'neutral' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-block text-[10.5px] font-medium px-2 py-0.5 rounded-full tabular-nums ${BADGE_CLS[variant]}`}>
      {children}
    </span>
  )
}

export function RoasBadge({ roas }: { roas: number | null }) {
  if (!roas || roas === 0) return <Badge variant="neutral">—</Badge>
  const variant = roas >= 10 ? 'green' : roas >= 3 ? 'blue' : 'red'
  return <Badge variant={variant}>{roas.toFixed(2)}x</Badge>
}

export function DrBadge({ dr }: { dr: number }) {
  const variant = dr >= 85 ? 'green' : dr >= 70 ? 'blue' : 'red'
  return <Badge variant={variant}>{dr.toFixed(1)}%</Badge>
}

// ── Metric card ────────────────────────────────────────────────────────────
export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="group relative bg-white border border-black/[0.06] rounded-xl px-3.5 py-3 hover:border-black/[0.12] hover:shadow-sm transition-all">
      <p className="text-[10.5px] uppercase tracking-wider text-gray-400 font-medium mb-1">{label}</p>
      <p className="text-[16px] font-semibold text-gray-900 tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────
interface KpiProps {
  icon: React.ReactNode
  label: string
  value: string
  smartRetry?: { delta: string; pct: string }
}

// Cycle through tonal accents based on label hash for visual variety while staying restrained.
const ACCENTS = [
  { bg: 'bg-blue-50',    fg: 'text-blue-600',    ring: 'ring-blue-500/15' },
  { bg: 'bg-emerald-50', fg: 'text-emerald-600', ring: 'ring-emerald-500/15' },
  { bg: 'bg-amber-50',   fg: 'text-amber-600',   ring: 'ring-amber-500/15' },
  { bg: 'bg-violet-50',  fg: 'text-violet-600',  ring: 'ring-violet-500/15' },
  { bg: 'bg-rose-50',    fg: 'text-rose-600',    ring: 'ring-rose-500/15' },
  { bg: 'bg-sky-50',     fg: 'text-sky-600',     ring: 'ring-sky-500/15' },
]
const hashIdx = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % ACCENTS.length
}

export function KpiCard({ icon, label, value, smartRetry }: KpiProps) {
  const a = ACCENTS[hashIdx(label)]
  return (
    <div className="group relative bg-white border border-black/[0.06] rounded-2xl p-4 flex flex-col gap-3 shadow-[0_1px_2px_rgba(15,17,21,0.04)] hover:shadow-[0_8px_24px_rgba(15,17,21,0.06)] hover:-translate-y-px transition-all duration-200">
      <div className="flex justify-between items-start">
        <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ring-1 ring-inset ${a.bg} ${a.fg} ${a.ring}`}>
          {icon}
        </span>
        <Info size={13} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div>
        <p className="text-[11.5px] text-gray-500 mb-0.5 font-medium">{label}</p>
        <p className="text-[22px] font-semibold text-gray-900 leading-tight tabular-nums tracking-tight">{value}</p>
      </div>
      {smartRetry ? (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium ring-1 ring-inset ring-emerald-600/15">
            <RefreshCw size={9} /> Smart Retry
          </span>
          <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600 font-medium tabular-nums">
            <TrendingUp size={10} />{smartRetry.delta}
            <span className="text-emerald-500/80">({smartRetry.pct})</span>
          </span>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────
export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-black/[0.06] rounded-2xl shadow-[0_1px_2px_rgba(15,17,21,0.04)] overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

export function PanelBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[12.5px] font-semibold text-gray-800 mb-3 flex items-center gap-2">
      <span className="h-1 w-1 rounded-full bg-blue-500" />
      {children}
    </h3>
  )
}

// ── Definitions panel ──────────────────────────────────────────────────────
export interface DefItem { term: string; formula: string; desc: string }

export function DefinitionsPanel({ items }: { items: DefItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 bg-white border border-black/[0.06] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,17,21,0.04)]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50/70 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Info size={14} className="text-gray-400" /> Metric definitions &amp; formulas
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="p-4 border-t border-black/[0.06] bg-gray-50/30">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
            {items.map(d => (
              <div key={d.term} className="bg-white rounded-xl p-3 border border-black/[0.05]">
                <p className="text-[12px] font-semibold text-gray-900 mb-1">{d.term}</p>
                <code className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono inline-block mb-2 ring-1 ring-inset ring-blue-600/10">
                  {d.formula}
                </code>
                <p className="text-[11px] text-gray-500 leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Funnel row ─────────────────────────────────────────────────────────────
const FUNNEL_COLORS = ['#378ADD','#1D9E75','#BA7517','#D85A30','#7F77DD','#634FA0']

export function FunnelRow({ label, value, pct, colorIdx }: {
  label: string; value: number; pct: number; colorIdx: number
}) {
  const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(Math.round(n))
  const color = FUNNEL_COLORS[colorIdx] || '#888'
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-gray-500 min-w-[70px] font-medium">{label}</span>
        <div className="flex-1 h-6 bg-gray-100/70 rounded-md overflow-hidden ring-1 ring-inset ring-black/[0.03]">
          <div
            className="h-full flex items-center pl-2.5 rounded-md transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(pct, 3)}%`, background: `linear-gradient(90deg, ${color}, ${color}dd)`, minWidth: '60px' }}
          >
            <span className="text-[10px] text-white font-semibold whitespace-nowrap tabular-nums drop-shadow-sm">{fmt(value)}</span>
          </div>
        </div>
        <span className="text-[11px] font-semibold min-w-[42px] text-right tabular-nums" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

// ── Table helpers ──────────────────────────────────────────────────────────
export function Th({
  children, onClick, sortDir, right = true
}: { children: React.ReactNode; onClick?: () => void; sortDir?: 'asc'|'desc'|null; right?: boolean }) {
  const sorted = sortDir != null
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider border-b border-black/[0.06] whitespace-nowrap
        ${sorted ? 'text-gray-900' : 'text-gray-500'}
        ${right ? 'text-right' : 'text-left'} ${onClick ? 'cursor-pointer hover:text-gray-900 hover:bg-gray-100/60 select-none transition-colors' : ''}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {sortDir === 'desc' ? <ChevronDown size={11} className="text-blue-500" /> : sortDir === 'asc' ? <ChevronUp size={11} className="text-blue-500" /> : null}
      </span>
    </th>
  )
}

export function Td({ children, right = true, className = '', title }: {
  children: React.ReactNode; right?: boolean; className?: string
  title?: string
}) {
  return (
    <td title={title} className={`px-3 py-2.5 text-[12px] border-b border-black/[0.04] tabular-nums text-gray-700 ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  )
}
