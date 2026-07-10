import {
  HistoryPoint,
  computeMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
} from "./stocks";

// --- テクニカルイベント検知 ---
// 1年分の日足履歴から「今まさに起きているシグナル」を抽出する

export interface Signal {
  type: string;
  label: string;
  detail: string;
  direction: "bull" | "bear" | "info";
}

export interface TechSummary {
  rsi: number | null;
  rsiSignal: string;
  macdTrend: string;
  maSignal: string;
  techScore: number; // -100〜+100
  changePct5d: number | null;
  pctFrom52wHigh: number | null; // 52週高値からの乖離(%)、0に近いほど高値圏
}

function last<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i];
  }
  return null;
}

// 直近lookback営業日以内に aが bを上抜け/下抜けしたかを判定
function detectCross(
  a: (number | null)[],
  b: (number | null)[],
  lookback: number
): "golden" | "dead" | null {
  const n = Math.min(a.length, b.length);
  for (let i = n - 1; i >= Math.max(1, n - lookback); i--) {
    const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i];
    if (a0 === null || a1 === null || b0 === null || b1 === null) continue;
    if (a0 <= b0 && a1 > b1) return "golden";
    if (a0 >= b0 && a1 < b1) return "dead";
  }
  return null;
}

export function detectSignals(
  history: HistoryPoint[],
  price: number,
  fiftyTwoWeekHigh: number | null,
  fiftyTwoWeekLow: number | null
): Signal[] {
  const signals: Signal[] = [];
  if (history.length < 30) return signals;

  const ma5 = computeMA(history, 5);
  const ma25 = computeMA(history, 25);
  const ma75 = computeMA(history, 75);
  const rsi = computeRSI(history);
  const macd = computeMACD(history);
  const bb = computeBollingerBands(history);

  // 短期クロス (MA5×MA25、直近3営業日)
  const shortCross = detectCross(ma5, ma25, 3);
  if (shortCross === "golden")
    signals.push({ type: "gc_short", label: "ゴールデンクロス", detail: "MA5がMA25を上抜け（短期）", direction: "bull" });
  if (shortCross === "dead")
    signals.push({ type: "dc_short", label: "デッドクロス", detail: "MA5がMA25を下抜け（短期）", direction: "bear" });

  // 中期クロス (MA25×MA75、直近5営業日)
  const midCross = detectCross(ma25, ma75, 5);
  if (midCross === "golden")
    signals.push({ type: "gc_mid", label: "中期ゴールデンクロス", detail: "MA25がMA75を上抜け", direction: "bull" });
  if (midCross === "dead")
    signals.push({ type: "dc_mid", label: "中期デッドクロス", detail: "MA25がMA75を下抜け", direction: "bear" });

  // RSI 過熱・売られすぎ
  const latestRsi = last(rsi);
  if (latestRsi !== null) {
    if (latestRsi <= 30)
      signals.push({ type: "rsi_oversold", label: "RSI売られすぎ", detail: `RSI ${latestRsi.toFixed(0)} — 反発余地`, direction: "bull" });
    else if (latestRsi >= 70)
      signals.push({ type: "rsi_overbought", label: "RSI買われすぎ", detail: `RSI ${latestRsi.toFixed(0)} — 過熱感`, direction: "bear" });
  }

  // MACDクロス (直近3営業日)
  const macdCross = detectCross(macd.macd, macd.signal, 3);
  if (macdCross === "golden")
    signals.push({ type: "macd_gc", label: "MACD買いシグナル", detail: "MACDがシグナルを上抜け", direction: "bull" });
  if (macdCross === "dead")
    signals.push({ type: "macd_dc", label: "MACD売りシグナル", detail: "MACDがシグナルを下抜け", direction: "bear" });

  // ボリンジャーバンド ±2σ
  const bbU = last(bb.upper2);
  const bbL = last(bb.lower2);
  const lastClose = history[history.length - 1].price;
  if (bbU !== null && lastClose > bbU)
    signals.push({ type: "bb_upper", label: "BB+2σ上抜け", detail: "強い上昇モメンタムだが過熱圏", direction: "bear" });
  if (bbL !== null && lastClose < bbL)
    signals.push({ type: "bb_lower", label: "BB−2σ下抜け", detail: "売られすぎ圏 — 反発注意", direction: "bull" });

  // 出来高急増（直近 vs 過去20日平均の2倍以上）
  if (history.length >= 21) {
    const vols = history.map((h) => h.volume);
    const latestVol = vols[vols.length - 1];
    const avg20 = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    if (avg20 > 0 && latestVol > avg20 * 2)
      signals.push({ type: "vol_spike", label: "出来高急増", detail: `20日平均の${(latestVol / avg20).toFixed(1)}倍`, direction: "info" });
  }

  // 52週高値・安値圏（±1.5%以内）
  if (fiftyTwoWeekHigh && price >= fiftyTwoWeekHigh * 0.985)
    signals.push({ type: "high_52w", label: "52週高値圏", detail: `高値¥${fiftyTwoWeekHigh.toLocaleString()}に接近`, direction: "bull" });
  if (fiftyTwoWeekLow && price <= fiftyTwoWeekLow * 1.015)
    signals.push({ type: "low_52w", label: "52週安値圏", detail: `安値¥${fiftyTwoWeekLow.toLocaleString()}に接近`, direction: "bear" });

  return signals;
}

export function computeTechSummary(
  history: HistoryPoint[],
  price: number,
  fiftyTwoWeekHigh: number | null
): TechSummary {
  const empty: TechSummary = {
    rsi: null, rsiSignal: "中立", macdTrend: "中立", maSignal: "中立",
    techScore: 0, changePct5d: null, pctFrom52wHigh: null,
  };
  if (history.length < 30) return empty;

  const ma25 = computeMA(history, 25);
  const ma75 = computeMA(history, 75);
  const rsiArr = computeRSI(history);
  const macd = computeMACD(history);

  const rsi = last(rsiArr);
  const macdHist = last(macd.histogram);
  const m25 = last(ma25);
  const m75 = last(ma75);

  let rsiSignal = "中立";
  if (rsi !== null) {
    if (rsi >= 70) rsiSignal = "買われすぎ";
    else if (rsi <= 30) rsiSignal = "売られすぎ";
  }
  const macdTrend =
    macdHist === null ? "中立" : macdHist > 0 ? "上昇トレンド" : macdHist < 0 ? "下降トレンド" : "中立";

  let maSignal = "中立";
  if (m25 !== null && m75 !== null && price > 0) {
    if (price > m25 && m25 > m75) maSignal = "上昇配列";
    else if (price < m25 && m25 < m75) maSignal = "下降配列";
  }

  // フロントの統合予測テクニカル層と同一ロジック
  const rsiScore =
    rsi === null ? 0 : rsi <= 30 ? 80 : rsi <= 40 ? 40 : rsi >= 70 ? -80 : rsi >= 60 ? -40 : 0;
  const macdScore = macdTrend === "上昇トレンド" ? 50 : macdTrend === "下降トレンド" ? -50 : 0;
  const maScore = maSignal === "上昇配列" ? 60 : maSignal === "下降配列" ? -60 : 0;
  const techScore = Math.round(rsiScore * 0.4 + macdScore * 0.3 + maScore * 0.3);

  let changePct5d: number | null = null;
  if (history.length >= 6) {
    const base = history[history.length - 6].price;
    if (base) changePct5d = Math.round(((price - base) / base) * 10000) / 100;
  }

  const pctFrom52wHigh =
    fiftyTwoWeekHigh && fiftyTwoWeekHigh > 0
      ? Math.round(((price - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 1000) / 10
      : null;

  return { rsi, rsiSignal, macdTrend, maSignal, techScore, changePct5d, pctFrom52wHigh };
}
