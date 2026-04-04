"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Bar, Cell,
  ComposedChart,
} from "recharts";

// --- Types ---
interface StockQuote { code:string; name:string; nameEn:string; sector:string; price:number; prevClose:number; change:number; changePct:number; open:number; high:number; low:number; volume:number; marketCap:number; per:number|null; pbr:number|null; dividendYield:number|null; eps:number|null; fiftyTwoWeekHigh:number|null; fiftyTwoWeekLow:number|null; }
interface ChartPoint { date:string; price:number; volume:number; ma25:number|null; ma75:number|null; bbUpper2:number|null; bbUpper1:number|null; bbMid:number|null; bbLower1:number|null; bbLower2:number|null; rsi:number|null; macd:number|null; macdSignal:number|null; macdHist:number|null; }
interface TargetRange { label:string; period:string; low:number; mid:number; high:number; currentPrice:number; positionPct:number; }
interface Indicators { rsi:number|null; rsiSignal:string; macd:number|null; macdSignal:number|null; macdHistogram:number|null; macdTrend:string; }
interface MacroIndicator { id:string; name:string; nameJa:string; value:number; prevValue:number; change:number; changePct:number; unit:string; direction:"up"|"down"|"flat"; }
interface SensitivityEntry { factorId:string; factorName:string; score:number; reason:string; }
interface StockMacroScore { code:string; name:string; totalScore:number; maxPossible:number; normalizedScore:number; signal:string; factors:SensitivityEntry[]; }
interface FinancialPeriod { date:string; fiscalYear:string; revenue:number|null; operatingIncome:number|null; netIncome:number|null; operatingMargin:number|null; eps:number|null; }

function fmtVol(n:number){if(n>=1e8)return(n/1e8).toFixed(1)+"億";if(n>=1e4)return(n/1e4).toFixed(0)+"万";return n.toLocaleString();}
function fmtCap(n:number){if(n>=1e12)return(n/1e12).toFixed(1)+"兆";if(n>=1e8)return(n/1e8).toFixed(0)+"億";return n.toLocaleString();}
function fmtBigNum(n:number){const abs=Math.abs(n);const sign=n<0?"-":"";if(abs>=1e12)return sign+(abs/1e12).toFixed(2)+"兆";if(abs>=1e8)return sign+(abs/1e8).toFixed(0)+"億";if(abs>=1e4)return sign+(abs/1e4).toFixed(0)+"万";return sign+abs.toLocaleString();}
const PM:Record<string,string>={"1M":"1mo","3M":"3mo","6M":"6mo","1Y":"1y"};

function useIsMobile(){const[m,setM]=useState(false);useEffect(()=>{const c=()=>setM(window.innerWidth<768);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c);},[]);return m;}

// Card wrapper
const Card = ({children,style,...p}:{children:React.ReactNode;style?:React.CSSProperties;[k:string]:any}) => (
  <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",border:"1px solid var(--border-light)",...style}} {...p}>{children}</div>
);

// --- Tooltips ---
function PriceTip({active,payload,label}:any){
  if(!active||!payload?.length)return null;const d=payload[0]?.payload;
  return(<div className="mono" style={{background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:11,boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
    <div style={{color:"var(--text-muted)",marginBottom:3}}>{label}</div>
    <div style={{color:"var(--text-primary)",fontWeight:700}}>¥{d?.price?.toLocaleString()}</div>
    {d?.ma25&&<div style={{color:"var(--amber)",fontSize:10}}>MA25: ¥{d.ma25.toLocaleString()}</div>}
    <div style={{color:"var(--text-dim)",fontSize:10,marginTop:2}}>出来高: {fmtVol(d?.volume||0)}</div>
  </div>);
}
function RsiTip({active,payload,label}:any){
  if(!active||!payload?.length)return null;const v=payload[0]?.value;
  return(<div className="mono" style={{background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:"6px 10px",fontSize:11,boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
    <div style={{color:"var(--text-muted)"}}>{label}</div>
    <div style={{color:v>=70?"var(--red)":v<=30?"var(--green)":"var(--text-primary)",fontWeight:700}}>RSI: {v?.toFixed(1)}</div>
  </div>);
}
function MacdTip({active,payload,label}:any){
  if(!active||!payload?.length)return null;const d=payload[0]?.payload;
  return(<div className="mono" style={{background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:"6px 10px",fontSize:11,boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
    <div style={{color:"var(--text-muted)"}}>{label}</div>
    {d?.macd!=null&&<div style={{color:"var(--accent)"}}>MACD: {d.macd.toFixed(1)}</div>}
    {d?.macdSignal!=null&&<div style={{color:"var(--purple)"}}>Signal: {d.macdSignal.toFixed(1)}</div>}
  </div>);
}

// Range Bar
function RangeBar({range,compact}:{range:TargetRange;compact?:boolean}){
  const pos=Math.max(0,Math.min(100,range.positionPct));
  return(<Card style={{padding:compact?"12px":"16px"}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
      <span className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)"}}>{range.label}</span>
      <span className="mono" style={{fontSize:10,color:"var(--text-muted)"}}>{range.period}</span>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
      <span className="mono" style={{fontSize:11,color:"var(--red)"}}>{range.low.toLocaleString()}</span>
      <span className="mono" style={{fontSize:11,color:"var(--accent)",fontWeight:600}}>{range.mid.toLocaleString()}</span>
      <span className="mono" style={{fontSize:11,color:"var(--green)"}}>{range.high.toLocaleString()}</span>
    </div>
    <div style={{position:"relative",height:6,background:"#F0EEE9",borderRadius:3,overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,right:0,top:0,bottom:0,background:"linear-gradient(90deg,#FECDD3,#FDE68A,#A7F3D0)",opacity:0.6,borderRadius:3}}/>
      <div style={{position:"absolute",left:`${pos}%`,top:-3,width:12,height:12,background:"var(--accent)",borderRadius:"50%",transform:"translateX(-50%)",boxShadow:"0 2px 6px rgba(30,58,95,0.3)",border:"2px solid #fff"}}/>
    </div>
    <div style={{textAlign:"center",marginTop:6}}>
      <span className="mono" style={{fontSize:11,color:"var(--text-muted)"}}>現在値 </span>
      <span className="mono" style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>¥{range.currentPrice.toLocaleString()}</span>
    </div>
  </Card>);
}

function scoreColor(s:number){if(s>=30)return"var(--green)";if(s>=10)return"#34D399";if(s<=-30)return"var(--red)";if(s<=-10)return"#FDA4AF";return"var(--text-muted)";}
function signalBg(s:string){if(s.includes("追い風"))return"var(--green-bg)";if(s.includes("向かい風"))return"var(--red-bg)";return"var(--bg-card-alt)";}
function signalBorder(s:string){if(s.includes("追い風"))return"var(--green)";if(s.includes("向かい風"))return"var(--red)";return"var(--border)";}

// === Main ===
export default function Dashboard(){
  const mobile=useIsMobile();
  const[quotes,setQuotes]=useState<StockQuote[]>([]);
  const[sel,setSel]=useState("6098");
  const[chart,setChart]=useState<ChartPoint[]>([]);
  const[range,setRange]=useState("3M");
  const[loading,setLoading]=useState(true);
  const[cLoading,setCLoading]=useState(false);
  const[updated,setUpdated]=useState("");
  const[err,setErr]=useState<string|null>(null);
  const[targets,setTargets]=useState<TargetRange[]>([]);
  const[indicators,setIndicators]=useState<Indicators|null>(null);
  const[showBB,setShowBB]=useState(true);
  const[subChart,setSubChart]=useState<"rsi"|"macd">("rsi");
  const[macroIndicators,setMacroIndicators]=useState<MacroIndicator[]>([]);
  const[macroScores,setMacroScores]=useState<StockMacroScore[]>([]);
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[financials,setFinancials]=useState<FinancialPeriod[]>([]);
  // AI Analysis state
  const[aiTab,setAiTab]=useState<"consensus"|"report">("consensus");
  const[aiLoading,setAiLoading]=useState(false);
  const[consensusForm,setConsensusForm]=useState({targetPrice:"",rating:"中立",analystCount:"",comment:""});
  const[reportText,setReportText]=useState("");
  const[aiResult,setAiResult]=useState<any>(null);

  useEffect(()=>{(async()=>{try{const r=await fetch("/api/stocks");if(!r.ok)throw new Error();const d=await r.json();setQuotes(d.quotes);setUpdated(d.updatedAt);setErr(null);}catch{setErr("データの取得に失敗しました");}finally{setLoading(false);}})();const iv=setInterval(async()=>{try{const r=await fetch("/api/stocks");if(r.ok){const d=await r.json();setQuotes(d.quotes);setUpdated(d.updatedAt);}}catch{}},300000);return()=>clearInterval(iv);},[]);
  useEffect(()=>{(async()=>{try{const r=await fetch("/api/macro");if(!r.ok)return;const d=await r.json();setMacroIndicators(d.indicators||[]);setMacroScores(d.scores||[]);}catch(e){console.error(e);}})();},[]);
  const loadH=useCallback(async(code:string,rng:string)=>{setCLoading(true);try{const r=await fetch(`/api/stocks/${code}?period=${PM[rng]||"3mo"}`);if(r.ok){const d=await r.json();setChart(d.history);setTargets(d.targetRanges||[]);setIndicators(d.indicators||null);setFinancials(d.financials||[]);}}catch{setChart([]);setTargets([]);setIndicators(null);setFinancials([]);}finally{setCLoading(false);}},[]);
  useEffect(()=>{loadH(sel,range);},[sel,range,loadH]);

  const stk=quotes.find(q=>q.code===sel);
  const isUp=stk?stk.change>=0:true;
  const prices=chart.map(d=>d.price).filter(Boolean);
  const allBB=showBB?[...chart.map(d=>d.bbUpper2).filter(Boolean) as number[],...chart.map(d=>d.bbLower2).filter(Boolean) as number[]]:[];
  const allV=[...prices,...allBB];
  const pMin=allV.length?Math.min(...allV)*0.995:0;
  const pMax=allV.length?Math.max(...allV)*1.005:100;
  const xInterval=Math.max(1,Math.floor(chart.length/(mobile?5:7)));
  const currentMS=macroScores.find(s=>s.code===sel);

  if(loading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,background:"var(--bg)"}}>
    <div className="pulse-dot" style={{width:10,height:10,borderRadius:"50%",background:"var(--accent)"}}/>
    <span className="sans" style={{color:"var(--text-muted)",fontSize:14,fontWeight:500}}>KABUFORECAST</span>
  </div>);
  if(err)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,background:"var(--bg)"}}>
    <span style={{color:"var(--red)",fontSize:14}}>{err}</span>
    <button onClick={()=>location.reload()} className="sans" style={{padding:"8px 24px",background:"var(--accent)",color:"#fff",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600}}>リロード</button>
  </div>);

  const pad=mobile?12:24;

  return(
    <div style={{minHeight:"100vh",overflowX:"hidden",background:"var(--bg)"}}>
      {/* Header */}
      <header style={{padding:mobile?"10px 14px":"12px 24px",background:"#fff",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
        <div style={{display:"flex",alignItems:"center",gap:mobile?10:16}}>
          {mobile&&<button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:20,cursor:"pointer",padding:0,lineHeight:1}}>☰</button>}
          <span className="sans" style={{fontSize:mobile?15:17,fontWeight:700,color:"var(--accent)",letterSpacing:0.5}}>KABU<span style={{color:"var(--amber)"}}>FORECAST</span></span>
        </div>
        {updated&&<span className="mono" style={{fontSize:10,color:"var(--text-dim)"}}>更新 {new Date(updated).toLocaleTimeString("ja-JP")}</span>}
      </header>

      {/* Mobile stock strip */}
      {mobile&&(
        <div style={{display:"flex",overflowX:"auto",gap:8,padding:"10px 12px",background:"#fff",borderBottom:"1px solid var(--border)",WebkitOverflowScrolling:"touch"}}>
          {quotes.map(q=>{const up=q.change>=0;const s=sel===q.code;const ms=macroScores.find(m=>m.code===q.code);
            return(<button key={q.code} onClick={()=>setSel(q.code)} style={{flexShrink:0,padding:"8px 14px",borderRadius:10,border:s?"2px solid var(--accent)":"1px solid var(--border)",background:s?"#F0F4FA":"#fff",cursor:"pointer",minWidth:115,textAlign:"left",transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                <span className="mono" style={{fontSize:10,color:"var(--text-muted)"}}>{q.code}</span>
                {ms&&<span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:signalBg(ms.signal),color:scoreColor(ms.normalizedScore),fontWeight:600}}>{ms.signal}</span>}
              </div>
              <div className="mono" style={{fontSize:15,fontWeight:700,color:"var(--text-primary)"}}>{q.price.toLocaleString()}</div>
              <div className="mono" style={{fontSize:10,color:up?"var(--green)":"var(--red)"}}>{up?"▲":"▼"}{q.changePct.toFixed(2)}%</div>
            </button>);
          })}
        </div>
      )}

      {/* Mobile drawer */}
      {mobile&&sidebarOpen&&(
        <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.3)",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{width:280,height:"100%",background:"#fff",overflowY:"auto",boxShadow:"4px 0 24px rgba(0,0,0,0.1)"}}>
            <div style={{padding:"16px",fontSize:12,fontWeight:600,color:"var(--text-muted)",borderBottom:"1px solid var(--border)"}}>ウォッチリスト</div>
            {quotes.map(q=>{const up=q.change>=0;const s=sel===q.code;
              return(<div key={q.code} onClick={()=>{setSel(q.code);setSidebarOpen(false);}} style={{padding:"14px 16px",cursor:"pointer",borderLeft:s?"3px solid var(--accent)":"3px solid transparent",background:s?"#F0F4FA":"transparent",borderBottom:"1px solid var(--border-light)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)"}}>{q.name}</span>
                  <span style={{fontSize:10,color:"var(--text-muted)"}}>{q.sector}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span className="mono" style={{fontSize:18,fontWeight:700}}>¥{q.price.toLocaleString()}</span>
                  <span className="mono" style={{fontSize:12,color:up?"var(--green)":"var(--red)"}}>{up?"▲":"▼"}{q.changePct.toFixed(2)}%</span>
                </div>
              </div>);
            })}
          </div>
        </div>
      )}

      <div style={{display:"flex",minHeight:"calc(100vh - 53px)"}}>
        {/* Desktop sidebar */}
        {!mobile&&(
          <aside style={{width:280,background:"#fff",borderRight:"1px solid var(--border)",flexShrink:0,overflowY:"auto"}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)"}}>
              <span className="sans" style={{fontSize:11,fontWeight:600,color:"var(--text-muted)",letterSpacing:1}}>ウォッチリスト</span>
            </div>
            {quotes.map(q=>{const up=q.change>=0;const s=sel===q.code;const ms=macroScores.find(m=>m.code===q.code);
              return(<div key={q.code} onClick={()=>setSel(q.code)} style={{padding:"14px 16px",cursor:"pointer",borderLeft:s?"3px solid var(--accent)":"3px solid transparent",background:s?"#F0F4FA":"transparent",transition:"all 0.15s",borderBottom:"1px solid var(--border-light)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div><span className="mono" style={{fontSize:11,color:"var(--text-muted)"}}>{q.code}</span><span style={{fontSize:14,fontWeight:600,marginLeft:8}}>{q.name}</span></div>
                  {ms&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:signalBg(ms.signal),color:scoreColor(ms.normalizedScore),fontWeight:600,border:`1px solid ${signalBorder(ms.signal)}`}}>{ms.signal}</span>}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span className="mono" style={{fontSize:20,fontWeight:700}}>¥{q.price.toLocaleString()}</span>
                  <span className="mono" style={{color:up?"var(--green)":"var(--red)",fontSize:13,fontWeight:600}}>{up?"▲":"▼"} {Math.abs(q.change)} ({up?"+":""}{q.changePct.toFixed(2)}%)</span>
                </div>
              </div>);
            })}
          </aside>
        )}

        {/* Main */}
        <main style={{flex:1,padding:pad,overflowY:"auto",overflowX:"hidden",maxWidth:"100%"}} className="fade-in">
          {stk?(<>
            {/* Stock Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:mobile?14:20,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span className="mono" style={{fontSize:11,color:"#fff",background:"var(--accent)",padding:"2px 8px",borderRadius:4,fontWeight:600}}>{stk.code}</span>
                  <span className="sans" style={{fontSize:mobile?19:24,fontWeight:700,color:"var(--accent)"}}>{stk.name}</span>
                  {!mobile&&<span style={{fontSize:14,color:"var(--text-muted)"}}>{stk.nameEn}</span>}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:mobile?8:16,marginTop:4}}>
                  <span className="mono" style={{fontSize:mobile?30:40,fontWeight:700}}>¥{stk.price.toLocaleString()}</span>
                  <span className="mono" style={{fontSize:mobile?15:20,fontWeight:600,color:isUp?"var(--green)":"var(--red)"}}>{isUp?"+":""}{stk.change} ({isUp?"+":""}{stk.changePct.toFixed(2)}%)</span>
                </div>
              </div>
              <div style={{display:"flex",gap:3,background:"var(--bg-card-alt)",borderRadius:8,padding:2,border:"1px solid var(--border-light)"}}>
                {["1M","3M","6M","1Y"].map(r=>(<button key={r} onClick={()=>setRange(r)} className="mono" style={{padding:mobile?"5px 11px":"6px 14px",fontSize:mobile?11:12,fontWeight:600,border:"none",borderRadius:6,background:range===r?"#fff":"transparent",color:range===r?"var(--accent)":"var(--text-muted)",cursor:"pointer",boxShadow:range===r?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>{r}</button>))}
              </div>
            </div>

            {/* Indicator cards */}
            {indicators&&(
              <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:mobile?8:12,marginBottom:mobile?14:18}}>
                <Card style={{padding:"12px 14px",borderLeft:"3px solid var(--accent)"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>RSI (14)</div>
                  <div className="mono" style={{fontSize:18,fontWeight:700,color:indicators.rsiSignal==="買われすぎ"?"var(--red)":indicators.rsiSignal==="売られすぎ"?"var(--green)":"var(--text-primary)"}}>{indicators.rsi?.toFixed(1)??"—"}</div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:indicators.rsiSignal==="買われすぎ"?"var(--red-bg)":indicators.rsiSignal==="売られすぎ"?"var(--green-bg)":"var(--bg-card-alt)",color:indicators.rsiSignal==="買われすぎ"?"var(--red)":indicators.rsiSignal==="売られすぎ"?"var(--green)":"var(--text-muted)",fontWeight:500}}>{indicators.rsiSignal}</span>
                </Card>
                <Card style={{padding:"12px 14px",borderLeft:"3px solid var(--purple)"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>MACD</div>
                  <div className="mono" style={{fontSize:18,fontWeight:700,color:"var(--accent)"}}>{indicators.macd?.toFixed(1)??"—"}</div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:indicators.macdTrend==="上昇トレンド"?"var(--green-bg)":indicators.macdTrend==="下降トレンド"?"var(--red-bg)":"var(--bg-card-alt)",color:indicators.macdTrend==="上昇トレンド"?"var(--green)":indicators.macdTrend==="下降トレンド"?"var(--red)":"var(--text-muted)",fontWeight:500}}>{indicators.macdTrend}</span>
                </Card>
                <Card style={{padding:"12px 14px",borderLeft:"3px solid var(--amber)"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>PER</div>
                  <div className="mono" style={{fontSize:18,fontWeight:700}}>{stk.per?.toFixed(1)??"—"}<span style={{fontSize:11,color:"var(--text-muted)",marginLeft:2}}>倍</span></div>
                </Card>
                {currentMS?(
                  <Card style={{padding:"12px 14px",borderLeft:`3px solid ${signalBorder(currentMS.signal)}`,background:signalBg(currentMS.signal)}}>
                    <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>マクロ環境</div>
                    <div className="mono" style={{fontSize:18,fontWeight:700,color:scoreColor(currentMS.normalizedScore)}}>{currentMS.normalizedScore>0?"+":""}{currentMS.normalizedScore}</div>
                    <span style={{fontSize:10,fontWeight:600,color:scoreColor(currentMS.normalizedScore)}}>{currentMS.signal}</span>
                  </Card>
                ):(
                  <Card style={{padding:"12px 14px",borderLeft:"3px solid var(--green)"}}>
                    <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>配当利回</div>
                    <div className="mono" style={{fontSize:18,fontWeight:700}}>{stk.dividendYield?.toFixed(2)??"—"}<span style={{fontSize:11,color:"var(--text-muted)",marginLeft:2}}>%</span></div>
                  </Card>
                )}
              </div>
            )}

            {/* Chart */}
            <Card style={{padding:mobile?"14px 6px 8px 0":"20px 16px 10px 0",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:mobile?"0 10px":"0 16px",marginBottom:8}}>
                <span className="sans" style={{fontSize:13,fontWeight:600,color:"var(--accent)"}}>株価チャート</span>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {cLoading&&<div className="pulse-dot" style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)"}}/>}
                  <button onClick={()=>setShowBB(!showBB)} className="mono" style={{fontSize:10,padding:"3px 10px",borderRadius:5,border:"1px solid",cursor:"pointer",borderColor:showBB?"var(--purple)":"var(--border)",background:showBB?"var(--purple-bg)":"transparent",color:showBB?"var(--purple)":"var(--text-muted)",fontWeight:500}}>BB</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={mobile?200:280}>
                <AreaChart data={chart} margin={{top:5,right:mobile?4:10,left:mobile?0:10,bottom:5}}>
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isUp?"#059669":"#E11D48"} stopOpacity={0.12}/><stop offset="100%" stopColor={isUp?"#059669":"#E11D48"} stopOpacity={0}/></linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={{stroke:"var(--border-light)"}} tickLine={false} interval={xInterval}/>
                  <YAxis domain={[pMin,pMax]} tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>`¥${Math.round(v).toLocaleString()}`} width={mobile?55:78}/>
                  <Tooltip content={<PriceTip/>}/>
                  <ReferenceLine y={stk.prevClose} stroke="#D4D4D4" strokeDasharray="3 3"/>
                  {showBB&&<><Line type="monotone" dataKey="bbUpper2" stroke="var(--purple)" strokeWidth={0.5} dot={false} strokeOpacity={0.4}/><Line type="monotone" dataKey="bbLower2" stroke="var(--purple)" strokeWidth={0.5} dot={false} strokeOpacity={0.4}/></>}
                  <Area type="monotone" dataKey="price" stroke={isUp?"var(--green)":"var(--red)"} strokeWidth={2} fill="url(#pg)" dot={false} activeDot={{r:4,fill:"var(--accent)",stroke:"#fff",strokeWidth:2}}/>
                  <Line type="monotone" dataKey="ma25" stroke="var(--amber)" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* RSI / MACD sub chart */}
            <Card style={{padding:mobile?"10px 6px 10px 0":"14px 16px 12px 0",marginBottom:14}}>
              <div style={{display:"flex",gap:4,padding:mobile?"0 10px":"0 16px",marginBottom:8}}>
                {(["rsi","macd"] as const).map(t=>(<button key={t} onClick={()=>setSubChart(t)} className="mono" style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",background:subChart===t?"var(--accent)":"var(--bg-card-alt)",color:subChart===t?"#fff":"var(--text-muted)",fontWeight:600,transition:"all 0.15s"}}>{t.toUpperCase()}</button>))}
              </div>
              {subChart==="rsi"?(
                <>
                <ResponsiveContainer width="100%" height={mobile?160:220}>
                  <AreaChart data={chart} margin={{top:5,right:mobile?4:10,left:mobile?0:10,bottom:5}}>
                    <defs><linearGradient id="rsiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.08}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="date" tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={{stroke:"var(--border-light)"}} tickLine={false} interval={xInterval}/>
                    <YAxis domain={[0,100]} ticks={[20,30,50,70,80]} tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={false} tickLine={false} width={mobile?25:35}/>
                    <Tooltip content={<RsiTip/>}/><ReferenceLine y={70} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.4}/><ReferenceLine y={30} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.4}/><ReferenceLine y={50} stroke="#D4D4D4" strokeDasharray="2 4" strokeOpacity={0.3}/>
                    <Area type="monotone" dataKey="rsi" stroke="var(--accent)" strokeWidth={1.5} fill="url(#rsiFill)" dot={false} connectNulls={false}/>
                  </AreaChart>
                </ResponsiveContainer>
                {/* RSI解説 */}
                <div style={{padding:mobile?"10px 12px":"12px 16px",borderTop:"1px solid var(--border-light)",marginTop:4}}>
                  <div style={{fontSize:mobile?10:11,color:"var(--text-muted)",lineHeight:1.7}}>
                    <span style={{fontWeight:600,color:"var(--accent)"}}>RSI（相対力指数）</span>：直近14日間の上昇・下落のバランスを0〜100で表示。
                    <span style={{color:"var(--red)",fontWeight:500}}>70以上</span>は買われすぎ（過熱）、
                    <span style={{color:"var(--green)",fontWeight:500}}>30以下</span>は売られすぎ（反発の可能性）。
                    50付近は中立。ただし強いトレンド時は70超えでもさらに上昇することがある。
                  </div>
                </div>
                </>
              ):(
                <>
                <ResponsiveContainer width="100%" height={mobile?160:220}>
                  <ComposedChart data={chart} margin={{top:5,right:mobile?4:10,left:mobile?0:10,bottom:5}}>
                    <XAxis dataKey="date" tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={{stroke:"var(--border-light)"}} tickLine={false} interval={xInterval}/>
                    <YAxis tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={false} tickLine={false} width={mobile?35:45}/><Tooltip content={<MacdTip/>}/><ReferenceLine y={0} stroke="#D4D4D4" strokeDasharray="3 3"/>
                    <Bar dataKey="macdHist" barSize={mobile?2:3}>{chart.map((d,i)=><Cell key={i} fill={(d.macdHist??0)>=0?"var(--green)":"var(--red)"} fillOpacity={0.5}/>)}</Bar>
                    <Line type="monotone" dataKey="macd" stroke="var(--accent)" strokeWidth={1.5} dot={false} connectNulls={false}/>
                    <Line type="monotone" dataKey="macdSignal" stroke="var(--purple)" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
                {/* MACD解説 */}
                <div style={{padding:mobile?"10px 12px":"12px 16px",borderTop:"1px solid var(--border-light)",marginTop:4}}>
                  <div style={{fontSize:mobile?10:11,color:"var(--text-muted)",lineHeight:1.7}}>
                    <span style={{fontWeight:600,color:"var(--accent)"}}>MACD</span>：短期（12日）と長期（26日）の移動平均の差でトレンド転換を探る。
                    <span style={{color:"var(--accent)",fontWeight:500}}>MACDライン</span>が
                    <span style={{color:"var(--purple)",fontWeight:500}}>シグナルライン</span>を上抜け → 買いシグナル（ゴールデンクロス）、下抜け → 売りシグナル（デッドクロス）。
                    <span style={{color:"var(--green)",fontWeight:500}}>緑の棒</span>は上昇の勢い、
                    <span style={{color:"var(--red)",fontWeight:500}}>赤の棒</span>は下落の勢い。RSIと併用すると信頼度が上がる。
                  </div>
                </div>
                </>
              )}
            </Card>

            {/* Target Ranges */}
            {targets.length>0&&(<div style={{marginBottom:14}}>
              <div className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>目標株価レンジ</div>
              <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(3,1fr)",gap:mobile?8:12}}>
                {targets.map(t=><RangeBar key={t.label} range={t} compact={mobile}/>)}
              </div>
            </div>)}

            {/* Macro */}
            {macroIndicators.length>0&&(<div style={{marginBottom:14}}>
              <div className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>マクロ環境</div>
              <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(3,1fr)":"repeat(6,1fr)",gap:mobile?6:8,marginBottom:10}}>
                {macroIndicators.map(mi=>(<Card key={mi.id} style={{padding:mobile?"8px 6px":"12px",textAlign:"center"}}>
                  <div style={{fontSize:mobile?9:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>{mi.nameJa}</div>
                  <div className="mono" style={{fontSize:mobile?12:15,fontWeight:700}}>{mi.id==="nikkei"?Math.round(mi.value).toLocaleString():mi.value.toLocaleString()}</div>
                  <div className="mono" style={{fontSize:mobile?9:10,color:mi.direction==="up"?"var(--green)":mi.direction==="down"?"var(--red)":"var(--text-dim)",marginTop:1}}>{mi.direction==="up"?"▲":mi.direction==="down"?"▼":"—"}{mi.changePct>0?"+":""}{mi.changePct.toFixed(2)}%</div>
                </Card>))}
              </div>

              {currentMS&&(<Card style={{overflow:"hidden"}}>
                <div style={{padding:mobile?"10px 12px":"12px 16px",borderBottom:"1px solid var(--border-light)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span className="sans" style={{fontSize:12,fontWeight:600,color:"var(--text-muted)"}}>マクロ因子</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span className="mono" style={{fontSize:16,fontWeight:700,color:scoreColor(currentMS.normalizedScore)}}>{currentMS.normalizedScore>0?"+":""}{currentMS.normalizedScore}</span>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:signalBg(currentMS.signal),color:scoreColor(currentMS.normalizedScore),fontWeight:600,border:`1px solid ${signalBorder(currentMS.signal)}`}}>{currentMS.signal}</span>
                  </div>
                </div>
                {currentMS.factors.map(f=>{const mi=macroIndicators.find(m=>m.id===f.factorId);
                  return mobile?(
                    <div key={f.factorId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:"1px solid var(--border-light)"}}>
                      <div><span style={{fontSize:12,fontWeight:500}}>{f.factorName}</span><span className="mono" style={{fontSize:10,color:mi?.direction==="up"?"var(--green)":mi?.direction==="down"?"var(--red)":"var(--text-dim)",marginLeft:6}}>{mi?.direction==="up"?"▲":mi?.direction==="down"?"▼":"—"}</span></div>
                      {f.score!==0?<span className="mono" style={{fontSize:13,fontWeight:700,color:f.score>0?"var(--green)":"var(--red)",padding:"2px 8px",borderRadius:4,background:f.score>0?"var(--green-bg)":"var(--red-bg)"}}>{f.score>0?"+":""}{f.score}</span>:<span className="mono" style={{fontSize:12,color:"var(--text-dim)"}}>0</span>}
                    </div>
                  ):(
                    <div key={f.factorId} style={{display:"grid",gridTemplateColumns:"100px 80px 1fr 50px",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--border-light)"}}>
                      <span style={{fontSize:12,fontWeight:500}}>{f.factorName}</span>
                      <span className="mono" style={{fontSize:11,color:mi?.direction==="up"?"var(--green)":mi?.direction==="down"?"var(--red)":"var(--text-dim)"}}>{mi?.direction==="up"?"▲ 上昇":mi?.direction==="down"?"▼ 下落":"— 横這"}</span>
                      <span style={{fontSize:11,color:"var(--text-muted)"}}>{f.reason}</span>
                      <div style={{textAlign:"right"}}>{f.score!==0?<span className="mono" style={{fontSize:12,fontWeight:700,color:f.score>0?"var(--green)":"var(--red)",padding:"2px 8px",borderRadius:4,background:f.score>0?"var(--green-bg)":"var(--red-bg)"}}>{f.score>0?"+":""}{f.score}</span>:<span className="mono" style={{fontSize:12,color:"var(--text-dim)"}}>0</span>}</div>
                    </div>
                  );
                })}
              </Card>)}
            </div>)}

            {/* Macro comparison */}
            {macroScores.length>0&&(<div style={{marginBottom:14}}>
              <div className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>銘柄別マクロスコア</div>
              <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(3,1fr)":"repeat(5,1fr)",gap:mobile?6:8}}>
                {macroScores.map(ms=>(<Card key={ms.code} onClick={()=>setSel(ms.code)} style={{padding:mobile?"10px 6px":"14px",textAlign:"center",cursor:"pointer",borderLeft:sel===ms.code?`3px solid var(--accent)`:"3px solid transparent",transition:"all 0.15s"}}>
                  <div style={{fontSize:mobile?9:11,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>{mobile?ms.code:ms.name}</div>
                  <div className="mono" style={{fontSize:mobile?18:22,fontWeight:700,color:scoreColor(ms.normalizedScore)}}>{ms.normalizedScore>0?"+":""}{ms.normalizedScore}</div>
                  <span style={{fontSize:mobile?8:10,fontWeight:600,color:scoreColor(ms.normalizedScore)}}>{ms.signal}</span>
                </Card>))}
              </div>
            </div>)}

            {/* OHLCV */}
            <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:mobile?8:12,marginBottom:14}}>
              {[{l:"始値",v:`¥${stk.open.toLocaleString()}`},{l:"高値",v:`¥${stk.high.toLocaleString()}`},{l:"安値",v:`¥${stk.low.toLocaleString()}`},{l:"出来高",v:fmtVol(stk.volume)}].map(m=>(
                <Card key={m.l} style={{padding:mobile?"10px 12px":"14px 16px"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:3,fontWeight:500}}>{m.l}</div>
                  <div className="mono" style={{fontSize:mobile?15:18,fontWeight:700}}>{m.v}</div>
                </Card>
              ))}
            </div>

            {/* Fundamentals */}
            <Card style={{marginBottom:14}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-light)",fontSize:13,fontWeight:700,color:"var(--accent)"}}>ファンダメンタルズ</div>
              <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(3,1fr)":"repeat(6,1fr)",padding:"8px 0"}}>
                {[
                  {l:"時価総額",v:fmtCap(stk.marketCap),h:false},
                  {l:"PER",v:stk.per?.toFixed(1)??"—",u:"倍",h:(stk.per??99)<15},
                  {l:"PBR",v:stk.pbr?.toFixed(2)??"—",u:"倍",h:(stk.pbr??99)<1},
                  {l:"配当利回",v:stk.dividendYield?.toFixed(2)??"—",u:"%",h:(stk.dividendYield??0)>3},
                  {l:"EPS",v:stk.eps?`¥${stk.eps.toFixed(1)}`:"—",h:false},
                  {l:"52W高値",v:stk.fiftyTwoWeekHigh?`¥${stk.fiftyTwoWeekHigh.toLocaleString()}`:"—",h:false},
                ].map(m=>(
                  <div key={m.l} style={{textAlign:"center",padding:mobile?"8px 4px":"12px 6px"}}>
                    <div style={{color:"var(--text-muted)",fontSize:mobile?9:10,fontWeight:500,marginBottom:3}}>{m.l}</div>
                    <div className="mono" style={{color:m.h?"var(--accent)":"var(--text-primary)",fontSize:mobile?14:17,fontWeight:700}}>{m.v}{m.u&&<span style={{fontSize:10,color:"var(--text-muted)",marginLeft:1}}>{m.u}</span>}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Company Financials */}
            {financials.length>0&&financials.some(f=>f.revenue!==null)&&(
              <Card style={{marginBottom:14,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-light)",fontSize:13,fontWeight:700,color:"var(--accent)"}}>企業業績（年次）</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{borderBottom:"1px solid var(--border)"}}>
                        <th style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"left",fontSize:mobile?10:11,fontWeight:600,color:"var(--text-muted)",whiteSpace:"nowrap"}}>決算期</th>
                        <th style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right",fontSize:mobile?10:11,fontWeight:600,color:"var(--text-muted)",whiteSpace:"nowrap"}}>売上高</th>
                        <th style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right",fontSize:mobile?10:11,fontWeight:600,color:"var(--text-muted)",whiteSpace:"nowrap"}}>純利益</th>
                        <th style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right",fontSize:mobile?10:11,fontWeight:600,color:"var(--text-muted)",whiteSpace:"nowrap"}}>純利益率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.map((f,i)=>{
                        const prev=i>0?financials[i-1]:null;
                        const revGrowth=prev?.revenue&&f.revenue?((f.revenue-prev.revenue)/Math.abs(prev.revenue)*100):null;
                        const netGrowth=prev?.netIncome&&f.netIncome?((f.netIncome-prev.netIncome)/Math.abs(prev.netIncome)*100):null;
                        const netMargin=f.revenue&&f.netIncome?Math.round((f.netIncome/f.revenue)*1000)/10:null;
                        return(
                          <tr key={f.date} style={{borderBottom:"1px solid var(--border-light)"}}>
                            <td style={{padding:mobile?"8px 10px":"10px 16px",fontSize:mobile?11:12,fontWeight:600,color:"var(--accent)"}}>{f.fiscalYear}</td>
                            <td style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right"}}>
                              <div className="mono" style={{fontSize:mobile?12:14,fontWeight:600}}>{f.revenue?fmtBigNum(f.revenue):"—"}</div>
                              {revGrowth!==null&&<div className="mono" style={{fontSize:9,color:revGrowth>=0?"var(--green)":"var(--red)",marginTop:1}}>前年比 {revGrowth>=0?"+":""}{revGrowth.toFixed(1)}%</div>}
                            </td>
                            <td style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right"}}>
                              <div className="mono" style={{fontSize:mobile?12:14,fontWeight:600}}>{f.netIncome?fmtBigNum(f.netIncome):"—"}</div>
                              {netGrowth!==null&&<div className="mono" style={{fontSize:9,color:netGrowth>=0?"var(--green)":"var(--red)",marginTop:1}}>前年比 {netGrowth>=0?"+":""}{netGrowth.toFixed(1)}%</div>}
                            </td>
                            <td style={{padding:mobile?"8px 10px":"10px 16px",textAlign:"right"}}>
                              <span className="mono" style={{fontSize:mobile?12:14,fontWeight:600,color:netMargin&&netMargin>=10?"var(--green)":"var(--text-primary)"}}>{netMargin!==null?netMargin.toFixed(1)+"%":"—"}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* AI Analysis Section */}
            <Card style={{marginBottom:14,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-light)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)"}}>AI分析</span>
                <div style={{display:"flex",gap:4,background:"var(--bg-card-alt)",borderRadius:6,padding:2}}>
                  {(["consensus","report"] as const).map(t=>(<button key={t} onClick={()=>{setAiTab(t);setAiResult(null);}} style={{padding:"4px 10px",fontSize:11,borderRadius:4,border:"none",cursor:"pointer",background:aiTab===t?"#fff":"transparent",color:aiTab===t?"var(--accent)":"var(--text-muted)",fontWeight:600,boxShadow:aiTab===t?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>{t==="consensus"?"コンセンサス入力":"レポート分析"}</button>))}
                </div>
              </div>

              <div style={{padding:mobile?"12px":"16px"}}>
                {aiTab==="consensus"?(
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(2,1fr)",gap:10,marginBottom:12}}>
                      <div>
                        <label style={{fontSize:10,color:"var(--text-muted)",display:"block",marginBottom:3,fontWeight:500}}>目標株価</label>
                        <input type="number" placeholder="例: 5500" value={consensusForm.targetPrice} onChange={e=>setConsensusForm({...consensusForm,targetPrice:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:13,background:"var(--bg-card-alt)",color:"var(--text-primary)",outline:"none"}} />
                      </div>
                      <div>
                        <label style={{fontSize:10,color:"var(--text-muted)",display:"block",marginBottom:3,fontWeight:500}}>レーティング</label>
                        <select value={consensusForm.rating} onChange={e=>setConsensusForm({...consensusForm,rating:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:13,background:"var(--bg-card-alt)",color:"var(--text-primary)",outline:"none"}}>
                          <option value="強気">強気</option><option value="やや強気">やや強気</option><option value="中立">中立</option><option value="やや弱気">やや弱気</option><option value="弱気">弱気</option>
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:10,color:"var(--text-muted)",display:"block",marginBottom:3,fontWeight:500}}>アナリスト数</label>
                        <input type="number" placeholder="例: 15" value={consensusForm.analystCount} onChange={e=>setConsensusForm({...consensusForm,analystCount:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:13,background:"var(--bg-card-alt)",color:"var(--text-primary)",outline:"none"}} />
                      </div>
                      <div>
                        <label style={{fontSize:10,color:"var(--text-muted)",display:"block",marginBottom:3,fontWeight:500}}>コメント / メモ</label>
                        <input type="text" placeholder="株予報Pro等からの情報" value={consensusForm.comment} onChange={e=>setConsensusForm({...consensusForm,comment:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:13,background:"var(--bg-card-alt)",color:"var(--text-primary)",outline:"none"}} />
                      </div>
                    </div>
                    <button disabled={aiLoading||!consensusForm.targetPrice} onClick={async()=>{
                      setAiLoading(true);setAiResult(null);
                      try{const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:stk.code,name:stk.name,price:stk.price,action:"analyze_consensus",consensus:consensusForm})});
                        if(r.ok){const d=await r.json();setAiResult(d.analysis);}else{setAiResult({summary:"分析に失敗しました。もう一度お試しください。"});}}
                      catch{setAiResult({summary:"エラーが発生しました"});}finally{setAiLoading(false);}
                    }} style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:aiLoading||!consensusForm.targetPrice?"not-allowed":"pointer",background:aiLoading||!consensusForm.targetPrice?"var(--border)":"var(--accent)",color:"#fff",fontSize:12,fontWeight:600,transition:"all 0.15s"}}>
                      {aiLoading?"分析中...":"AIで分析する"}
                    </button>
                  </div>
                ):(
                  <div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:10,color:"var(--text-muted)",display:"block",marginBottom:3,fontWeight:500}}>アナリストレポートをペースト</label>
                      <textarea placeholder="レポートのテキストをここに貼り付けてください..." value={reportText} onChange={e=>setReportText(e.target.value)}
                        style={{width:"100%",minHeight:mobile?100:120,padding:"10px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,background:"var(--bg-card-alt)",color:"var(--text-primary)",outline:"none",resize:"vertical",lineHeight:1.6}} />
                    </div>
                    <button disabled={aiLoading||!reportText.trim()} onClick={async()=>{
                      setAiLoading(true);setAiResult(null);
                      try{const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:stk.code,name:stk.name,price:stk.price,action:"analyze_report",reportText})});
                        if(r.ok){const d=await r.json();setAiResult(d.analysis);}else{setAiResult({summary:"分析に失敗しました"});}}
                      catch{setAiResult({summary:"エラーが発生しました"});}finally{setAiLoading(false);}
                    }} style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:aiLoading||!reportText.trim()?"not-allowed":"pointer",background:aiLoading||!reportText.trim()?"var(--border)":"var(--accent)",color:"#fff",fontSize:12,fontWeight:600}}>
                      {aiLoading?"分析中...":"AIで分析する"}
                    </button>
                  </div>
                )}

                {/* AI Result */}
                {aiResult&&(
                  <div style={{marginTop:14,padding:mobile?"12px":"14px",background:"var(--bg-card-alt)",borderRadius:8,border:"1px solid var(--border-light)"}}>
                    {aiResult.sentiment&&(
                      <div style={{marginBottom:8}}>
                        <span style={{fontSize:10,color:"var(--text-muted)",fontWeight:500}}>センチメント: </span>
                        <span style={{fontSize:12,fontWeight:700,padding:"2px 8px",borderRadius:4,
                          background:aiResult.sentiment.includes("強気")?"var(--green-bg)":aiResult.sentiment.includes("弱気")?"var(--red-bg)":"var(--bg-card-alt)",
                          color:aiResult.sentiment.includes("強気")?"var(--green)":aiResult.sentiment.includes("弱気")?"var(--red)":"var(--text-primary)"}}>{aiResult.sentiment}</span>
                      </div>
                    )}
                    {aiResult.upside&&(
                      <div style={{marginBottom:8,fontSize:12}}>
                        <span style={{color:"var(--text-muted)",fontWeight:500}}>上昇余地: </span>
                        <span className="mono" style={{fontWeight:700,color:"var(--accent)"}}>{aiResult.upside}</span>
                      </div>
                    )}
                    {aiResult.targetPrice&&(
                      <div style={{marginBottom:8,fontSize:12}}>
                        <span style={{color:"var(--text-muted)",fontWeight:500}}>目標株価: </span>
                        <span className="mono" style={{fontWeight:700}}>¥{Number(aiResult.targetPrice).toLocaleString()}</span>
                      </div>
                    )}
                    {aiResult.summary&&(
                      <div style={{marginBottom:10,fontSize:mobile?11:12,color:"var(--text-secondary)",lineHeight:1.7}}>{aiResult.summary}</div>
                    )}
                    {aiResult.keyPoints&&aiResult.keyPoints.length>0&&(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,marginBottom:4}}>要点</div>
                        {aiResult.keyPoints.map((p:string,i:number)=>(<div key={i} style={{fontSize:mobile?10:11,color:"var(--text-secondary)",padding:"3px 0",paddingLeft:12,position:"relative",lineHeight:1.5}}>
                          <span style={{position:"absolute",left:0,color:"var(--accent)"}}>•</span>{p}
                        </div>))}
                      </div>
                    )}
                    {aiResult.catalysts&&aiResult.catalysts.length>0&&(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"var(--green)",fontWeight:600,marginBottom:4}}>カタリスト</div>
                        {aiResult.catalysts.map((c:string,i:number)=>(<div key={i} style={{fontSize:mobile?10:11,color:"var(--text-secondary)",padding:"3px 0",paddingLeft:12,position:"relative"}}>
                          <span style={{position:"absolute",left:0,color:"var(--green)"}}>↑</span>{c}
                        </div>))}
                      </div>
                    )}
                    {(aiResult.risk||aiResult.risks)&&(
                      <div>
                        <div style={{fontSize:10,color:"var(--red)",fontWeight:600,marginBottom:4}}>リスク</div>
                        {aiResult.risks?aiResult.risks.map((r:string,i:number)=>(<div key={i} style={{fontSize:mobile?10:11,color:"var(--text-secondary)",padding:"3px 0",paddingLeft:12,position:"relative"}}>
                          <span style={{position:"absolute",left:0,color:"var(--red)"}}>↓</span>{r}
                        </div>)):(<div style={{fontSize:mobile?10:11,color:"var(--text-secondary)"}}>{aiResult.risk}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </>):<div style={{color:"var(--text-muted)",textAlign:"center",marginTop:80}}>銘柄を選択してください</div>}
        </main>
      </div>
    </div>
  );
}
