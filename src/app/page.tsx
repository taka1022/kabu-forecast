"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
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
}

function fmtVol(n: number) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "億";
  if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
  return n.toLocaleString();
}

function fmtCap(n: number) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "兆";
  if (n >= 1e8) return (n / 1e8).toFixed(0) + "億";
  return n.toLocaleString();
}

const PM: Record<string, string> = { "1M":"1mo","3M":"3mo","6M":"6mo","1Y":"1y" };

function CTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="mono" style={{ background:"rgba(15,23,42,0.95)", border:"1px solid rgba(34,211,238,0.3)", borderRadius:6, padding:"10px 14px", fontSize:12 }}>
      <div style={{ color:"#94a3b8", marginBottom:4 }}>{label}</div>
      <div style={{ color:"#f8fafc", fontWeight:700 }}>¥{d?.price?.toLocaleString()}</div>
      {d?.ma25 && <div style={{ color:"#fbbf24", fontSize:11 }}>MA25: ¥{d.ma25.toLocaleString()}</div>}
      {d?.ma75 && <div style={{ color:"#a78bfa", fontSize:11 }}>MA75: ¥{d.ma75.toLocaleString()}</div>}
      <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>出来高: {fmtVol(d?.volume||0)}</div>
    </div>
  );
}

export default function Dashboard() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [sel, setSel] = useState("6501");
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [range, setRange] = useState("3M");
  const [loading, setLoading] = useState(true);
  const [cLoading, setCLoading] = useState(false);
  const [updated, setUpdated] = useState("");
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stocks");
        if (!r.ok) throw new Error();
        const d = await r.json();
        setQuotes(d.quotes); setUpdated(d.updatedAt); setErr(null);
      } catch { setErr("データの取得に失敗しました"); }
      finally { setLoading(false); }
    })();
    const iv = setInterval(async () => {
      try {
        const r = await fetch("/api/stocks");
        if (r.ok) { const d = await r.json(); setQuotes(d.quotes); setUpdated(d.updatedAt); }
      } catch {}
    }, 300000);
    return () => clearInterval(iv);
  }, []);

  const loadH = useCallback(async (code: string, rng: string) => {
    setCLoading(true);
    try {
      const r = await fetch(`/api/stocks/${code}?period=${PM[rng]||"3mo"}`);
      if (r.ok) { const d = await r.json(); setChart(d.history); }
    } catch { setChart([]); }
    finally { setCLoading(false); }
  }, []);

  useEffect(() => { loadH(sel, range); }, [sel, range, loadH]);

  const stk = quotes.find(q => q.code === sel);
  const isUp = stk ? stk.change >= 0 : true;
  const prices = chart.map(d => d.price).filter(Boolean);
  const pMin = prices.length ? Math.min(...prices)*0.995 : 0;
  const pMax = prices.length ? Math.max(...prices)*1.005 : 100;

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div className="loading-pulse" style={{ width:8, height:8, borderRadius:"50%", background:"#22d3ee", boxShadow:"0 0 16px rgba(34,211,238,0.5)" }} />
      <span className="mono" style={{ color:"#64748b", fontSize:13 }}>KABUFORECAST — データ取得中...</span>
    </div>
  );

  if (err) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <span style={{ color:"#f87171", fontSize:14 }}>{err}</span>
      <button onClick={() => location.reload()} className="mono" style={{ padding:"8px 20px", background:"rgba(34,211,238,0.1)", border:"1px solid #22d3ee", color:"#22d3ee", borderRadius:4, cursor:"pointer", fontSize:13 }}>リロード</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh" }}>
      {/* Header */}
      <header style={{ padding:"14px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(15,23,42,0.5)", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#22d3ee", boxShadow:"0 0 8px rgba(34,211,238,0.5)" }} />
            <span style={{ fontSize:16, fontWeight:700, letterSpacing:2, color:"#f8fafc" }}>KABU<span style={{ color:"#22d3ee" }}>FORECAST</span></span>
          </div>
          <span className="mono" style={{ fontSize:11, color:"#475569" }}>Phase 1</span>
        </div>
        {updated && <span className="mono" style={{ fontSize:10, color:"#475569" }}>更新: {new Date(updated).toLocaleTimeString("ja-JP")}</span>}
      </header>

      <div style={{ display:"flex", minHeight:"calc(100vh - 57px)" }}>
        {/* Sidebar */}
        <aside style={{ width:280, borderRight:"1px solid rgba(255,255,255,0.06)", background:"rgba(15,23,42,0.3)", flexShrink:0 }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize:11, color:"#64748b", letterSpacing:1 }}>ウォッチリスト — {quotes.length}銘柄</div>
          </div>
          {quotes.map(q => {
            const up = q.change >= 0;
            const s = sel === q.code;
            return (
              <div key={q.code} onClick={() => setSel(q.code)} style={{ padding:"14px 16px", cursor:"pointer", borderLeft:s?"3px solid #22d3ee":"3px solid transparent", background:s?"rgba(34,211,238,0.06)":"transparent", transition:"all 0.15s", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                  <div>
                    <span className="mono" style={{ color:"#94a3b8", fontSize:11, letterSpacing:1 }}>{q.code}</span>
                    <span style={{ color:"#e2e8f0", fontSize:14, fontWeight:600, marginLeft:8 }}>{q.name}</span>
                  </div>
                  <span style={{ color:"#64748b", fontSize:10 }}>{q.sector}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <span className="mono" style={{ color:"#f8fafc", fontSize:20, fontWeight:700 }}>¥{q.price.toLocaleString()}</span>
                  <span className="mono" style={{ color:up?"#34d399":"#f87171", fontSize:13, fontWeight:600 }}>{up?"▲":"▼"} {Math.abs(q.change)} ({up?"+":""}{q.changePct.toFixed(2)}%)</span>
                </div>
              </div>
            );
          })}
          <div style={{ padding:16, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize:10, color:"#475569", letterSpacing:1, marginBottom:8 }}>ポートフォリオ概況</div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:11, color:"#64748b" }}>上昇</span>
              <span className="mono" style={{ fontSize:12, color:"#34d399" }}>{quotes.filter(q=>q.change>=0).length}銘柄</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:"#64748b" }}>下落</span>
              <span className="mono" style={{ fontSize:12, color:"#f87171" }}>{quotes.filter(q=>q.change<0).length}銘柄</span>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex:1, padding:24, overflowY:"auto" }}>
          {stk ? (<>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
                  <span className="mono" style={{ fontSize:11, color:"#0f172a", background:"#22d3ee", padding:"2px 8px", borderRadius:3, fontWeight:700 }}>{stk.code}</span>
                  <span style={{ fontSize:22, fontWeight:700 }}>{stk.name}</span>
                  <span style={{ fontSize:14, color:"#64748b" }}>{stk.nameEn}</span>
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:16, marginTop:8 }}>
                  <span className="mono" style={{ fontSize:36, fontWeight:700, color:"#f8fafc" }}>¥{stk.price.toLocaleString()}</span>
                  <span className="mono" style={{ fontSize:18, fontWeight:600, color:isUp?"#34d399":"#f87171" }}>{isUp?"+":""}{stk.change} ({isUp?"+":""}{stk.changePct.toFixed(2)}%)</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {["1M","3M","6M","1Y"].map(r => (
                  <button key={r} onClick={() => setRange(r)} className="mono" style={{ padding:"6px 14px", fontSize:12, fontWeight:600, border:"1px solid", borderColor:range===r?"#22d3ee":"rgba(255,255,255,0.08)", background:range===r?"rgba(34,211,238,0.1)":"transparent", color:range===r?"#22d3ee":"#64748b", borderRadius:4, cursor:"pointer" }}>{r}</button>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div style={{ background:"rgba(15,23,42,0.4)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"20px 16px 8px 0", marginBottom:20, position:"relative" }}>
              {cLoading && <div style={{ position:"absolute", top:12, right:16, display:"flex", alignItems:"center", gap:6 }}><div className="loading-pulse" style={{ width:6, height:6, borderRadius:"50%", background:"#22d3ee" }} /><span className="mono" style={{ fontSize:10, color:"#475569" }}>読込中</span></div>}
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chart} margin={{ top:5, right:10, left:10, bottom:5 }}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isUp?"#34d399":"#f87171"} stopOpacity={0.2} /><stop offset="100%" stopColor={isUp?"#34d399":"#f87171"} stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="date" tick={{ fontSize:10, fill:"#475569", fontFamily:"JetBrains Mono" }} axisLine={{ stroke:"rgba(255,255,255,0.06)" }} tickLine={false} interval={Math.max(1,Math.floor(chart.length/7))} />
                  <YAxis domain={[pMin,pMax]} tick={{ fontSize:10, fill:"#475569", fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v:number) => `¥${Math.round(v).toLocaleString()}`} width={80} />
                  <Tooltip content={<CTip />} />
                  <ReferenceLine y={stk.prevClose} stroke="#475569" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="price" stroke={isUp?"#34d399":"#f87171"} strokeWidth={2} fill="url(#pg)" dot={false} activeDot={{ r:4, fill:"#22d3ee", stroke:"#0f172a", strokeWidth:2 }} />
                  <Line type="monotone" dataKey="ma25" stroke="#fbbf24" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false} />
                  <Line type="monotone" dataKey="ma75" stroke="#a78bfa" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", gap:20, padding:"8px 16px", justifyContent:"center" }}>
                {[{l:"株価",c:isUp?"#34d399":"#f87171"},{l:"MA25",c:"#fbbf24"},{l:"MA75",c:"#a78bfa"},{l:"前日終値",c:"#475569"}].map(x => (
                  <div key={x.l} style={{ display:"flex", alignItems:"center", gap:6 }}><div style={{ width:16, height:2, background:x.c }} /><span style={{ fontSize:10, color:"#64748b" }}>{x.l}</span></div>
                ))}
              </div>
            </div>

            {/* OHLCV */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
              {[{l:"始値",v:`¥${stk.open.toLocaleString()}`},{l:"高値",v:`¥${stk.high.toLocaleString()}`},{l:"安値",v:`¥${stk.low.toLocaleString()}`},{l:"出来高",v:fmtVol(stk.volume)}].map(m => (
                <div key={m.l} style={{ background:"rgba(15,23,42,0.4)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:6, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#64748b", letterSpacing:1, marginBottom:4 }}>{m.l}</div>
                  <div className="mono" style={{ fontSize:16, fontWeight:700 }}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Fundamentals */}
            <div style={{ background:"rgba(15,23,42,0.4)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, marginBottom:20 }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:12, fontWeight:600, color:"#94a3b8", letterSpacing:1 }}>ファンダメンタルズ</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", padding:"8px 0" }}>
                {[
                  {l:"時価総額",v:fmtCap(stk.marketCap),h:false},
                  {l:"PER",v:stk.per?.toFixed(1)??"—",u:"倍",h:(stk.per??99)<15},
                  {l:"PBR",v:stk.pbr?.toFixed(2)??"—",u:"倍",h:(stk.pbr??99)<1},
                  {l:"配当利回",v:stk.dividendYield?.toFixed(2)??"—",u:"%",h:(stk.dividendYield??0)>3},
                  {l:"EPS",v:stk.eps?`¥${stk.eps.toFixed(1)}`:"—",h:false},
                  {l:"52W高値",v:stk.fiftyTwoWeekHigh?`¥${stk.fiftyTwoWeekHigh.toLocaleString()}`:"—",h:false},
                ].map(m => (
                  <div key={m.l} style={{ textAlign:"center", padding:"10px 6px" }}>
                    <div style={{ color:"#64748b", fontSize:10, letterSpacing:1, marginBottom:4 }}>{m.l}</div>
                    <div className="mono" style={{ color:m.h?"#22d3ee":"#e2e8f0", fontSize:16, fontWeight:700 }}>{m.v}{m.u && <span style={{ fontSize:10, color:"#64748b", marginLeft:2 }}>{m.u}</span>}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roadmap */}
            <div style={{ background:"linear-gradient(135deg,rgba(34,211,238,0.05),rgba(139,92,246,0.05))", border:"1px solid rgba(34,211,238,0.15)", borderRadius:8, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#22d3ee", marginBottom:12 }}>次のフェーズ予定</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
                {[
                  {p:"Phase 2",t:"定量モデル",d:"ボリンジャーバンド・RSI・目標株価レンジ"},
                  {p:"Phase 3",t:"マクロ環境",d:"金利・為替・CPI連動スコアリング"},
                  {p:"Phase 4",t:"AI分析",d:"レポートPDF解析・センチメント抽出"},
                  {p:"Phase 5",t:"統合予測",d:"3レイヤー統合・売買シグナル"},
                ].map(x => (
                  <div key={x.p} style={{ padding:"10px 12px", background:"rgba(255,255,255,0.02)", borderRadius:6, border:"1px solid rgba(255,255,255,0.04)" }}>
                    <div className="mono" style={{ fontSize:10, color:"#64748b" }}>{x.p}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{x.t}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{x.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </>) : <div style={{ color:"#64748b", textAlign:"center", marginTop:80 }}>銘柄を選択してください</div>}
        </main>
      </div>
    </div>
  );
}
