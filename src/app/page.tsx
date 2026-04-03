"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Bar, Cell,
  ComposedChart,
} from "recharts";

interface StockQuote {
  code: string; name: string; nameEn: string; sector: string;
  price: number; prevClose: number; change: number; changePct: number;
  open: number; high: number; low: number; volume: number;
  marketCap: number; per: number | null; pbr: number | null;
  dividendYield: number | null; eps: number | null;
  fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null;
}
interface ChartPoint {
  date: string; price: number; volume: number;
  ma25: number | null; ma75: number | null;
  bbUpper2: number | null; bbUpper1: number | null; bbMid: number | null;
  bbLower1: number | null; bbLower2: number | null;
  rsi: number | null;
  macd: number | null; macdSignal: number | null; macdHist: number | null;
}
interface TargetRange { label: string; period: string; low: number; mid: number; high: number; currentPrice: number; positionPct: number; }
interface Indicators { rsi: number|null; rsiSignal: string; macd: number|null; macdSignal: number|null; macdHistogram: number|null; macdTrend: string; }
interface MacroIndicator { id: string; name: string; nameJa: string; value: number; prevValue: number; change: number; changePct: number; unit: string; direction: "up"|"down"|"flat"; }
interface SensitivityEntry { factorId: string; factorName: string; score: number; reason: string; }
interface StockMacroScore { code: string; name: string; totalScore: number; maxPossible: number; normalizedScore: number; signal: string; factors: SensitivityEntry[]; }

function fmtVol(n: number) { if(n>=1e8) return (n/1e8).toFixed(1)+"億"; if(n>=1e4) return (n/1e4).toFixed(0)+"万"; return n.toLocaleString(); }
function fmtCap(n: number) { if(n>=1e12) return (n/1e12).toFixed(1)+"兆"; if(n>=1e8) return (n/1e8).toFixed(0)+"億"; return n.toLocaleString(); }
const PM: Record<string,string> = {"1M":"1mo","3M":"3mo","6M":"6mo","1Y":"1y"};

function PriceTip({active,payload,label}:any) {
  if(!active||!payload?.length) return null; const d=payload[0]?.payload;
  return (<div className="mono" style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(34,211,238,0.3)",borderRadius:6,padding:"10px 14px",fontSize:11}}>
    <div style={{color:"#94a3b8",marginBottom:4}}>{label}</div>
    <div style={{color:"#f8fafc",fontWeight:700,fontSize:13}}>¥{d?.price?.toLocaleString()}</div>
    {d?.bbUpper2 && <div style={{color:"#64748b"}}>BB: ¥{d.bbLower2?.toLocaleString()} — ¥{d.bbUpper2?.toLocaleString()}</div>}
    {d?.ma25 && <div style={{color:"#fbbf24"}}>MA25: ¥{d.ma25.toLocaleString()}</div>}
    <div style={{color:"#64748b",marginTop:2}}>出来高: {fmtVol(d?.volume||0)}</div>
  </div>);
}
function RsiTip({active,payload,label}:any) {
  if(!active||!payload?.length) return null; const v=payload[0]?.value;
  return (<div className="mono" style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(34,211,238,0.3)",borderRadius:6,padding:"8px 12px",fontSize:11}}>
    <div style={{color:"#94a3b8"}}>{label}</div>
    <div style={{color:v>=70?"#f87171":v<=30?"#34d399":"#e2e8f0",fontWeight:700}}>RSI: {v?.toFixed(1)}</div>
  </div>);
}
function MacdTip({active,payload,label}:any) {
  if(!active||!payload?.length) return null; const d=payload[0]?.payload;
  return (<div className="mono" style={{background:"rgba(15,23,42,0.95)",border:"1px solid rgba(34,211,238,0.3)",borderRadius:6,padding:"8px 12px",fontSize:11}}>
    <div style={{color:"#94a3b8"}}>{label}</div>
    {d?.macd!=null && <div style={{color:"#22d3ee"}}>MACD: {d.macd.toFixed(1)}</div>}
    {d?.macdSignal!=null && <div style={{color:"#f472b6"}}>Signal: {d.macdSignal.toFixed(1)}</div>}
    {d?.macdHist!=null && <div style={{color:d.macdHist>=0?"#34d399":"#f87171"}}>Hist: {d.macdHist.toFixed(1)}</div>}
  </div>);
}

function RangeBar({range}:{range:TargetRange}) {
  const pos=Math.max(0,Math.min(100,range.positionPct));
  return (<div style={{padding:"14px 16px",background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
      <span style={{fontSize:13,fontWeight:600}}>{range.label}</span>
      <span className="mono" style={{fontSize:10,color:"#64748b"}}>{range.period}</span>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
      <span className="mono" style={{fontSize:12,color:"#f87171"}}>¥{range.low.toLocaleString()}</span>
      <span className="mono" style={{fontSize:12,color:"#22d3ee"}}>¥{range.mid.toLocaleString()}</span>
      <span className="mono" style={{fontSize:12,color:"#34d399"}}>¥{range.high.toLocaleString()}</span>
    </div>
    <div style={{position:"relative",height:8,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden"}}>
      <div style={{position:"absolute",left:"0%",right:"0%",top:0,bottom:0,background:"linear-gradient(90deg,#f87171,#fbbf24,#34d399)",opacity:0.3,borderRadius:4}} />
      <div style={{position:"absolute",left:`${pos}%`,top:-2,width:12,height:12,background:"#22d3ee",borderRadius:"50%",transform:"translateX(-50%)",boxShadow:"0 0 8px rgba(34,211,238,0.5)",border:"2px solid #0f172a"}} />
    </div>
    <div style={{textAlign:"center",marginTop:6}}>
      <span className="mono" style={{fontSize:11,color:"#94a3b8"}}>現在値: </span>
      <span className="mono" style={{fontSize:12,fontWeight:700,color:"#f8fafc"}}>¥{range.currentPrice.toLocaleString()}</span>
    </div>
  </div>);
}

function SignalBadge({label,value,color}:{label:string;value:string;color:string}) {
  return (<div style={{textAlign:"center",padding:"12px 8px"}}>
    <div style={{color:"#64748b",fontSize:10,letterSpacing:1,marginBottom:4}}>{label}</div>
    <div className="mono" style={{fontSize:14,fontWeight:700,color}}>{value}</div>
  </div>);
}

// Macro score color
function scoreColor(score: number): string {
  if (score >= 30) return "#34d399";
  if (score >= 10) return "#6ee7b7";
  if (score <= -30) return "#f87171";
  if (score <= -10) return "#fca5a5";
  return "#94a3b8";
}
function signalBg(signal: string): string {
  if (signal.includes("追い風")) return "rgba(52,211,153,0.12)";
  if (signal.includes("向かい風")) return "rgba(248,113,113,0.12)";
  return "rgba(255,255,255,0.04)";
}

export default function Dashboard() {
  const [quotes,setQuotes] = useState<StockQuote[]>([]);
  const [sel,setSel] = useState("6501");
  const [chart,setChart] = useState<ChartPoint[]>([]);
  const [range,setRange] = useState("3M");
  const [loading,setLoading] = useState(true);
  const [cLoading,setCLoading] = useState(false);
  const [updated,setUpdated] = useState("");
  const [err,setErr] = useState<string|null>(null);
  const [targets,setTargets] = useState<TargetRange[]>([]);
  const [indicators,setIndicators] = useState<Indicators|null>(null);
  const [showBB,setShowBB] = useState(true);
  const [subChart,setSubChart] = useState<"rsi"|"macd">("rsi");
  const [macroIndicators,setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [macroScores,setMacroScores] = useState<StockMacroScore[]>([]);

  // Load stock quotes
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stocks"); if(!r.ok) throw new Error();
        const d = await r.json(); setQuotes(d.quotes); setUpdated(d.updatedAt); setErr(null);
      } catch { setErr("データの取得に失敗しました"); }
      finally { setLoading(false); }
    })();
    const iv = setInterval(async () => {
      try { const r = await fetch("/api/stocks"); if(r.ok){const d=await r.json(); setQuotes(d.quotes); setUpdated(d.updatedAt);}} catch{}
    }, 300000);
    return () => clearInterval(iv);
  }, []);

  // Load macro data
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/macro"); if(!r.ok) return;
        const d = await r.json();
        setMacroIndicators(d.indicators || []);
        setMacroScores(d.scores || []);
      } catch(e) { console.error("Macro fetch error:", e); }
    })();
  }, []);

  // Load history
  const loadH = useCallback(async (code:string, rng:string) => {
    setCLoading(true);
    try {
      const r = await fetch(`/api/stocks/${code}?period=${PM[rng]||"3mo"}`);
      if(r.ok){const d=await r.json(); setChart(d.history); setTargets(d.targetRanges||[]); setIndicators(d.indicators||null);}
    } catch { setChart([]); setTargets([]); setIndicators(null); }
    finally { setCLoading(false); }
  }, []);

  useEffect(() => { loadH(sel,range); }, [sel,range,loadH]);

  const stk = quotes.find(q=>q.code===sel);
  const isUp = stk ? stk.change>=0 : true;
  const prices = chart.map(d=>d.price).filter(Boolean);
  const allBB = showBB ? [...chart.map(d=>d.bbUpper2).filter(Boolean) as number[], ...chart.map(d=>d.bbLower2).filter(Boolean) as number[]] : [];
  const allV = [...prices,...allBB];
  const pMin = allV.length ? Math.min(...allV)*0.995 : 0;
  const pMax = allV.length ? Math.max(...allV)*1.005 : 100;
  const xInterval = Math.max(1,Math.floor(chart.length/7));
  const currentMacroScore = macroScores.find(s=>s.code===sel);

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div className="loading-pulse" style={{width:8,height:8,borderRadius:"50%",background:"#22d3ee",boxShadow:"0 0 16px rgba(34,211,238,0.5)"}} />
      <span className="mono" style={{color:"#64748b",fontSize:13}}>KABUFORECAST — データ取得中...</span>
    </div>
  );

  if(err) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <span style={{color:"#f87171",fontSize:14}}>{err}</span>
      <button onClick={()=>location.reload()} className="mono" style={{padding:"8px 20px",background:"rgba(34,211,238,0.1)",border:"1px solid #22d3ee",color:"#22d3ee",borderRadius:4,cursor:"pointer",fontSize:13}}>リロード</button>
    </div>
  );

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Header */}
      <header style={{padding:"14px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(15,23,42,0.5)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#22d3ee",boxShadow:"0 0 8px rgba(34,211,238,0.5)"}} />
            <span style={{fontSize:16,fontWeight:700,letterSpacing:2,color:"#f8fafc"}}>KABU<span style={{color:"#22d3ee"}}>FORECAST</span></span>
          </div>
          <span className="mono" style={{fontSize:11,color:"#475569"}}>Phase 3</span>
        </div>
        {updated && <span className="mono" style={{fontSize:10,color:"#475569"}}>更新: {new Date(updated).toLocaleTimeString("ja-JP")}</span>}
      </header>

      <div style={{display:"flex",minHeight:"calc(100vh - 57px)"}}>
        {/* Sidebar */}
        <aside style={{width:280,borderRight:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,23,42,0.3)",flexShrink:0,overflowY:"auto"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <div style={{fontSize:11,color:"#64748b",letterSpacing:1}}>ウォッチリスト — {quotes.length}銘柄</div>
          </div>
          {quotes.map(q => {
            const up=q.change>=0; const s=sel===q.code;
            const ms = macroScores.find(m=>m.code===q.code);
            return (
              <div key={q.code} onClick={()=>setSel(q.code)} style={{padding:"14px 16px",cursor:"pointer",borderLeft:s?"3px solid #22d3ee":"3px solid transparent",background:s?"rgba(34,211,238,0.06)":"transparent",transition:"all 0.15s",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                  <div>
                    <span className="mono" style={{color:"#94a3b8",fontSize:11,letterSpacing:1}}>{q.code}</span>
                    <span style={{color:"#e2e8f0",fontSize:14,fontWeight:600,marginLeft:8}}>{q.name}</span>
                  </div>
                  {ms && <span style={{fontSize:9,padding:"2px 6px",borderRadius:3,background:signalBg(ms.signal),color:scoreColor(ms.normalizedScore)}}>{ms.signal}</span>}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span className="mono" style={{color:"#f8fafc",fontSize:20,fontWeight:700}}>¥{q.price.toLocaleString()}</span>
                  <span className="mono" style={{color:up?"#34d399":"#f87171",fontSize:13,fontWeight:600}}>{up?"▲":"▼"} {Math.abs(q.change)} ({up?"+":""}{q.changePct.toFixed(2)}%)</span>
                </div>
              </div>
            );
          })}
          <div style={{padding:16,borderTop:"1px solid rgba(255,255,255,0.04)"}}>
            <div style={{fontSize:10,color:"#475569",letterSpacing:1,marginBottom:8}}>ポートフォリオ概況</div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,color:"#64748b"}}>上昇</span>
              <span className="mono" style={{fontSize:12,color:"#34d399"}}>{quotes.filter(q=>q.change>=0).length}銘柄</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:"#64748b"}}>下落</span>
              <span className="mono" style={{fontSize:12,color:"#f87171"}}>{quotes.filter(q=>q.change<0).length}銘柄</span>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{flex:1,padding:24,overflowY:"auto"}}>
          {stk ? (<>
            {/* Stock Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span className="mono" style={{fontSize:11,color:"#0f172a",background:"#22d3ee",padding:"2px 8px",borderRadius:3,fontWeight:700}}>{stk.code}</span>
                  <span style={{fontSize:22,fontWeight:700}}>{stk.name}</span>
                  <span style={{fontSize:14,color:"#64748b"}}>{stk.nameEn}</span>
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:16,marginTop:8}}>
                  <span className="mono" style={{fontSize:36,fontWeight:700,color:"#f8fafc"}}>¥{stk.price.toLocaleString()}</span>
                  <span className="mono" style={{fontSize:18,fontWeight:600,color:isUp?"#34d399":"#f87171"}}>{isUp?"+":""}{stk.change} ({isUp?"+":""}{stk.changePct.toFixed(2)}%)</span>
                </div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {["1M","3M","6M","1Y"].map(r=>(<button key={r} onClick={()=>setRange(r)} className="mono" style={{padding:"6px 14px",fontSize:12,fontWeight:600,border:"1px solid",borderColor:range===r?"#22d3ee":"rgba(255,255,255,0.08)",background:range===r?"rgba(34,211,238,0.1)":"transparent",color:range===r?"#22d3ee":"#64748b",borderRadius:4,cursor:"pointer"}}>{r}</button>))}
              </div>
            </div>

            {/* Indicator Summary */}
            {indicators && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
                  <SignalBadge label="RSI (14)" value={indicators.rsi?.toFixed(1)??"—"} color={indicators.rsiSignal==="買われすぎ"?"#f87171":indicators.rsiSignal==="売られすぎ"?"#34d399":"#e2e8f0"} />
                  <div style={{textAlign:"center",paddingBottom:8}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:3,background:indicators.rsiSignal==="買われすぎ"?"rgba(248,113,113,0.15)":indicators.rsiSignal==="売られすぎ"?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.05)",color:indicators.rsiSignal==="買われすぎ"?"#f87171":indicators.rsiSignal==="売られすぎ"?"#34d399":"#64748b"}}>{indicators.rsiSignal}</span></div>
                </div>
                <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
                  <SignalBadge label="MACD" value={indicators.macd?.toFixed(1)??"—"} color="#22d3ee" />
                  <div style={{textAlign:"center",paddingBottom:8}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:3,background:indicators.macdTrend==="上昇トレンド"?"rgba(52,211,153,0.15)":indicators.macdTrend==="下降トレンド"?"rgba(248,113,113,0.15)":"rgba(255,255,255,0.05)",color:indicators.macdTrend==="上昇トレンド"?"#34d399":indicators.macdTrend==="下降トレンド"?"#f87171":"#64748b"}}>{indicators.macdTrend}</span></div>
                </div>
                <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
                  <SignalBadge label="PER" value={stk.per?.toFixed(1)??"—"} color={(stk.per??99)<15?"#22d3ee":"#e2e8f0"} />
                  <div style={{textAlign:"center",paddingBottom:8}}><span style={{fontSize:10,color:"#64748b"}}>倍</span></div>
                </div>
                {currentMacroScore ? (
                  <div style={{background:signalBg(currentMacroScore.signal),border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
                    <SignalBadge label="マクロ環境" value={`${currentMacroScore.normalizedScore>0?"+":""}${currentMacroScore.normalizedScore}`} color={scoreColor(currentMacroScore.normalizedScore)} />
                    <div style={{textAlign:"center",paddingBottom:8}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:3,background:signalBg(currentMacroScore.signal),color:scoreColor(currentMacroScore.normalizedScore)}}>{currentMacroScore.signal}</span></div>
                  </div>
                ) : (
                  <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
                    <SignalBadge label="配当利回" value={stk.dividendYield?.toFixed(2)??"—"} color={(stk.dividendYield??0)>3?"#22d3ee":"#e2e8f0"} />
                    <div style={{textAlign:"center",paddingBottom:8}}><span style={{fontSize:10,color:"#64748b"}}>%</span></div>
                  </div>
                )}
              </div>
            )}

            {/* Chart */}
            <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"16px 16px 8px 0",marginBottom:12,position:"relative"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 16px",marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>株価チャート</span>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {cLoading && <div style={{display:"flex",alignItems:"center",gap:4}}><div className="loading-pulse" style={{width:6,height:6,borderRadius:"50%",background:"#22d3ee"}} /><span className="mono" style={{fontSize:10,color:"#475569"}}>読込中</span></div>}
                  <button onClick={()=>setShowBB(!showBB)} className="mono" style={{fontSize:10,padding:"3px 8px",borderRadius:3,border:"1px solid",cursor:"pointer",borderColor:showBB?"rgba(139,92,246,0.4)":"rgba(255,255,255,0.08)",background:showBB?"rgba(139,92,246,0.1)":"transparent",color:showBB?"#a78bfa":"#64748b"}}>BB</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chart} margin={{top:5,right:10,left:10,bottom:5}}>
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isUp?"#34d399":"#f87171"} stopOpacity={0.15}/><stop offset="100%" stopColor={isUp?"#34d399":"#f87171"} stopOpacity={0}/></linearGradient>
                    <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.08}/><stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02}/></linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={{stroke:"rgba(255,255,255,0.06)"}} tickLine={false} interval={xInterval} />
                  <YAxis domain={[pMin,pMax]} tick={{fontSize:10,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>`¥${Math.round(v).toLocaleString()}`} width={80} />
                  <Tooltip content={<PriceTip />} />
                  <ReferenceLine y={stk.prevClose} stroke="#475569" strokeDasharray="3 3" />
                  {showBB && <>
                    <Area type="monotone" dataKey="bbUpper2" stroke="none" fill="none" dot={false}/>
                    <Area type="monotone" dataKey="bbLower2" stroke="none" fill="url(#bbFill)" dot={false}/>
                    <Line type="monotone" dataKey="bbUpper2" stroke="#a78bfa" strokeWidth={0.5} dot={false} strokeOpacity={0.5}/>
                    <Line type="monotone" dataKey="bbLower2" stroke="#a78bfa" strokeWidth={0.5} dot={false} strokeOpacity={0.5}/>
                    <Line type="monotone" dataKey="bbUpper1" stroke="#a78bfa" strokeWidth={0.5} dot={false} strokeDasharray="2 2" strokeOpacity={0.3}/>
                    <Line type="monotone" dataKey="bbLower1" stroke="#a78bfa" strokeWidth={0.5} dot={false} strokeDasharray="2 2" strokeOpacity={0.3}/>
                  </>}
                  <Area type="monotone" dataKey="price" stroke={isUp?"#34d399":"#f87171"} strokeWidth={2} fill="url(#pg)" dot={false} activeDot={{r:4,fill:"#22d3ee",stroke:"#0f172a",strokeWidth:2}} />
                  <Line type="monotone" dataKey="ma25" stroke="#fbbf24" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:16,padding:"4px 16px",justifyContent:"center"}}>
                {[{l:"株価",c:isUp?"#34d399":"#f87171"},{l:"MA25",c:"#fbbf24"},{l:"BB ±2σ",c:"#a78bfa"},{l:"前日終値",c:"#475569"}].map(x=>(<div key={x.l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:2,background:x.c}}/><span style={{fontSize:9,color:"#64748b"}}>{x.l}</span></div>))}
              </div>
            </div>

            {/* Sub-chart RSI/MACD */}
            <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"12px 16px 8px 0",marginBottom:16}}>
              <div style={{display:"flex",gap:8,padding:"0 16px",marginBottom:8}}>
                {(["rsi","macd"] as const).map(t=>(<button key={t} onClick={()=>setSubChart(t)} className="mono" style={{fontSize:11,padding:"4px 12px",borderRadius:3,border:"1px solid",cursor:"pointer",borderColor:subChart===t?"#22d3ee":"rgba(255,255,255,0.08)",background:subChart===t?"rgba(34,211,238,0.1)":"transparent",color:subChart===t?"#22d3ee":"#64748b",fontWeight:600}}>{t.toUpperCase()}</button>))}
              </div>
              {subChart==="rsi" ? (
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={chart} margin={{top:5,right:10,left:10,bottom:5}}>
                    <defs><linearGradient id="rsiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.1}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={{stroke:"rgba(255,255,255,0.06)"}} tickLine={false} interval={xInterval}/>
                    <YAxis domain={[0,100]} ticks={[30,50,70]} tick={{fontSize:9,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} width={30}/>
                    <Tooltip content={<RsiTip />}/>
                    <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.5}/>
                    <ReferenceLine y={30} stroke="#34d399" strokeDasharray="3 3" strokeOpacity={0.5}/>
                    <Area type="monotone" dataKey="rsi" stroke="#22d3ee" strokeWidth={1.5} fill="url(#rsiFill)" dot={false} connectNulls={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={chart} margin={{top:5,right:10,left:10,bottom:5}}>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={{stroke:"rgba(255,255,255,0.06)"}} tickLine={false} interval={xInterval}/>
                    <YAxis tick={{fontSize:9,fill:"#475569",fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} width={40}/>
                    <Tooltip content={<MacdTip />}/>
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3"/>
                    <Bar dataKey="macdHist" barSize={2}>{chart.map((d,i)=><Cell key={i} fill={(d.macdHist??0)>=0?"#34d399":"#f87171"} fillOpacity={0.6}/>)}</Bar>
                    <Line type="monotone" dataKey="macd" stroke="#22d3ee" strokeWidth={1.5} dot={false} connectNulls={false}/>
                    <Line type="monotone" dataKey="macdSignal" stroke="#f472b6" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Target Price Ranges */}
            {targets.length>0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:"#94a3b8",letterSpacing:1,marginBottom:10}}>目標株価レンジ</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                  {targets.map(t=><RangeBar key={t.label} range={t}/>)}
                </div>
              </div>
            )}

            {/* === Phase 3: Macro Environment === */}
            {macroIndicators.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:"#94a3b8",letterSpacing:1,marginBottom:10}}>マクロ環境</div>

                {/* Macro Indicators Ticker */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:12}}>
                  {macroIndicators.map(mi => (
                    <div key={mi.id} style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>{mi.nameJa}</div>
                      <div className="mono" style={{fontSize:14,fontWeight:700,color:"#e2e8f0"}}>
                        {mi.id==="nikkei" ? Math.round(mi.value).toLocaleString() : mi.value.toLocaleString()}
                        <span style={{fontSize:9,color:"#64748b",marginLeft:2}}>{mi.unit}</span>
                      </div>
                      <div className="mono" style={{fontSize:10,color:mi.direction==="up"?"#34d399":mi.direction==="down"?"#f87171":"#64748b",marginTop:2}}>
                        {mi.direction==="up"?"▲":mi.direction==="down"?"▼":"—"} {mi.changePct>0?"+":""}{mi.changePct.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sensitivity Matrix for selected stock */}
                {currentMacroScore && (
                  <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>マクロ因子の影響 — {stk.name}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span className="mono" style={{fontSize:16,fontWeight:700,color:scoreColor(currentMacroScore.normalizedScore)}}>
                          {currentMacroScore.normalizedScore>0?"+":""}{currentMacroScore.normalizedScore}
                        </span>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:signalBg(currentMacroScore.signal),color:scoreColor(currentMacroScore.normalizedScore)}}>
                          {currentMacroScore.signal}
                        </span>
                      </div>
                    </div>
                    <div style={{padding:"8px 0"}}>
                      {currentMacroScore.factors.map(f => {
                        const mi = macroIndicators.find(m=>m.id===f.factorId);
                        return (
                          <div key={f.factorId} style={{display:"grid",gridTemplateColumns:"100px 80px 1fr 50px",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid rgba(255,255,255,0.02)"}}>
                            <span style={{fontSize:12,color:"#e2e8f0"}}>{f.factorName}</span>
                            <span className="mono" style={{fontSize:11,color:mi?.direction==="up"?"#34d399":mi?.direction==="down"?"#f87171":"#64748b"}}>
                              {mi?.direction==="up"?"▲ 上昇":mi?.direction==="down"?"▼ 下落":"— 横這"}
                            </span>
                            <span style={{fontSize:11,color:"#64748b"}}>{f.reason}</span>
                            <div style={{textAlign:"right"}}>
                              {f.score !== 0 ? (
                                <span className="mono" style={{fontSize:12,fontWeight:700,color:f.score>0?"#34d399":"#f87171",padding:"2px 6px",borderRadius:3,background:f.score>0?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)"}}>
                                  {f.score>0?"+":""}{f.score}
                                </span>
                              ) : (
                                <span className="mono" style={{fontSize:12,color:"#475569"}}>0</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All Stocks Macro Comparison */}
            {macroScores.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:"#94a3b8",letterSpacing:1,marginBottom:10}}>銘柄別マクロスコア比較</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {macroScores.map(ms => (
                    <div key={ms.code} onClick={()=>setSel(ms.code)} style={{background:sel===ms.code?"rgba(34,211,238,0.08)":"rgba(15,23,42,0.4)",border:sel===ms.code?"1px solid rgba(34,211,238,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"12px",textAlign:"center",cursor:"pointer",transition:"all 0.15s"}}>
                      <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{ms.name}</div>
                      <div className="mono" style={{fontSize:20,fontWeight:700,color:scoreColor(ms.normalizedScore)}}>
                        {ms.normalizedScore>0?"+":""}{ms.normalizedScore}
                      </div>
                      <div style={{marginTop:4}}>
                        <span style={{fontSize:10,padding:"2px 6px",borderRadius:3,background:signalBg(ms.signal),color:scoreColor(ms.normalizedScore)}}>{ms.signal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OHLCV */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              {[{l:"始値",v:`¥${stk.open.toLocaleString()}`},{l:"高値",v:`¥${stk.high.toLocaleString()}`},{l:"安値",v:`¥${stk.low.toLocaleString()}`},{l:"出来高",v:fmtVol(stk.volume)}].map(m=>(
                <div key={m.l} style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:"#64748b",letterSpacing:1,marginBottom:4}}>{m.l}</div>
                  <div className="mono" style={{fontSize:16,fontWeight:700}}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Fundamentals */}
            <div style={{background:"rgba(15,23,42,0.4)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:12,fontWeight:600,color:"#94a3b8",letterSpacing:1}}>ファンダメンタルズ</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",padding:"8px 0"}}>
                {[
                  {l:"時価総額",v:fmtCap(stk.marketCap),h:false},
                  {l:"PER",v:stk.per?.toFixed(1)??"—",u:"倍",h:(stk.per??99)<15},
                  {l:"PBR",v:stk.pbr?.toFixed(2)??"—",u:"倍",h:(stk.pbr??99)<1},
                  {l:"配当利回",v:stk.dividendYield?.toFixed(2)??"—",u:"%",h:(stk.dividendYield??0)>3},
                  {l:"EPS",v:stk.eps?`¥${stk.eps.toFixed(1)}`:"—",h:false},
                  {l:"52W高値",v:stk.fiftyTwoWeekHigh?`¥${stk.fiftyTwoWeekHigh.toLocaleString()}`:"—",h:false},
                ].map(m=>(
                  <div key={m.l} style={{textAlign:"center",padding:"10px 6px"}}>
                    <div style={{color:"#64748b",fontSize:10,letterSpacing:1,marginBottom:4}}>{m.l}</div>
                    <div className="mono" style={{color:m.h?"#22d3ee":"#e2e8f0",fontSize:16,fontWeight:700}}>{m.v}{m.u && <span style={{fontSize:10,color:"#64748b",marginLeft:2}}>{m.u}</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          </>) : <div style={{color:"#64748b",textAlign:"center",marginTop:80}}>銘柄を選択してください</div>}
        </main>
      </div>
    </div>
  );
}
