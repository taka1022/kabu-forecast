import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// --- Macro Indicators via Yahoo Finance ---
export interface MacroIndicator {
  id: string;
  name: string;
  nameJa: string;
  value: number;
  prevValue: number;
  change: number;
  changePct: number;
  changePct5d: number; // 5営業日変化率（スコアリングに使用）
  unit: string;
  direction: "up" | "down" | "flat"; // 前日比の方向（表示用）
  trend5d: "up" | "down" | "flat"; // 5日トレンド（スコアリング用）
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
  const settled = await Promise.allSettled(
    MACRO_TICKERS.map(async (m) => {
      const q: any = await yf.quote(m.ticker);
      const price = q.regularMarketPrice ?? 0;
      const prev = q.regularMarketPreviousClose ?? price;
      const change = Math.round((price - prev) * 100) / 100;
      const changePct = prev ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;

      // 5営業日トレンド: 日次の方向はノイズが大きいため、
      // スコアリングには直近5営業日の変化率を使う
      let changePct5d = changePct;
      try {
        const start = new Date();
        start.setDate(start.getDate() - 14);
        const chart: any = await yf.chart(m.ticker, {
          period1: start,
          period2: new Date(),
          interval: "1d",
        });
        const closes: number[] = (chart?.quotes ?? [])
          .map((r: any) => r.close)
          .filter((c: any) => c != null);
        if (closes.length >= 6) {
          const base = closes[closes.length - 6];
          const last = closes[closes.length - 1];
          if (base) changePct5d = Math.round(((last - base) / base) * 10000) / 100;
        }
      } catch {
        // chartが取れない場合は前日比で代用
      }

      // ±0.15%未満は「横這い」とみなしノイズを除外
      const trend5d: MacroIndicator["trend5d"] =
        changePct5d > 0.15 ? "up" : changePct5d < -0.15 ? "down" : "flat";

      return {
        id: m.id,
        name: m.name,
        nameJa: m.nameJa,
        value: Math.round(price * 100) / 100,
        prevValue: Math.round(prev * 100) / 100,
        change,
        changePct,
        changePct5d,
        unit: m.unit,
        direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
        trend5d,
      } as MacroIndicator;
    })
  );

  return settled
    .filter(
      (r): r is PromiseFulfilledResult<MacroIndicator> => r.status === "fulfilled"
    )
    .map((r) => r.value);
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
  "9984": { // ソフトバンクG - 投資会社・テック
    usdjpy:  { score: 1, reason: "海外投資先の円換算評価" },
    us10y:   { score: -3, reason: "グロース投資主体のため金利感応度が極めて高い" },
    nikkei:  { score: 2, reason: "市場センチメント連動" },
    sp500:   { score: 3, reason: "米国テック投資が中核（ARM等）" },
    oil:     { score: 0, reason: "直接的影響小" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "285A": { // キオクシア - NAND半導体
    usdjpy:  { score: 2, reason: "円安で輸出競争力・海外売上増" },
    us10y:   { score: -2, reason: "グロース株として金利感応度高" },
    nikkei:  { score: 1, reason: "市場センチメント連動" },
    sp500:   { score: 2, reason: "半導体セクター全体の連動" },
    oil:     { score: -1, reason: "製造コスト増（クリーンルーム電力）" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "6857": { // アドバンテスト - 半導体検査装置
    usdjpy:  { score: 2, reason: "円安で海外売上の円換算増" },
    us10y:   { score: -2, reason: "グロース株として金利感応度高" },
    nikkei:  { score: 2, reason: "市場センチメント連動" },
    sp500:   { score: 3, reason: "米国半導体投資と直結（NVIDIA等向け）" },
    oil:     { score: 0, reason: "直接的影響小" },
    gold:    { score: 0, reason: "直接的影響小" },
  },
  "7011": { // 三菱重工 - 防衛・エネルギー・航空
    usdjpy:  { score: 2, reason: "円安で海外事業・防衛輸出に有利" },
    us10y:   { score: 0, reason: "防衛需要は金利非感応" },
    nikkei:  { score: 1, reason: "景気連動だが防衛需要で下支え" },
    sp500:   { score: 1, reason: "グローバル景気連動" },
    oil:     { score: 1, reason: "エネルギー事業（ガスタービン等）に追い風" },
    gold:    { score: 1, reason: "地政学リスク上昇で防衛関連に資金流入" },
  },
  "7012": { // 川崎重工 - 防衛・航空・二輪
    usdjpy:  { score: 2, reason: "円安で海外売上増（バイク・航空）" },
    us10y:   { score: 0, reason: "防衛需要は金利非感応" },
    nikkei:  { score: 1, reason: "景気連動" },
    sp500:   { score: 1, reason: "グローバル景気連動" },
    oil:     { score: -1, reason: "航空・輸送コスト増" },
    gold:    { score: 1, reason: "地政学リスク上昇で防衛関連に資金流入" },
  },
};

// 各因子の「典型的な5営業日の変化率(%)」— これを1.0倍の基準とする
const TYPICAL_5D_MOVE: Record<string, number> = {
  usdjpy: 1.0,
  us10y: 3.0,
  nikkei: 2.0,
  sp500: 2.0,
  oil: 4.0,
  gold: 2.0,
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
    "9984": "ソフトバンクG",
    "285A": "キオクシアHD",
    "6857": "アドバンテスト",
    "7011": "三菱重工業",
    "7012": "川崎重工業",
  };

  return stockCodes.map((code) => {
    const matrix = SENSITIVITY_MATRIX[code];
    let totalScore = 0;
    let maxPossible = 0;
    const factors: SensitivityEntry[] = [];

    for (const indicator of indicators) {
      const entry = matrix[indicator.id];
      if (!entry) continue;

      // 5営業日の変化率を典型変動幅で正規化し、±1.5倍にクランプ。
      // 方向だけでなく「どれだけ動いたか」をスコアに反映する
      const typical = TYPICAL_5D_MOVE[indicator.id] ?? 2.0;
      const multiplier = Math.max(
        -1.5,
        Math.min(1.5, indicator.changePct5d / typical)
      );

      const contribution = Math.round(entry.score * multiplier * 10) / 10;
      totalScore += contribution;
      maxPossible += Math.abs(entry.score) * 1.5;

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
