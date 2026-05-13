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
        <KpiCard icon={<ShoppingCart size={18}/>} label="Total Orders"    value={fmt(kpi.total_orders)}    smartRetry={{delta:'+209',pct:'13.60%'}}/>
        <KpiCard icon={<Tag size={18}/>}          label="Total Sales"     value={cur(kpi.total_sales)}     smartRetry={{delta:'+₹3,20,820',pct:'15.00%'}}/>
        <KpiCard icon={<ShoppingBag size={18}/>}  label="Total Buyers"    value={fmt(kpi.total_buyers)}    smartRetry={{delta:'+207',pct:'14.04%'}}/>
        <KpiCard icon={<MessageCircle size={18}/>} label="Messages Sent"  value={fmt(kpi.total_sent)}/>
        <KpiCard icon={<Play size={18}/>}          label="Msg Delivered"  value={fmt(kpi.total_delivered)} smartRetry={{delta:'+63,002',pct:'3.07%'}}/>
        <KpiCard icon={<UserPlus size={18}/>}      label="New Customers"  value={fmt(kpi.new_customers)}   smartRetry={{delta:'+83',pct:'13.52%'}}/>
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
            <FunnelRow label="Sent"      value={funnel.sent}      pct={100}                       colorIdx={0}/>
            <FunnelRow label="Delivered" value={funnel.delivered} pct={funnel.delivery_rate}      colorIdx={1} drop={funnel.sent-funnel.delivered}/>
            <FunnelRow label="Seen"      value={funnel.seen}      pct={safe(funnel.seen,funnel.sent)*100} colorIdx={2} drop={funnel.delivered-funnel.seen}/>
            <FunnelRow label="Clicks"    value={funnel.clicks}    pct={funnel.click_rate}         colorIdx={3} drop={funnel.seen-funnel.clicks}/>
            <FunnelRow label="Buyers"    value={funnel.buyers}    pct={funnel.buyer_rate}         colorIdx={4}/>
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
  const campaigns=useDashStore(s=>s.campaigns)
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(0)
  const [perPage,setPerPage]=useState(10)
  const filtered=useMemo(()=>campaigns.filter(r=>!search||r.name.toLowerCase().includes(search)||r.segment.toLowerCase().includes(search)),[campaigns,search])
  const {sorted,toggle,dir}=useSort(filtered,'sales')
  const pages=Math.ceil(sorted.length/perPage)
  const paged=sorted.slice(page*perPage,(page+1)*perPage)
  return(
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[12px] text-gray-500"><span className="font-semibold text-gray-800 tabular-nums">{filtered.length}</span> campaigns · Included segments only</p>
        <div className="flex items-center gap-2">
          <select value={perPage} onChange={e=>{setPerPage(+e.target.value);setPage(0)}} className="h-8 text-[12px] px-2.5 rounded-lg border border-black/[0.08] bg-white text-gray-700 cursor-pointer hover:border-gray-300 focus:outline-none focus:border-blue-400">{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
          <div className="flex items-center gap-1.5 border border-black/[0.08] rounded-lg px-2.5 h-8 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-colors">
            <Search size={13} className="text-gray-400" />
            <input value={search} onChange={e=>{setSearch(e.target.value.toLowerCase());setPage(0)}} placeholder="Search…" className="border-none bg-transparent text-[12px] outline-none w-40 text-gray-700 placeholder:text-gray-400"/>
          </div>
        </div>
      </div>
      <Panel>
        <div className="overflow-x-auto"><table className="w-full" style={{minWidth:'900px'}}>
          <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
            <Th right={false} onClick={()=>toggle('name')} sortDir={dir('name')}>Campaign</Th>
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
              <Td right={false}><p className="font-semibold text-[12px] truncate max-w-[160px]" title={r.name}>{r.campaign_id}</p><p className="text-[10px] text-gray-400 truncate max-w-[160px]">{r.segment}</p></Td>
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
          ))}</tbody>
        </table></div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-black/[0.06] text-[11px] text-gray-500 flex-wrap gap-2 bg-gray-50/40">
          <span className="tabular-nums">{page*perPage+1}–{Math.min((page+1)*perPage,sorted.length)} of {sorted.length}</span>
          <div className="flex gap-1">
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="min-w-[28px] h-7 px-2 rounded-md border border-black/[0.08] bg-white disabled:opacity-40 hover:bg-gray-50 hover:border-gray-300 transition-colors">←</button>
            {Array.from({length:pages},(_,i)=><button key={i} onClick={()=>setPage(i)} className={`min-w-[28px] h-7 px-2 rounded-md border tabular-nums transition-colors ${i===page?'border-blue-500 bg-blue-500 text-white font-medium shadow-sm':'border-black/[0.08] bg-white hover:bg-gray-50 hover:border-gray-300'}`}>{i+1}</button>)}
            <button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={page>=pages-1} className="min-w-[28px] h-7 px-2 rounded-md border border-black/[0.08] bg-white disabled:opacity-40 hover:bg-gray-50 hover:border-gray-300 transition-colors">→</button>
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
      <Panel><div className="overflow-x-auto"><table className="w-full" style={{minWidth:'860px'}}>
        <thead className="bg-gray-50/60 sticky top-0 z-[1]"><tr>
          <Th right={false} onClick={()=>toggle('name')} sortDir={dir('name')}>Automation</Th>
          <Th>Type</Th>
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
          <FunnelRow label="Sent"      value={f.sent}      pct={100}                    colorIdx={0}/>
          <FunnelRow label="Delivered" value={f.delivered} pct={f.delivery_rate}        colorIdx={1} drop={f.sent-f.delivered}/>
          <FunnelRow label="Seen"      value={f.seen}      pct={safe(f.seen,f.sent)*100} colorIdx={2} drop={f.delivered-f.seen}/>
          <FunnelRow label="Clicked"   value={f.clicks}    pct={f.click_rate}           colorIdx={3} drop={f.seen-f.clicks}/>
          <FunnelRow label="Buyers"    value={f.buyers}    pct={f.buyer_rate}           colorIdx={4} drop={f.clicks-f.buyers}/>
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
