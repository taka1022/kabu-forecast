import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

// --- Macro Indicators via Yahoo Finance ---
export interface MacroIndicator {
  id: string;
  name: string;
  nameJa: string;
  value: number;
  prevValue: number;
  change: number;
  changePct: number;
  unit: string;
  direction: "up" | "down" | "flat"; // recent trend
}

const MACRO_TICKERS: {
  id: string;
  ticker: string;
  name: string;
  nameJa: string;
  unit: string;
}[] = [
  { id: "usdjpy", ticker: "JPY=X", name: "USD/JPY", nameJa: "ドル円", unit: "円" },
  { id: "us10y", ticker: "^TNX", name: "US 10Y Yield", nameJa: "米10年金利", unit: "%" },
  { id: "nikkei", ticker: "^N225", name: "Nikkei 225", nameJa: "日経平均", unit: "円" },
  { id: "sp500", ticker: "^GSPC", name: "S&P 500", nameJa: "S&P 500", unit: "pt" },
  { id: "oil", ticker: "CL=F", name: "WTI Crude", nameJa: "原油(WTI)", unit: "USD" },
  { id: "gold", ticker: "GC=F", name: "Gold", nameJa: "金", unit: "USD" },
];

export async function fetchMacroIndicators(): Promise<MacroIndicator[]> {
  const results: MacroIndicator[] = [];

  for (const m of MACRO_TICKERS) {
    try {
      const q: any = await yf.quote(m.ticker);
      const price = q.regularMarketPrice ?? 0;
      const prev = q.regularMarketPreviousClose ?? price;
      const change = Math.round((price - prev) * 100) / 100;
      const changePct = prev ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;

      results.push({
        id: m.id,
        name: m.name,
        nameJa: m.nameJa,
        value: Math.round(price * 100) / 100,
        prevValue: Math.round(prev * 100) / 100,
        change,
        changePct,
        unit: m.unit,
        direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
      });
    } catch (err) {
      console.error(`Failed to fetch macro ${m.id}:`, err);
    }
  }

  return results;
}

// --- Sensitivity Matrix ---
// Score: -3 (strong negative) to +3 (strong positive)
// How each macro factor movement (UP) affects each stock

export interface SensitivityEntry {
  factorId: string;
  factorName: string;
  score: number; // -3 to +3
  reason: string;
}

export interface StockMacroScore {
  code: string;
  name: string;
  totalScore: number;       // weighted sum
  maxPossible: number;
  normalizedScore: number;  // -100 to +100
  signal: string;           // 追い風 / 向かい風 / 中立
  factors: SensitivityEntry[];
}

// Sensitivity: when the factor goes UP, what happens to the stock?
const SENSITIVITY_MATRIX: Record<string, Record<string, { score: number; reason: string }>> = {
  "6501": { // 日立 - 電機・インフラ
    usdjpy:  { score: 2, reason: "円安で海外売上の円換算増" },
    us10y:   { score: -1, reason: "金利上昇で設備投資減速リスク" },
    nikkei:  { score: 2, reason: "市場全体のセンチメント連動" },
    sp500:   { score: 1, reason: "グローバルリスクオン恩恵" },
    oil:     { score: -1, reason: "原材料コスト増" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "6758": { // ソニー - エンタメ・半導体
    usdjpy:  { score: 2, reason: "円安で海外エンタメ収益増" },
    us10y:   { score: -2, reason: "グロース株として金利感応度高" },
    nikkei:  { score: 2, reason: "市場センチメント連動" },
    sp500:   { score: 2, reason: "米国テック株との相関高" },
    oil:     { score: 0, reason: "直接的影響小" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "6098": { // リクルート - 人材・SaaS
    usdjpy:  { score: 2, reason: "Indeed等海外売上比率高" },
    us10y:   { score: -2, reason: "グロース株として金利感応度高" },
    nikkei:  { score: 1, reason: "内需・市場センチメント" },
    sp500:   { score: 2, reason: "Indeed業績と米国雇用連動" },
    oil:     { score: 0, reason: "直接的影響小" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "5401": { // 日本製鉄 - 鉄鋼
    usdjpy:  { score: 2, reason: "円安で輸出競争力向上" },
    us10y:   { score: 1, reason: "インフラ投資期待（適度な金利）" },
    nikkei:  { score: 1, reason: "景気敏感株として連動" },
    sp500:   { score: 1, reason: "グローバル景気連動" },
    oil:     { score: -2, reason: "エネルギーコスト直結" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "8306": { // 三菱UFJ - 銀行
    usdjpy:  { score: 1, reason: "海外資産評価益" },
    us10y:   { score: 3, reason: "金利上昇で利ざや拡大（最重要）" },
    nikkei:  { score: 2, reason: "金融株は市場連動性高" },
    sp500:   { score: 1, reason: "グローバル金融セクター連動" },
    oil:     { score: 0, reason: "直接的影響小" },
    gold:    { score: -1, reason: "リスクオフ局面で金上昇＝銀行株下落" },
  },
};

export function computeMacroScores(
  indicators: MacroIndicator[]
): StockMacroScore[] {
  const stockCodes = Object.keys(SENSITIVITY_MATRIX);
  const stockNames: Record<string, string> = {
    "6501": "日立製作所",
    "6758": "ソニーグループ",
    "6098": "リクルートHD",
    "5401": "日本製鉄",
    "8306": "三菱UFJ FG",
  };

  return stockCodes.map((code) => {
    const matrix = SENSITIVITY_MATRIX[code];
    let totalScore = 0;
    let maxPossible = 0;
    const factors: SensitivityEntry[] = [];

    for (const indicator of indicators) {
      const entry = matrix[indicator.id];
      if (!entry) continue;

      // Factor direction contribution:
      // If indicator went UP and sensitivity is positive → good
      // If indicator went UP and sensitivity is negative → bad
      const directionMultiplier =
        indicator.direction === "up" ? 1 : indicator.direction === "down" ? -1 : 0;

      const contribution = entry.score * directionMultiplier;
      totalScore += contribution;
      maxPossible += Math.abs(entry.score);

      factors.push({
        factorId: indicator.id,
        factorName: indicator.nameJa,
        score: contribution,
        reason: entry.reason,
      });
    }

    const normalizedScore = maxPossible > 0
      ? Math.round((totalScore / maxPossible) * 100)
      : 0;

    let signal = "中立";
    if (normalizedScore >= 30) signal = "追い風";
    else if (normalizedScore >= 10) signal = "やや追い風";
    else if (normalizedScore <= -30) signal = "向かい風";
    else if (normalizedScore <= -10) signal = "やや向かい風";

    return {
      code,
      name: stockNames[code] || code,
      totalScore,
      maxPossible,
      normalizedScore,
      signal,
      factors,
    };
  });
}
