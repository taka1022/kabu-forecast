"use client";

import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface Signal { type:string; label:string; detail:string; direction:"bull"|"bear"|"info"; }
export interface OverviewStock {
  code:string; name:string; nameEn:string; sector:string;
  price:number; change:number; changePct:number; changePct5d:number|null;
  marketCap:number; per:number|null; perIsForward:boolean; dividendYield:number|null;
  rsi:number|null; macdTrend:string; maSignal:string; techScore:number;
  pctFrom52wHigh:number|null; spark:number[]; signals:Signal[];
}
interface MacroIndicator { id:string; name:string; nameJa:string; value:number; changePct:number; changePct5d?:number; unit:string; direction:string; trend5d?:string; }
interface StockMacroScore { code:string; name:string; normalizedScore:number; signal:string; }

const LINE_COLORS = ["#1E3A5F","#E11D48","#059669","#D97706","#7C3AED","#0891B2","#DB2777","#65A30D","#EA580C","#64748B"];

const Card = ({children,style,...p}:{children:React.ReactNode;style?:React.CSSProperties;[k:string]:any}) => (
  <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",border:"1px solid var(--border-light)",...style}} {...p}>{children}</div>
);

function SectionTitle({children}:{children:React.ReactNode}){
  return <div className="sans" style={{fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>{children}</div>;
}

// ミニスパークライン（直近30営業日）
function Spark({data,width=88,height=26}:{data:number[];width?:number;height?:number}){
  if(!data||data.length<2)return null;
  const min=Math.min(...data),max=Math.max(...data);
  const range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-min)/range)*(height-4)-2}`).join(" ");
  const up=data[data.length-1]>=data[0];
  return(<svg width={width} height={height} style={{display:"block"}}>
    <polyline points={pts} fill="none" stroke={up?"var(--red)":"var(--green)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85}/>
  </svg>);
}

// ヒートマップの背景色（日本の慣行: 上昇=赤、下落=緑）
function tileBg(pct:number){
  const alpha=Math.min(0.45,0.06+Math.abs(pct)*0.11);
  return pct>=0?`rgba(225,29,72,${alpha})`:`rgba(5,150,105,${alpha})`;
}

function stanceColor(s:string){return s.includes("強気")?"var(--red)":s.includes("弱気")?"var(--green)":"var(--text-muted)";}
function stanceBg(s:string){return s.includes("強気")?"var(--red-bg)":s.includes("弱気")?"var(--green-bg)":"var(--bg-card-alt)";}

interface Props {
  stocks: OverviewStock[];
  relative: Record<string,string|number>[];
  macroIndicators: MacroIndicator[];
  macroScores: StockMacroScore[];
  onSelect: (code:string)=>void;
  mobile: boolean;
}

type SortKey = "changePct"|"changePct5d"|"rsi"|"techScore"|"macro"|"per"|"pctFrom52wHigh";

export default function MarketOverview({stocks,relative,macroIndicators,macroScores,onSelect,mobile}:Props){
  const[briefing,setBriefing]=useState<any>(null);
  const[briefingAt,setBriefingAt]=useState<string>("");
  const[briefLoading,setBriefLoading]=useState(false);
  const[sortKey,setSortKey]=useState<SortKey>("changePct");
  const[sortDesc,setSortDesc]=useState(true);
  const[hidden,setHidden]=useState<Set<string>>(new Set());

  // キャッシュ済みブリーフィングがあれば自動表示
  useEffect(()=>{(async()=>{
    try{const r=await fetch("/api/briefing");if(r.ok){const d=await r.json();if(d.briefing){setBriefing(d.briefing);setBriefingAt(d.generatedAt);}}}catch{}
  })();},[]);

  const genBriefing=async(force:boolean)=>{
    setBriefLoading(true);
    try{
      const r=await fetch("/api/briefing",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({force,stocks,macro:{indicators:macroIndicators,scores:macroScores}})});
      if(r.ok){const d=await r.json();setBriefing(d.briefing);setBriefingAt(d.generatedAt);}
      else{setBriefing({headline:"生成失敗",marketView:"ブリーフィングの生成に失敗しました。もう一度お試しください。",highlights:[],watchPoints:[]});}
    }catch{setBriefing({headline:"エラー",marketView:"通信エラーが発生しました。",highlights:[],watchPoints:[]});}
    finally{setBriefLoading(false);}
  };

  // 全シグナルを集約（bull → bear → info の順）
  const allSignals=stocks.flatMap(s=>s.signals.map(sig=>({...sig,code:s.code,name:s.name})));
  const order={bull:0,bear:1,info:2} as Record<string,number>;
  allSignals.sort((a,b)=>order[a.direction]-order[b.direction]);

  const macroOf=(code:string)=>macroScores.find(m=>m.code===code)?.normalizedScore??null;

  const sorted=[...stocks].sort((a,b)=>{
    const get=(s:OverviewStock):number=>{
      switch(sortKey){
        case "changePct":return s.changePct;
        case "changePct5d":return s.changePct5d??-999;
        case "rsi":return s.rsi??-999;
        case "techScore":return s.techScore;
        case "macro":return macroOf(s.code)??-999;
        case "per":return s.per??9999;
        case "pctFrom52wHigh":return s.pctFrom52wHigh??-999;
      }
    };
    return sortDesc?get(b)-get(a):get(a)-get(b);
  });

  const clickSort=(k:SortKey)=>{if(sortKey===k)setSortDesc(!sortDesc);else{setSortKey(k);setSortDesc(true);}};

  const codes=stocks.map(s=>s.code);
  const xInterval=Math.max(1,Math.floor(relative.length/(mobile?4:8)));

  const th=(label:string,k?:SortKey,align:"left"|"right"="right")=>(
    <th key={label} onClick={k?()=>clickSort(k):undefined}
      style={{padding:mobile?"8px 8px":"9px 12px",textAlign:align,fontSize:10,fontWeight:600,color:k&&sortKey===k?"var(--accent)":"var(--text-muted)",whiteSpace:"nowrap",cursor:k?"pointer":"default",userSelect:"none"}}>
      {label}{k&&sortKey===k?(sortDesc?" ↓":" ↑"):""}
    </th>
  );

  return(<div className="fade-in">
    {/* === AI Morning Briefing === */}
    <Card style={{marginBottom:16,overflow:"hidden",border:"1px solid var(--accent)",borderLeft:"4px solid var(--accent)"}}>
      <div style={{padding:mobile?"12px 14px":"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="sans" style={{fontSize:14,fontWeight:700,color:"var(--accent)"}}>AIモーニングブリーフィング</span>
          {briefingAt&&<span className="mono" style={{fontSize:9,color:"var(--text-dim)"}}>{new Date(briefingAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} 生成</span>}
        </div>
        <button disabled={briefLoading||stocks.length===0} onClick={()=>genBriefing(!!briefing)}
          style={{padding:"6px 16px",borderRadius:6,border:"none",cursor:briefLoading?"not-allowed":"pointer",background:briefLoading?"var(--border)":"var(--accent)",color:"#fff",fontSize:11,fontWeight:600}}>
          {briefLoading?"生成中...":briefing?"再生成":"今日のブリーフィングを生成"}
        </button>
      </div>
      {briefing&&(
        <div style={{padding:mobile?"0 14px 14px":"0 20px 18px"}}>
          <div className="sans" style={{fontSize:mobile?16:19,fontWeight:700,color:"var(--text-primary)",marginBottom:6}}>「{briefing.headline}」</div>
          <div style={{fontSize:mobile?11:12,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:12}}>{briefing.marketView}</div>
          {briefing.highlights?.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(auto-fit,minmax(220px,1fr))",gap:8,marginBottom:12}}>
              {briefing.highlights.map((h:any,i:number)=>(
                <div key={i} onClick={()=>h.code&&onSelect(h.code)} style={{padding:"10px 12px",borderRadius:8,background:stanceBg(h.stance||""),border:"1px solid var(--border-light)",cursor:h.code?"pointer":"default"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700}}>{h.name}<span className="mono" style={{fontSize:9,color:"var(--text-muted)",marginLeft:5}}>{h.code}</span></span>
                    <span style={{fontSize:10,fontWeight:700,color:stanceColor(h.stance||"")}}>{h.stance}</span>
                  </div>
                  <div style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.6}}>{h.comment}</div>
                </div>
              ))}
            </div>
          )}
          {briefing.watchPoints?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:600,color:"var(--amber)",marginBottom:4}}>今週のウォッチポイント</div>
              {briefing.watchPoints.map((w:string,i:number)=>(
                <div key={i} style={{fontSize:mobile?10:11,color:"var(--text-secondary)",padding:"2px 0",paddingLeft:14,position:"relative",lineHeight:1.6}}>
                  <span style={{position:"absolute",left:0,color:"var(--amber)"}}>⚑</span>{w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!briefing&&!briefLoading&&(
        <div style={{padding:mobile?"0 14px 14px":"0 20px 16px",fontSize:11,color:"var(--text-muted)"}}>
          ウォッチリスト10銘柄のテクニカルシグナルとマクロ環境をClaudeが読み解き、今日の相場の見取り図を作ります（1日1回生成・キャッシュ）。
        </div>
      )}
    </Card>

    {/* === Heatmap === */}
    <div style={{marginBottom:16}}>
      <SectionTitle>マーケットヒートマップ</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,1fr)":"repeat(5,1fr)",gap:mobile?8:10}}>
        {stocks.map(s=>(
          <Card key={s.code} onClick={()=>onSelect(s.code)} style={{padding:"12px 12px 8px",cursor:"pointer",background:tileBg(s.changePct),border:"1px solid var(--border-light)",transition:"transform 0.1s"}}
            onMouseEnter={(e:any)=>e.currentTarget.style.transform="translateY(-2px)"}
            onMouseLeave={(e:any)=>e.currentTarget.style.transform="none"}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
              <span style={{fontSize:mobile?11:12,fontWeight:700,color:"var(--text-primary)"}}>{s.name}</span>
              <span className="mono" style={{fontSize:9,color:"var(--text-muted)"}}>{s.code}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <span className="mono" style={{fontSize:mobile?14:16,fontWeight:700}}>¥{s.price.toLocaleString()}</span>
              <span className="mono" style={{fontSize:mobile?11:12,fontWeight:700,color:s.changePct>=0?"var(--red)":"var(--green)"}}>{s.changePct>=0?"+":""}{s.changePct.toFixed(2)}%</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:4}}>
              <Spark data={s.spark} width={mobile?70:88} height={24}/>
              {s.signals.length>0&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,0.75)",color:"var(--accent)",fontWeight:700}}>{s.signals.length}件</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>

    {/* === Signals === */}
    <div style={{marginBottom:16}}>
      <SectionTitle>本日のシグナル</SectionTitle>
      <Card style={{overflow:"hidden"}}>
        {allSignals.length===0?(
          <div style={{padding:"16px",fontSize:12,color:"var(--text-muted)"}}>現在検知中のシグナルはありません</div>
        ):allSignals.map((sig,i)=>(
          <div key={i} onClick={()=>onSelect((sig as any).code)} style={{display:"flex",alignItems:"center",gap:mobile?8:12,padding:mobile?"9px 12px":"10px 16px",borderBottom:i<allSignals.length-1?"1px solid var(--border-light)":"none",cursor:"pointer"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,flexShrink:0,
              background:sig.direction==="bull"?"var(--red-bg)":sig.direction==="bear"?"var(--green-bg)":"var(--amber-bg)",
              color:sig.direction==="bull"?"var(--red)":sig.direction==="bear"?"var(--green)":"var(--amber)"}}>
              {sig.direction==="bull"?"強気":sig.direction==="bear"?"弱気":"注目"}
            </span>
            <span style={{fontSize:mobile?11:12,fontWeight:600,flexShrink:0,minWidth:mobile?72:100}}>{(sig as any).name}</span>
            <span style={{fontSize:mobile?11:12,fontWeight:600,color:"var(--accent)",flexShrink:0}}>{sig.label}</span>
            {!mobile&&<span style={{fontSize:11,color:"var(--text-muted)"}}>{sig.detail}</span>}
          </div>
        ))}
      </Card>
    </div>

    {/* === Relative Performance === */}
    {relative.length>0&&(
      <div style={{marginBottom:16}}>
        <SectionTitle>相対パフォーマンス（6ヶ月・起点=100）</SectionTitle>
        <Card style={{padding:mobile?"12px 6px 6px 0":"16px 16px 8px 0"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:mobile?"0 10px 8px":"0 16px 10px"}}>
            {stocks.map((s,i)=>{
              const off=hidden.has(s.code);
              return(<button key={s.code} onClick={()=>{const h=new Set(hidden);off?h.delete(s.code):h.add(s.code);setHidden(h);}}
                style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,border:"1px solid var(--border-light)",background:off?"transparent":"#fff",cursor:"pointer",opacity:off?0.4:1}}>
                <span style={{width:10,height:3,borderRadius:2,background:LINE_COLORS[i%LINE_COLORS.length],display:"inline-block"}}/>
                <span style={{fontSize:10,fontWeight:600,color:"var(--text-secondary)"}}>{s.name}</span>
              </button>);
            })}
          </div>
          <ResponsiveContainer width="100%" height={mobile?220:320}>
            <LineChart data={relative} margin={{top:5,right:mobile?8:16,left:0,bottom:5}}>
              <XAxis dataKey="date" tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={{stroke:"var(--border-light)"}} tickLine={false} interval={xInterval}/>
              <YAxis domain={["auto","auto"]} tick={{fontSize:mobile?8:10,fill:"#666",fontFamily:"DM Mono"}} axisLine={false} tickLine={false} width={mobile?34:42}/>
              <Tooltip contentStyle={{fontSize:11,fontFamily:"DM Mono",borderRadius:8,border:"1px solid var(--border)"}}
                formatter={(v:any,nm:any)=>[v,stocks.find(s=>s.code===nm)?.name??nm]}/>
              <ReferenceLine y={100} stroke="#D4D4D4" strokeDasharray="3 3"/>
              {codes.map((c,i)=>!hidden.has(c)&&(
                <Line key={c} type="monotone" dataKey={c} stroke={LINE_COLORS[i%LINE_COLORS.length]} strokeWidth={1.4} dot={false} connectNulls/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    )}

    {/* === Ranking Board === */}
    <div style={{marginBottom:16}}>
      <SectionTitle>ランキングボード <span style={{fontSize:10,fontWeight:400,color:"var(--text-muted)"}}>（列クリックでソート）</span></SectionTitle>
      <Card style={{overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:mobile?680:0}}>
            <thead>
              <tr style={{borderBottom:"1px solid var(--border)"}}>
                {th("銘柄",undefined,"left")}
                {th("株価")}
                {th("前日比","changePct")}
                {th("5日","changePct5d")}
                {th("RSI","rsi")}
                {th("テクニカル","techScore")}
                {th("マクロ","macro")}
                {th("予想PER","per")}
                {th("52週高値比","pctFrom52wHigh")}
              </tr>
            </thead>
            <tbody>
              {sorted.map(s=>{
                const mac=macroOf(s.code);
                return(<tr key={s.code} onClick={()=>onSelect(s.code)} style={{borderBottom:"1px solid var(--border-light)",cursor:"pointer"}}>
                  <td style={{padding:mobile?"9px 8px":"10px 12px"}}>
                    <span style={{fontSize:12,fontWeight:600}}>{s.name}</span>
                    <span className="mono" style={{fontSize:9,color:"var(--text-muted)",marginLeft:5}}>{s.code}</span>
                  </td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,fontWeight:600}}>¥{s.price.toLocaleString()}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,fontWeight:700,color:s.changePct>=0?"var(--red)":"var(--green)"}}>{s.changePct>=0?"+":""}{s.changePct.toFixed(2)}%</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,color:(s.changePct5d??0)>=0?"var(--red)":"var(--green)"}}>{s.changePct5d!=null?`${s.changePct5d>=0?"+":""}${s.changePct5d.toFixed(1)}%`:"—"}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,color:(s.rsi??50)>=70?"var(--red)":(s.rsi??50)<=30?"var(--green)":"var(--text-primary)"}}>{s.rsi?.toFixed(0)??"—"}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,fontWeight:700,color:s.techScore>=15?"var(--red)":s.techScore<=-15?"var(--green)":"var(--text-muted)"}}>{s.techScore>0?"+":""}{s.techScore}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,fontWeight:700,color:(mac??0)>=10?"var(--red)":(mac??0)<=-10?"var(--green)":"var(--text-muted)"}}>{mac!=null?`${mac>0?"+":""}${mac}`:"—"}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12}}>{s.per?.toFixed(1)??"—"}</td>
                  <td className="mono" style={{padding:mobile?"9px 8px":"10px 12px",textAlign:"right",fontSize:12,color:(s.pctFrom52wHigh??-99)>=-3?"var(--red)":"var(--text-muted)"}}>{s.pctFrom52wHigh!=null?`${s.pctFrom52wHigh.toFixed(1)}%`:"—"}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>);
}
