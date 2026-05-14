'use client'
import { useState, useEffect, useMemo } from 'react'
import { useDashStore } from '@/lib/store'
import { computeKpis, computeFunnel, computeSegments, computeOffers, computeDaily, fmtCurrency, fmtNumber, fmtPct, safeDivide, deliveryRate, openRate, revenuePerDel, sumKey } from '@/lib/metrics'
import { DEFS } from '@/lib/definitions'
import Sidebar, { type TabId } from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import UploadModal from '@/components/ui/UploadModal'
import { KpiCard, MetricCard, Panel, PanelBody, PanelTitle, DefinitionsPanel, FunnelRow, Badge, RoasBadge, DrBadge, Th, Td } from '@/components/ui'
import { ShoppingCart, Tag, ShoppingBag, MessageCircle, Play, UserPlus, Search } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'

const COLORS = ['#378ADD','#1D9E75','#BA7517','#D85A30','#7F77DD','#0F6E56','#993556','#634FA0']
const fmt = fmtNumber
const cur = fmtCurrency
const safe = safeDivide

function useSort<T>(data: T[], defaultCol: keyof T, defaultDir: 'asc'|'desc' = 'desc') {
  const [sort, setSort] = useState<{col: keyof T; dir: 'asc'|'desc'}>({col:defaultCol, dir:defaultDir})
  const sorted = useMemo(()=>[...data].sort((a,b)=>{
    const av=(a[sort.col] as number|string|null)??-Infinity, bv=(b[sort.col] as number|string|null)??-Infinity
    return sort.dir==='desc'?(bv>av?1:-1):(av>bv?1:-1)
  }),[data,sort])
  const toggle=(col: keyof T)=>setSort(s=>({col,dir:s.col===col&&s.dir==='desc'?'asc':'desc'}))
  const dir=(col: keyof T):'asc'|'desc'|null=>sort.col===col?sort.dir:null
  return {sorted,toggle,dir}
}

function pageWindow(cur:number,total:number):(number|'…')[]{
  if(total<=7) return Array.from({length:total},(_,i)=>i)
  const last=total-1, out:(number|'…')[]=[0]
  const l=Math.max(1,cur-1), r=Math.min(last-1,cur+1)
  if(l>1) out.push('…')
  for(let i=l;i<=r;i++) out.push(i)
  if(r<last-1) out.push('…')
  out.push(last)
  return out
}

const SEGMENT_CATEGORIES = [
  '0<LTV<1000','1000<LTV<2000','2000<LTV<3000','3000<LTV<4000','4000<LTV',
  'ATC','ABC','CNB','DNC','RNC','failed','Other',
] as const
type SegmentCategory = typeof SEGMENT_CATEGORIES[number]

// Order matters: longer / more specific tokens before their prefixes
// (e.g. 1000<LTV<2000 before 0<LTV<1000 so substring search in `name` picks the right one).
const CATEGORY_TOKENS: readonly [string, SegmentCategory][] = [
  ['1000<LTV<2000','1000<LTV<2000'],
  ['2000<LTV<3000','2000<LTV<3000'],
  ['3000<LTV<4000','3000<LTV<4000'],
  ['0<LTV<1000','0<LTV<1000'],
  ['4000<LTV','4000<LTV'],
  ['ATC','ATC'],
  ['ABC','ABC'],
  ['CNB','CNB'],
  ['DNC','DNC'],
  ['RNC','RNC'],
  ['failed','failed'],
]

// Top-level grouping for campaign cards:
//   - C-numeric IDs (C101, C132, …)  → kept as individual cards
//   - Anything starting with HR       → clubbed as "HR"
//   - Anything starting with HT       → clubbed as "HT"
//   - Everything else (MKT, MP, sage, TEST, WA, …) → "Others"
function groupKey(id:string):string{
  if(!id) return 'Others'
  const up=id.toUpperCase()
  if(/^C\d/.test(up)) return id
  if(up.startsWith('HR')) return 'HR'
  if(up.startsWith('HT')) return 'HT'
  return 'Others'
}

function categorize(segment:string, name?:string):SegmentCategory{
  const s=(segment||'').trim()
  // 1) Cleanest signal: the segment field itself starts with a known token
  for(const [token,cat] of CATEGORY_TOKENS){
    if(s.startsWith(token)) return cat
  }
  // 2) Fallback: scan the full campaign name for the earliest token occurrence
  //    (handles rows where the segment field is missing or doesn't start with the token)
  if(name){
    const n=name.trim()
    let best:{pos:number,cat:SegmentCategory}|null=null
    for(const [token,cat] of CATEGORY_TOKENS){
      const pos=n.indexOf(token)
      if(pos>=0 && (!best || pos<best.pos)) best={pos,cat}
    }
    if(best) return best.cat
  }
  return 'Other'
}

function OverviewTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const kpi=computeKpis(campaigns)
  const funnel=computeFunnel(campaigns)
  const top6=[...campaigns].sort((a,b)=>b.sales-a.sales).slice(0,6)
  const td=sumKey(campaigns,'delivered'), ts=sumKey(campaigns,'sent'), tse=sumKey(campaigns,'seen')
  const avgDR=safe(td,ts)*100, avgOR=safe(tse,td)*100
  const ctrArr=campaigns.filter(r=>r.ctr&&r.ctr>0)
  const avgCTR=ctrArr.length?sumKey(ctrArr,'ctr')/ctrArr.length:0
  const roasArr=campaigns.filter(r=>r.roas&&r.roas>0)
  const avgROAS=roasArr.length?sumKey(roasArr,'roas')/roasArr.length:0
  const tcost=sumKey(campaigns,'cost'), tsal=sumKey(campaigns,'sales')
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-5">
        <KpiCard icon={<ShoppingCart size={18}/>} label="Total Orders"    value={fmt(kpi.total_orders)}/>
        <KpiCard icon={<Tag size={18}/>}          label="Total Sales"     value={cur(kpi.total_sales)}/>
        <KpiCard icon={<ShoppingBag size={18}/>}  label="Total Buyers"    value={fmt(kpi.total_buyers)}/>
        <KpiCard icon={<MessageCircle size={18}/>} label="Messages Sent"  value={fmt(kpi.total_sent)}/>
        <KpiCard icon={<Play size={18}/>}          label="Msg Delivered"  value={fmt(kpi.total_delivered)}/>
        <KpiCard icon={<UserPlus size={18}/>}      label="New Customers"  value={fmt(kpi.new_customers)}/>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-4">
        <Panel><PanelBody>
          <PanelTitle>Top campaigns by sales</PanelTitle>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top6.map(r=>({name:r.segment.length>18?r.segment.slice(0,18)+'…':r.segment,sales:r.sales}))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:9}} angle={-35} textAnchor="end" height={55}/>
              <YAxis tick={{fontSize:9}} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip formatter={(v)=>['₹'+new Intl.NumberFormat('en-IN').format(Math.round(Number(v)||0)),'Sales']} contentStyle={{fontSize:11}}/>
              <Bar dataKey="sales" radius={[3,3,0,0]}>{top6.map((_,i)=><Cell key={i} fill={i<3?'#378ADD':'#B5D4F4'}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>Messaging funnel</PanelTitle>
          <div className="mt-1">
            <FunnelRow label="Sent"      value={funnel.sent}      pct={100}                                colorIdx={0}/>
            <FunnelRow label="Delivered" value={funnel.delivered} pct={funnel.delivery_rate}               colorIdx={1}/>
            <FunnelRow label="Seen"      value={funnel.seen}      pct={safe(funnel.seen,funnel.sent)*100}  colorIdx={2}/>
            <FunnelRow label="Clicks"    value={funnel.clicks}    pct={funnel.click_rate}                  colorIdx={3}/>
            <FunnelRow label="Buyers"    value={funnel.buyers}    pct={funnel.buyer_rate}                  colorIdx={4}/>
          </div>
        </PanelBody></Panel>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 mb-4">
        {[['Avg Delivery Rate',avgDR.toFixed(1)+'%'],['Avg Open Rate',avgOR.toFixed(1)+'%'],['Avg CTR',avgCTR.toFixed(2)+'%'],['Total Cost',cur(tcost)],['Avg ROAS',avgROAS.toFixed(2)+'x'],['Total Unsubs',fmt(sumKey(campaigns,'unsubscribers'))],['Rev/Delivered','₹'+safe(tsal,td).toFixed(2)],['Buyers/Sent',safe(kpi.total_buyers,kpi.total_sent).toFixed(4)+'%']].map(([l,v])=><MetricCard key={l} label={l} value={v}/>)}
      </div>
      <DefinitionsPanel items={DEFS.overview}/>
    </div>
  )
}

function CampaignsTab(){
  const [activeId,setActiveId]=useState<string|null>(null)
  const [activeCat,setActiveCat]=useState<SegmentCategory|null>(null)
  if(activeId && activeCat) return <CategoryDetailView campaignId={activeId} category={activeCat} onBack={()=>setActiveCat(null)} onBackToCampaigns={()=>{setActiveCat(null);setActiveId(null)}}/>
  if(activeId) return <CampaignCategoriesView campaignId={activeId} onBack={()=>setActiveId(null)} onOpenCategory={setActiveCat}/>
  return <CampaignsCardsView onOpen={setActiveId}/>
}

type CampaignCard = {
  campaign_id: string
  sent: number; delivered: number; seen: number; clicks: number
  buyers: number; sales: number; orders: number; cost: number
  send_count: number; segment_count: number; member_count: number; last_date: string
  delivery_rate: number; open_rate: number; roas: number
}

function CampaignsCardsView({onOpen}:{onOpen:(id:string)=>void}){
  const campaigns=useDashStore(s=>s.campaigns)
  const [search,setSearch]=useState('')
  const [sortBy,setSortBy]=useState<'sales'|'sent'|'roas'|'campaign_id'>('sales')

  const cards=useMemo<CampaignCard[]>(()=>{
    const map=new Map<string,CampaignCard&{segments:Set<string>,members:Set<string>}>()
    for(const r of campaigns){
      if(!r.campaign_id) continue
      const key=groupKey(r.campaign_id)
      let m=map.get(key)
      if(!m){
        m={campaign_id:key,sent:0,delivered:0,seen:0,clicks:0,buyers:0,sales:0,orders:0,cost:0,send_count:0,segment_count:0,member_count:0,last_date:'',delivery_rate:0,open_rate:0,roas:0,segments:new Set(),members:new Set()}
        map.set(key,m)
      }
      m.sent+=r.sent||0; m.delivered+=r.delivered||0; m.seen+=r.seen||0; m.clicks+=r.clicks||0
      m.buyers+=r.buyers||0; m.sales+=r.sales||0; m.orders+=r.orders||0; m.cost+=r.cost||0
      m.send_count++
      m.members.add(r.campaign_id)
      if(r.segment) m.segments.add(r.segment)
      if(r.date && r.date>m.last_date) m.last_date=r.date
    }
    return [...map.values()].map(m=>({
      ...m,
      segment_count: m.segments.size,
      member_count:  m.members.size,
      delivery_rate: safe(m.delivered,m.sent)*100,
      open_rate:     safe(m.seen,m.delivered)*100,
      roas:          safe(m.sales,m.cost),
    }))
  },[campaigns])

  const filtered=useMemo(()=>{
    if(!search) return cards
    return cards.filter(c=>c.campaign_id.toLowerCase().includes(search))
  },[cards,search])

  const sorted=useMemo(()=>[...filtered].sort((a,b)=>{
    if(sortBy==='campaign_id') return a.campaign_id.localeCompare(b.campaign_id)
    return (b[sortBy] as number) - (a[sortBy] as number)
  }),[filtered,sortBy])

  return(
    <div className="fade-in">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[12px] text-gray-500"><span className="font-semibold text-gray-800 tabular-nums">{filtered.length}</span> campaigns · Aggregated by campaign ID</p>
        <div className="flex items-center gap-2">
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)} className="h-8 text-[12px] px-2.5 rounded-lg border border-black/[0.08] bg-white text-gray-700 cursor-pointer hover:border-gray-300 focus:outline-none focus:border-blue-400">
            <option value="sales">Sort: Sales</option>
            <option value="sent">Sort: Sent</option>
            <option value="roas">Sort: ROAS</option>
            <option value="campaign_id">Sort: Campaign ID</option>
          </select>
          <div className="flex items-center gap-1.5 border border-black/[0.08] rounded-lg px-2.5 h-8 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-colors">
            <Search size={13} className="text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value.toLowerCase())} placeholder="Search campaign ID…" className="border-none bg-transparent text-[12px] outline-none w-44 text-gray-700 placeholder:text-gray-400"/>
          </div>
        </div>
      </div>

      {sorted.length===0 ? (
        <div className="bg-white rounded-xl border border-black/[0.06] py-16 text-center text-[13px] text-gray-400">No campaigns match your search.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.map(c=>(
            <button key={c.campaign_id}
              onClick={()=>onOpen(c.campaign_id)}
              className="text-left bg-white rounded-xl border border-black/[0.06] hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all p-4 group">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-gray-900">{c.campaign_id}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                    {c.member_count>1 ? <>{c.member_count} campaigns · </> : null}
                    {c.segment_count} segment{c.segment_count===1?'':'s'} · {c.send_count} send{c.send_count===1?'':'s'}
                  </p>
                </div>
                <span className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all text-[14px]">→</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Sent</p>
                  <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(c.sent)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Delivered</p>
                  <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{c.delivery_rate>0?c.delivery_rate.toFixed(1)+'%':'—'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Sales</p>
                  <p className={`text-[13px] font-semibold tabular-nums ${c.sales>0?'text-green-700':'text-gray-400'}`}>{c.sales>0?cur(c.sales):'—'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">ROAS</p>
                  <div className="mt-0.5"><RoasBadge roas={c.roas||null}/></div>
                </div>
              </div>
              {c.last_date && <p className="text-[10px] text-gray-400 mt-3 pt-2.5 border-t border-black/[0.04]">Last sent · <span className="tabular-nums text-gray-500">{c.last_date}</span></p>}
            </button>
          ))}
        </div>
      )}

      <DefinitionsPanel items={DEFS.campaigns}/>
    </div>
  )
}

type CategoryCard = {
  category: SegmentCategory
  sent: number; delivered: number; seen: number; clicks: number
  buyers: number; sales: number; orders: number; cost: number
  row_count: number; segment_count: number
  delivery_rate: number; open_rate: number; roas: number
}

function CampaignCategoriesView({campaignId,onBack,onOpenCategory}:{campaignId:string,onBack:()=>void,onOpenCategory:(c:SegmentCategory)=>void}){
  const campaigns=useDashStore(s=>s.campaigns)
  const scoped=useMemo(()=>campaigns.filter(c=>groupKey(c.campaign_id)===campaignId),[campaigns,campaignId])

  const totals=useMemo(()=>{
    const t={sent:0,delivered:0,buyers:0,orders:0,sales:0,cost:0}
    for(const r of scoped){
      t.sent+=r.sent||0; t.delivered+=r.delivered||0
      t.buyers+=r.buyers||0; t.orders+=r.orders||0
      t.sales+=r.sales||0; t.cost+=r.cost||0
    }
    return {...t, delivery_rate: safe(t.delivered,t.sent)*100, roas: safe(t.sales,t.cost)}
  },[scoped])

  const cards=useMemo<CategoryCard[]>(()=>{
    const map=new Map<SegmentCategory,CategoryCard&{segments:Set<string>}>()
    for(const r of scoped){
      const cat=categorize(r.segment,r.name)
      let m=map.get(cat)
      if(!m){
        m={category:cat,sent:0,delivered:0,seen:0,clicks:0,buyers:0,sales:0,orders:0,cost:0,row_count:0,segment_count:0,delivery_rate:0,open_rate:0,roas:0,segments:new Set()}
        map.set(cat,m)
      }
      m.sent+=r.sent||0; m.delivered+=r.delivered||0; m.seen+=r.seen||0; m.clicks+=r.clicks||0
      m.buyers+=r.buyers||0; m.sales+=r.sales||0; m.orders+=r.orders||0; m.cost+=r.cost||0
      m.row_count++
      if(r.segment) m.segments.add(r.segment)
    }
    return SEGMENT_CATEGORIES
      .map(c=>map.get(c))
      .filter((m):m is CategoryCard&{segments:Set<string>}=>!!m)
      .map(m=>({
        ...m,
        segment_count: m.segments.size,
        delivery_rate: safe(m.delivered,m.sent)*100,
        open_rate:     safe(m.seen,m.delivered)*100,
        roas:          safe(m.sales,m.cost),
      }))
  },[scoped])

  return(
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-900 h-8 px-3 rounded-lg border border-black/[0.08] bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors">
          <span className="text-[14px] leading-none">←</span> Back to campaigns
        </button>
        <div>
          <p className="text-[16px] font-semibold text-gray-900 leading-tight">{campaignId}</p>
          <p className="text-[11px] text-gray-500">{cards.length} categor{cards.length===1?'y':'ies'} · {scoped.length} send{scoped.length===1?'':'s'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {([
          ['Sent',fmt(totals.sent)],
          ['Delivered',totals.delivery_rate>0?totals.delivery_rate.toFixed(1)+'%':'—'],
          ['Buyers',fmt(totals.buyers)],
          ['Orders',fmt(totals.orders)],
          ['Sales',totals.sales>0?cur(totals.sales):'—'],
          ['ROAS',totals.roas>0?totals.roas.toFixed(2)+'x':'—'],
        ] as const).map(([l,v])=>(
          <div key={l} className="bg-white rounded-lg border border-black/[0.06] px-3 py-2.5">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-[14px] font-semibold text-gray-800 tabular-nums mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-gray-500 mb-3">Pick a segment category to see detailed rows</p>

      {cards.length===0 ? (
        <div className="bg-white rounded-xl border border-black/[0.06] py-16 text-center text-[13px] text-gray-400">No segments found for this campaign.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {cards.map(c=>(
            <button key={c.category}
              onClick={()=>onOpenCategory(c.category)}
              className="text-left bg-white rounded-xl border border-black/[0.06] hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all p-4 group">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate" title={c.category}>{c.category}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{c.segment_count} segment{c.segment_count===1?'':'s'} · {c.row_count} row{c.row_count===1?'':'s'}</p>
                </div>
                <span className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all text-[14px]">→</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Sent</p>
                  <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(c.sent)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Delivered</p>
                  <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{c.delivery_rate>0?c.delivery_rate.toFixed(1)+'%':'—'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Sales</p>
                  <p className={`text-[13px] font-semibold tabular-nums ${c.sales>0?'text-green-700':'text-gray-400'}`}>{c.sales>0?cur(c.sales):'—'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">ROAS</p>
                  <div className="mt-0.5"><RoasBadge roas={c.roas||null}/></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <DefinitionsPanel items={DEFS.campaigns}/>
    </div>
  )
}

function CategoryDetailView({campaignId,category,onBack,onBackToCampaigns}:{campaignId:string,category:SegmentCategory,onBack:()=>void,onBackToCampaigns:()=>void}){
  const campaigns=useDashStore(s=>s.campaigns)
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(0)
  const [perPage,setPerPage]=useState(10)

  const scoped=useMemo(()=>campaigns.filter(c=>groupKey(c.campaign_id)===campaignId && categorize(c.segment,c.name)===category),[campaigns,campaignId,category])
  const filtered=useMemo(()=>scoped.filter(r=>!search||r.name.toLowerCase().includes(search)||r.segment.toLowerCase().includes(search)),[scoped,search])
  const {sorted,toggle,dir}=useSort(filtered,'date')

  const pages=Math.max(1,Math.ceil(sorted.length/perPage))
  useEffect(()=>{ if(page>pages-1) setPage(pages-1) },[pages,page])
  const safePage=Math.min(page,pages-1)
  const paged=sorted.slice(safePage*perPage,(safePage+1)*perPage)

  const totals=useMemo(()=>{
    const t={sent:0,delivered:0,buyers:0,orders:0,sales:0,cost:0}
    for(const r of scoped){
      t.sent+=r.sent||0; t.delivered+=r.delivered||0
      t.buyers+=r.buyers||0; t.orders+=r.orders||0
      t.sales+=r.sales||0; t.cost+=r.cost||0
    }
    return {...t, delivery_rate: safe(t.delivered,t.sent)*100, roas: safe(t.sales,t.cost)}
  },[scoped])

  return(
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-900 h-8 px-3 rounded-lg border border-black/[0.08] bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors">
          <span className="text-[14px] leading-none">←</span> Back to categories
        </button>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <button onClick={onBackToCampaigns} className="hover:text-blue-600 transition-colors">Campaigns</button>
          <span>›</span>
          <button onClick={onBack} className="hover:text-blue-600 transition-colors">{campaignId}</button>
          <span>›</span>
          <span className="text-gray-700">{category}</span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[16px] font-semibold text-gray-900 leading-tight">{campaignId} · {category}</p>
        <p className="text-[11px] text-gray-500">{scoped.length} row{scoped.length===1?'':'s'}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {([
          ['Sent',fmt(totals.sent)],
          ['Delivered',totals.delivery_rate>0?totals.delivery_rate.toFixed(1)+'%':'—'],
          ['Buyers',fmt(totals.buyers)],
          ['Orders',fmt(totals.orders)],
          ['Sales',totals.sales>0?cur(totals.sales):'—'],
          ['ROAS',totals.roas>0?totals.roas.toFixed(2)+'x':'—'],
        ] as const).map(([l,v])=>(
          <div key={l} className="bg-white rounded-lg border border-black/[0.06] px-3 py-2.5">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-[14px] font-semibold text-gray-800 tabular-nums mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[12px] text-gray-500"><span className="font-semibold text-gray-800 tabular-nums">{filtered.length}</span> row{filtered.length===1?'':'s'}</p>
        <div className="flex items-center gap-2">
          <select value={perPage} onChange={e=>{setPerPage(+e.target.value);setPage(0)}} className="h-8 text-[12px] px-2.5 rounded-lg border border-black/[0.08] bg-white text-gray-700 cursor-pointer hover:border-gray-300 focus:outline-none focus:border-blue-400">{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
          <div className="flex items-center gap-1.5 border border-black/[0.08] rounded-lg px-2.5 h-8 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-colors">
            <Search size={13} className="text-gray-400" />
            <input value={search} onChange={e=>{setSearch(e.target.value.toLowerCase());setPage(0)}} placeholder="Search segment…" className="border-none bg-transparent text-[12px] outline-none w-44 text-gray-700 placeholder:text-gray-400"/>
          </div>
        </div>
      </div>

      <Panel>
        <div className="overflow-x-auto"><table className="w-full" style={{minWidth:'900px'}}>
          <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
            <Th right={false} onClick={()=>toggle('segment')} sortDir={dir('segment')}>Segment</Th>
            <Th onClick={()=>toggle('date')} sortDir={dir('date')}>Date</Th>
            <Th onClick={()=>toggle('sent')} sortDir={dir('sent')}>Sent</Th>
            <Th onClick={()=>toggle('delivered')} sortDir={dir('delivered')}>Delivered</Th>
            <Th>Del %</Th><Th>Open %</Th>
            <Th onClick={()=>toggle('ctr')} sortDir={dir('ctr')}>CTR</Th>
            <Th onClick={()=>toggle('buyers')} sortDir={dir('buyers')}>Buyers</Th>
            <Th onClick={()=>toggle('sales')} sortDir={dir('sales')}>Sales</Th>
            <Th onClick={()=>toggle('orders')} sortDir={dir('orders')}>Orders</Th>
            <Th onClick={()=>toggle('cost')} sortDir={dir('cost')}>Cost</Th>
            <Th onClick={()=>toggle('roas')} sortDir={dir('roas')}>ROAS</Th>
          </tr></thead>
          <tbody>{paged.map((r,i)=>(
            <tr key={i} className="hover:bg-blue-50/40 transition-colors">
              <Td right={false}><p className="text-[12px] truncate max-w-[220px] text-gray-800" title={r.segment}>{r.segment||'—'}</p><p className="text-[10px] text-gray-400 truncate max-w-[220px]" title={r.name}>{r.offer} · {r.format}</p></Td>
              <Td className="text-gray-500 whitespace-nowrap">{r.date?.slice(5)}</Td>
              <Td>{fmt(r.sent)}</Td><Td>{fmt(r.delivered)}</Td>
              <Td><DrBadge dr={deliveryRate(r)}/></Td>
              <Td>{fmtPct(openRate(r))}</Td>
              <Td>{r.ctr?r.ctr+'%':'—'}</Td>
              <Td>{r.buyers||'—'}</Td>
              <Td className={r.sales>0?'text-green-700 font-semibold':'text-gray-400'}>{r.sales>0?cur(r.sales):'—'}</Td>
              <Td>{r.orders||'—'}</Td>
              <Td>{cur(r.cost)}</Td>
              <Td><RoasBadge roas={r.roas}/></Td>
            </tr>
          ))}
          {paged.length===0 && <tr><td colSpan={12} className="text-center py-10 text-[12px] text-gray-400">No rows match your filters.</td></tr>}
          </tbody>
        </table></div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-black/[0.06] text-[11px] text-gray-500 flex-wrap gap-2 bg-gray-50/40">
          <span className="tabular-nums">{sorted.length===0?'0':`${safePage*perPage+1}–${Math.min((safePage+1)*perPage,sorted.length)}`} of {sorted.length}</span>
          <div className="flex gap-1 items-center">
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0} className="min-w-[28px] h-7 px-2 rounded-md border border-black/[0.08] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-colors">←</button>
            {pageWindow(safePage,pages).map((p,i)=>p==='…'
              ?<span key={`e${i}`} className="min-w-[20px] h-7 px-1 flex items-center justify-center text-gray-400 tabular-nums select-none">…</span>
              :<button key={p} onClick={()=>setPage(p)} className={`min-w-[28px] h-7 px-2 rounded-md border tabular-nums transition-colors ${p===safePage?'border-blue-500 bg-blue-500 text-white font-medium shadow-sm':'border-black/[0.08] bg-white hover:bg-gray-50 hover:border-gray-300'}`}>{p+1}</button>
            )}
            <button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={safePage>=pages-1} className="min-w-[28px] h-7 px-2 rounded-md border border-black/[0.08] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-colors">→</button>
          </div>
        </div>
      </Panel>
      <DefinitionsPanel items={DEFS.campaigns}/>
    </div>
  )
}

function AutomationsTab(){
  const automations=useDashStore(s=>s.automations)
  const [typeFilter,setTypeFilter]=useState('ALL')
  const filtered=useMemo(()=>typeFilter==='ALL'?automations:automations.filter(r=>r.type===typeFilter),[automations,typeFilter])
  const {sorted,toggle,dir}=useSort(filtered,'sales')
  const std=automations.filter(r=>r.type==='standard'), gk=automations.filter(r=>r.type==='cart_recovery')
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 mb-4">
        {[['Auto Sales',cur(sumKey(std,'sales'))],['Auto Orders',fmt(sumKey(std,'orders'))],['Auto Buyers',fmt(sumKey(std,'buyers'))],['Auto Cost',cur(sumKey(std,'cost'))],['Carts Recovered',cur(sumKey(gk,'recovered_amount'))],['Carts Won',fmt(sumKey(gk,'recovered_carts'))]].map(([l,v])=><MetricCard key={l} label={l} value={v}/>)}
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-gray-500">{filtered.length} automations</p>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="h-8 text-[12px] px-2 rounded-md border border-black/[0.12] bg-white text-gray-700 focus:outline-none">
          <option value="ALL">All Types</option><option value="standard">Standard</option><option value="cart_recovery">Cart Recovery (GoKwik)</option>
        </select>
      </div>
      <Panel><div className="overflow-x-auto"><table className="w-full" style={{minWidth:'900px'}}>
        <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
          <Th right={false} onClick={()=>toggle('name')} sortDir={dir('name')}>Automation</Th>
          <Th>Type</Th>
          <Th onClick={()=>toggle('date')} sortDir={dir('date')}>As of</Th>
          <Th onClick={()=>toggle('sent')} sortDir={dir('sent')}>Sent</Th>
          <Th onClick={()=>toggle('delivered')} sortDir={dir('delivered')}>Delivered</Th>
          <Th onClick={()=>toggle('seen')} sortDir={dir('seen')}>Seen</Th>
          <Th onClick={()=>toggle('ctr')} sortDir={dir('ctr')}>CTR</Th>
          <Th onClick={()=>toggle('buyers')} sortDir={dir('buyers')}>Buyers</Th>
          <Th onClick={()=>toggle('sales')} sortDir={dir('sales')}>Sales / Recovered</Th>
          <Th onClick={()=>toggle('cost')} sortDir={dir('cost')}>Cost</Th>
          <Th onClick={()=>toggle('roas')} sortDir={dir('roas')}>ROAS</Th>
        </tr></thead>
        <tbody>{sorted.map((r,i)=>(
          <tr key={i} className="hover:bg-blue-50/40 transition-colors">
            <Td right={false} className="font-semibold whitespace-nowrap">{r.name}</Td>
            <Td>{r.type==='cart_recovery'?<Badge variant="amber">Cart Recovery</Badge>:<Badge variant="blue">Standard</Badge>}</Td>
            <Td className="text-gray-500 whitespace-nowrap tabular-nums">{r.date || '—'}</Td>
            <Td>{fmt(r.sent)}</Td><Td>{fmt(r.delivered)}</Td>
            <Td>{r.seen?fmt(r.seen):'—'}</Td>
            <Td>{r.ctr?r.ctr+'%':'—'}</Td>
            <Td>{r.buyers||'—'}</Td>
            <Td className={(r.sales||r.recovered_amount)>0?'text-green-700 font-semibold':'text-gray-400'}>
              {r.type==='cart_recovery'?(r.recovered_amount>0?<span>{cur(r.recovered_amount)}<br/><span className="text-[10px] text-gray-400 font-normal">({r.recovered_carts} carts)</span></span>:'—'):(r.sales>0?cur(r.sales):'—')}
            </Td>
            <Td>{cur(r.cost)}</Td>
            <Td><RoasBadge roas={r.roas}/></Td>
          </tr>
        ))}</tbody>
      </table></div></Panel>
      <DefinitionsPanel items={DEFS.automations}/>
    </div>
  )
}

function SegmentTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const segs=useMemo(()=>computeSegments(campaigns),[campaigns])
  const {sorted,toggle,dir}=useSort(segs,'sales')
  const top5=segs.slice(0,5)
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-4">
        <Panel><PanelBody>
          <PanelTitle>Top segments by sales</PanelTitle>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart layout="vertical" data={top5.map(s=>({name:s.segment.length>20?s.segment.slice(0,20)+'…':s.segment,sales:s.sales}))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:9}} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <YAxis dataKey="name" type="category" tick={{fontSize:9}} width={120}/>
              <Tooltip formatter={(v)=>['₹'+new Intl.NumberFormat('en-IN').format(Math.round(Number(v)||0)),'Sales']} contentStyle={{fontSize:11}}/>
              <Bar dataKey="sales" radius={[0,3,3,0]}>{top5.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>Top segments by ROAS</PanelTitle>
          <div className="space-y-2">
            {[...segs].filter(s=>s.cost>0).sort((a,b)=>b.roas-a.roas).slice(0,6).map((s,i)=>(
              <div key={s.segment} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 min-w-[130px] truncate" title={s.segment}>{s.segment}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full flex items-center pl-2 rounded" style={{width:`${Math.min(s.roas/80*100,100)}%`,background:COLORS[i%COLORS.length],minWidth:'50px'}}>
                    <span className="text-[10px] text-white font-semibold">{s.roas.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PanelBody></Panel>
      </div>
      <Panel><div className="overflow-x-auto"><table className="w-full" style={{minWidth:'780px'}}>
        <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
          <Th right={false} onClick={()=>toggle('segment')} sortDir={dir('segment')}>Segment</Th>
          <Th onClick={()=>toggle('campaign_count')} sortDir={dir('campaign_count')}>Campaigns</Th>
          <Th onClick={()=>toggle('sent')} sortDir={dir('sent')}>Sent</Th>
          <Th onClick={()=>toggle('delivered')} sortDir={dir('delivered')}>Delivered</Th>
          <Th>Del %</Th><Th>Open %</Th>
          <Th onClick={()=>toggle('buyers')} sortDir={dir('buyers')}>Buyers</Th>
          <Th onClick={()=>toggle('sales')} sortDir={dir('sales')}>Sales</Th>
          <Th onClick={()=>toggle('roas')} sortDir={dir('roas')}>ROAS</Th>
          <Th onClick={()=>toggle('revenue_per_delivered')} sortDir={dir('revenue_per_delivered')}>Rev/Del</Th>
        </tr></thead>
        <tbody>{sorted.map((r,i)=>(
          <tr key={i} className="hover:bg-blue-50/40 transition-colors">
            <Td right={false} className="font-semibold text-[11px] max-w-[170px] truncate" title={r.segment}>{r.segment}</Td>
            <Td>{r.campaign_count}</Td><Td>{fmt(r.sent)}</Td><Td>{fmt(r.delivered)}</Td>
            <Td><DrBadge dr={r.delivery_rate}/></Td>
            <Td>{fmtPct(r.open_rate)}</Td>
            <Td>{r.buyers||'—'}</Td>
            <Td className={r.sales>0?'text-green-700 font-semibold':'text-gray-400'}>{r.sales>0?cur(r.sales):'—'}</Td>
            <Td><RoasBadge roas={r.roas}/></Td>
            <Td>{'₹'+r.revenue_per_delivered.toFixed(2)}</Td>
          </tr>
        ))}</tbody>
      </table></div></Panel>
      <DefinitionsPanel items={DEFS.segment}/>
    </div>
  )
}

function OfferTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const offers=useMemo(()=>computeOffers(campaigns),[campaigns])
  const {sorted,toggle,dir}=useSort(offers,'sales')
  const pieData=offers.filter(o=>o.sales>0).map((o,i)=>({name:o.offer,value:o.sales,fill:COLORS[i%COLORS.length]}))
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-4">
        <Panel><PanelBody>
          <PanelTitle>Revenue by offer type</PanelTitle>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({name,percent}:{name?:string;percent?:number})=>`${name} ${((percent||0)*100).toFixed(0)}%`} labelLine={false}>{pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Pie>
              <Tooltip formatter={(v)=>['₹'+new Intl.NumberFormat('en-IN').format(Math.round(Number(v)||0)),'Sales']} contentStyle={{fontSize:11}}/></PieChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>Offer quick comparison</PanelTitle>
          <div className="divide-y divide-black/[0.06]">
            {offers.map(o=>(
              <div key={o.offer} className="flex items-center justify-between py-2 gap-2">
                <span className="font-semibold text-[13px]">{o.offer}</span>
                <span className="text-[11px] text-gray-400">{o.campaign_count} campaigns</span>
                <span className="text-green-700 font-semibold text-[12px]">{o.sales>0?cur(o.sales):'—'}</span>
                <RoasBadge roas={o.roas}/>
              </div>
            ))}
          </div>
        </PanelBody></Panel>
      </div>
      <Panel><div className="overflow-x-auto"><table className="w-full" style={{minWidth:'680px'}}>
        <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
          <Th right={false}>Offer Type</Th>
          <Th onClick={()=>toggle('campaign_count')} sortDir={dir('campaign_count')}>Campaigns</Th>
          <Th onClick={()=>toggle('sent')} sortDir={dir('sent')}>Sent</Th>
          <Th onClick={()=>toggle('delivered')} sortDir={dir('delivered')}>Delivered</Th>
          <Th onClick={()=>toggle('ctr')} sortDir={dir('ctr')}>Avg CTR</Th>
          <Th onClick={()=>toggle('buyers')} sortDir={dir('buyers')}>Buyers</Th>
          <Th onClick={()=>toggle('sales')} sortDir={dir('sales')}>Sales</Th>
          <Th onClick={()=>toggle('roas')} sortDir={dir('roas')}>ROAS</Th>
          <Th onClick={()=>toggle('revenue_per_delivered')} sortDir={dir('revenue_per_delivered')}>Rev/Del</Th>
          <Th onClick={()=>toggle('buyer_conversion')} sortDir={dir('buyer_conversion')}>Buyer Conv</Th>
        </tr></thead>
        <tbody>{sorted.map((r,i)=>(
          <tr key={i} className="hover:bg-blue-50/40 transition-colors">
            <Td right={false} className="font-semibold">{r.offer}</Td>
            <Td>{r.campaign_count}</Td><Td>{fmt(r.sent)}</Td><Td>{fmt(r.delivered)}</Td>
            <Td>{fmtPct(r.ctr)}</Td><Td>{r.buyers||'—'}</Td>
            <Td className={r.sales>0?'text-green-700 font-semibold':'text-gray-400'}>{r.sales>0?cur(r.sales):'—'}</Td>
            <Td><RoasBadge roas={r.roas}/></Td>
            <Td>{'₹'+r.revenue_per_delivered.toFixed(2)}</Td>
            <Td>{fmtPct(r.buyer_conversion)}</Td>
          </tr>
        ))}</tbody>
      </table></div></Panel>
      <DefinitionsPanel items={DEFS.offer}/>
    </div>
  )
}

function FunnelTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const f=useMemo(()=>computeFunnel(campaigns),[campaigns])
  const topDR=useMemo(()=>[...campaigns].sort((a,b)=>deliveryRate(b)-deliveryRate(a)).slice(0,5),[campaigns])
  const botDR=useMemo(()=>[...campaigns].sort((a,b)=>deliveryRate(a)-deliveryRate(b)).slice(0,5),[campaigns])
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-4">
        <Panel><PanelBody>
          <PanelTitle>Full messaging funnel</PanelTitle>
          <FunnelRow label="Sent"      value={f.sent}      pct={100}                       colorIdx={0}/>
          <FunnelRow label="Delivered" value={f.delivered} pct={f.delivery_rate}           colorIdx={1}/>
          <FunnelRow label="Seen"      value={f.seen}      pct={safe(f.seen,f.sent)*100}   colorIdx={2}/>
          <FunnelRow label="Clicked"   value={f.clicks}    pct={f.click_rate}              colorIdx={3}/>
          <FunnelRow label="Buyers"    value={f.buyers}    pct={f.buyer_rate}              colorIdx={4}/>
          <FunnelRow label="Orders"    value={f.orders}    pct={safe(f.orders,f.sent)*100} colorIdx={5}/>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>Best delivery rate</PanelTitle>
          <div className="space-y-1.5 mb-4">{topDR.map(r=><div key={r.id} className="flex items-center justify-between gap-2"><span className="text-[10px] text-gray-500 flex-1 truncate" title={r.segment}>{r.segment}</span><DrBadge dr={deliveryRate(r)}/></div>)}</div>
          <PanelTitle>Lowest delivery rate</PanelTitle>
          <div className="space-y-1.5">{botDR.map(r=><div key={r.id} className="flex items-center justify-between gap-2"><span className="text-[10px] text-gray-500 flex-1 truncate" title={r.segment}>{r.segment}</span><DrBadge dr={deliveryRate(r)}/></div>)}</div>
        </PanelBody></Panel>
      </div>
      <Panel><PanelBody>
        <PanelTitle>Funnel rate summary</PanelTitle>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          {[['Delivery Rate',f.delivery_rate],['Open Rate',f.open_rate],['Click Rate (sent)',f.click_rate],['Click to Open',f.click_to_open],['Buyer Rate',f.buyer_rate],['Click to Purchase',f.click_to_purchase]].map(([l,v])=><MetricCard key={l as string} label={l as string} value={(v as number).toFixed(2)+'%'}/>)}
        </div>
      </PanelBody></Panel>
      <DefinitionsPanel items={DEFS.funnel}/>
    </div>
  )
}

function RevenueTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const ts=sumKey(campaigns,'sent'), td=sumKey(campaigns,'delivered'), tsal=sumKey(campaigns,'sales')
  const tb=sumKey(campaigns,'buyers'), to=sumKey(campaigns,'orders'), tcost=sumKey(campaigns,'cost'), tc=sumKey(campaigns,'clicks')
  const top10=[...campaigns].sort((a,b)=>revenuePerDel(b)-revenuePerDel(a)).slice(0,10)
  const buckets=useMemo(()=>{
    const b:Record<string,number>={'0–3x':0,'3–10x':0,'10–30x':0,'30–60x':0,'60x+':0}
    campaigns.forEach(r=>{if(!r.roas||r.roas<=0)return;if(r.roas<3)b['0–3x']++;else if(r.roas<10)b['3–10x']++;else if(r.roas<30)b['10–30x']++;else if(r.roas<60)b['30–60x']++;else b['60x+']++})
    return Object.entries(b).map(([name,value],i)=>({name,value,fill:['#E24B4A','#EF9F27','#1D9E75','#378ADD','#7F77DD'][i]}))
  },[campaigns])
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 mb-4">
        {[['Total Revenue',cur(tsal)],['Total Cost',cur(tcost)],['Overall ROAS',safe(tsal,tcost).toFixed(2)+'x'],['Rev/Delivered','₹'+safe(tsal,td).toFixed(2)],['Rev/Sent','₹'+safe(tsal,ts).toFixed(2)],['Cost per Buyer',cur(safe(tcost,tb))],['Cost per Order',cur(safe(tcost,to))],['Order Conversion',safe(to,tc).toFixed(2)+'%']].map(([l,v])=><MetricCard key={l} label={l} value={v}/>)}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <Panel><PanelBody>
          <PanelTitle>Top 10 — revenue per delivered message</PanelTitle>
          <div className="divide-y divide-black/[0.06]">
            {top10.map((r,i)=>(
              <div key={r.id} className="flex items-center gap-2 py-1.5">
                <span className="text-[11px] text-gray-400 font-semibold min-w-[18px]">{i+1}.</span>
                <span className="text-[10px] text-gray-500 flex-1 truncate" title={r.segment}>{r.segment}</span>
                <span className="text-green-700 font-semibold text-[12px]">₹{revenuePerDel(r).toFixed(2)}</span>
                <RoasBadge roas={r.roas}/>
              </div>
            ))}
          </div>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>ROAS distribution</PanelTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} allowDecimals={false}/>
              <Tooltip contentStyle={{fontSize:11}}/>
              <Bar dataKey="value" name="Campaigns" radius={[3,3,0,0]}>{buckets.map((b,i)=><Cell key={i} fill={b.fill}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
      </div>
      <DefinitionsPanel items={DEFS.revenue}/>
    </div>
  )
}

function HistoricalTab(){
  const campaigns=useDashStore(s=>s.campaigns)
  const daily=useMemo(()=>computeDaily(campaigns),[campaigns])
  const {sorted,toggle,dir}=useSort(daily,'date','asc')
  const salesData=daily.map(d=>({date:d.date.slice(5),sales:d.sales,buyers:d.buyers}))
  const sentData=daily.map(d=>({date:d.date.slice(5),sent:d.sent,delivered:d.delivered}))
  return(
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-4">
        <Panel><PanelBody>
          <PanelTitle>Daily sales trend</PanelTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip formatter={(v)=>['₹'+new Intl.NumberFormat('en-IN').format(Math.round(Number(v)||0)),'Sales']} contentStyle={{fontSize:11}}/>
              <Line type="monotone" dataKey="sales" stroke="#1D9E75" strokeWidth={2} dot={{r:3,fill:'#1D9E75'}}/>
            </LineChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
        <Panel><PanelBody>
          <PanelTitle>Daily volume — sent vs delivered</PanelTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} tickFormatter={v=>Math.round(v/1000)+'k'}/>
              <Tooltip formatter={(v)=>[new Intl.NumberFormat('en-IN').format(Math.round(Number(v)||0))]} contentStyle={{fontSize:11}}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Line type="monotone" dataKey="sent" stroke="#378ADD" strokeWidth={2} dot={{r:3}} name="Sent"/>
              <Line type="monotone" dataKey="delivered" stroke="#1D9E75" strokeWidth={2} dot={{r:3}} name="Delivered"/>
            </LineChart>
          </ResponsiveContainer>
        </PanelBody></Panel>
      </div>
      <Panel><div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
          <Th right={false} onClick={()=>toggle('date')} sortDir={dir('date')}>Date</Th>
          <Th onClick={()=>toggle('campaign_count')} sortDir={dir('campaign_count')}>Campaigns</Th>
          <Th onClick={()=>toggle('sent')} sortDir={dir('sent')}>Sent</Th>
          <Th onClick={()=>toggle('delivered')} sortDir={dir('delivered')}>Delivered</Th>
          <Th>Del %</Th>
          <Th onClick={()=>toggle('buyers')} sortDir={dir('buyers')}>Buyers</Th>
          <Th onClick={()=>toggle('sales')} sortDir={dir('sales')}>Sales</Th>
          <Th onClick={()=>toggle('roas')} sortDir={dir('roas')}>ROAS</Th>
        </tr></thead>
        <tbody>{sorted.map((r,i)=>{
          const prev=sorted[i-1]
          const delta=prev&&prev.sales>0?((r.sales-prev.sales)/prev.sales*100):null
          return(
            <tr key={r.date} className="hover:bg-blue-50/40 transition-colors">
              <Td right={false} className="font-semibold">{r.date}</Td>
              <Td>{r.campaign_count}</Td><Td>{fmt(r.sent)}</Td><Td>{fmt(r.delivered)}</Td>
              <Td><DrBadge dr={r.delivery_rate}/></Td>
              <Td>{r.buyers||'—'}</Td>
              <Td className={r.sales>0?'text-green-700 font-semibold':'text-gray-400'}>
                {r.sales>0?cur(r.sales):'—'}
                {delta!=null&&<span className={`ml-1.5 text-[10px] font-normal ${delta>=0?'text-green-600':'text-red-500'}`}>{delta>=0?'+':''}{delta.toFixed(1)}%</span>}
              </Td>
              <Td><RoasBadge roas={r.roas}/></Td>
            </tr>
          )
        })}</tbody>
      </table></div></Panel>
      <DefinitionsPanel items={DEFS.historical}/>
    </div>
  )
}

export default function DashboardPage(){
  const [tab,setTab]=useState<TabId>('overview')
  const [showUpload,setShowUpload]=useState(false)
  const [syncing,setSyncing]=useState(false)
  const [lastSynced,setLastSynced]=useState<string|null>(null)
  const [syncError,setSyncError]=useState<string|null>(null)
  const {campaigns,fetchCampaigns,fetchAutomations,loading,error}=useDashStore()
  const filters=useDashStore(s=>s.filters)

  useEffect(()=>{fetchCampaigns();fetchAutomations()},[fetchCampaigns,fetchAutomations])
  useEffect(()=>{fetchCampaigns()},[filters,fetchCampaigns])

  const campaignIds=useMemo(()=>[...new Set(campaigns.map(r=>r.campaign_id))].sort(),[campaigns])
  const segments=useMemo(()=>[...new Set(campaigns.map(r=>r.segment))].sort(),[campaigns])
  const offers=useMemo(()=>[...new Set(campaigns.map(r=>r.offer))].sort(),[campaigns])
  const dates=useMemo(()=>[...new Set(campaigns.map(r=>r.date).filter(Boolean))],[campaigns])

  const handleSync=async()=>{
    setSyncing(true)
    setSyncError(null)
    try{
      const res=await fetch('/api/sync',{method:'POST'})
      const json=await res.json()
      if(!res.ok)throw new Error(json.error||`Sync failed (${res.status})`)
      setLastSynced(new Date().toLocaleTimeString())
      fetchCampaigns()
    }catch(e){
      setSyncError(e instanceof Error?e.message:'Sync failed')
    }
    setSyncing(false)
  }

  const tabs:Record<TabId,React.ReactNode>={
    overview:<OverviewTab/>,campaigns:<CampaignsTab/>,automations:<AutomationsTab/>,
    segment:<SegmentTab/>,offer:<OfferTab/>,funnel:<FunnelTab/>,revenue:<RevenueTab/>,historical:<HistoricalTab/>
  }

  return(
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeTab={tab} onTab={setTab} onUpload={()=>setShowUpload(true)} onSync={handleSync} syncing={syncing} lastSynced={lastSynced}/>
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar tab={tab} campaignIds={campaignIds} segments={segments} offers={offers} dates={dates}/>
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {loading&&campaigns.length===0&&<div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"/></div>}
          {error&&<div className="mb-4 bg-rose-50 border border-rose-200/80 rounded-xl p-4 text-[13px] text-rose-700">Failed to load: {error}. Check .env.local for Supabase keys.</div>}
          {syncError&&<div className="mb-4 bg-rose-50 border border-rose-200/80 rounded-xl p-4 text-[13px] text-rose-700">Sync failed: {syncError}</div>}
          <div key={tab} className="fade-in">{tabs[tab]}</div>
        </main>
      </div>
      {showUpload&&<UploadModal onClose={()=>setShowUpload(false)}/>}
    </div>
  )
}
