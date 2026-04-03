import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

export const WATCHED_STOCKS = [
  { code: "6501", name: "日立製作所", nameEn: "Hitachi", sector: "電気機器" },
  { code: "6758", name: "ソニーグループ", nameEn: "Sony Group", sector: "電気機器" },
  { code: "6098", name: "リクルートHD", nameEn: "Recruit Holdings", sector: "サービス" },
  { code: "5401", name: "日本製鉄", nameEn: "Nippon Steel", sector: "鉄鋼" },
  { code: "8306", name: "三菱UFJ FG", nameEn: "MUFG", sector: "銀行" },
];

function toTicker(code: string) {
  return `${code}.T`;
}

export interface StockQuote {
  code: string;
  name: string;
  nameEn: string;
  sector: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
  eps: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface HistoryPoint {
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export async function fetchStockQuote(code: string): Promise<StockQuote | null> {
  const meta = WATCHED_STOCKS.find((s) => s.code === code);
  if (!meta) return null;

  try {
    const ticker = toTicker(code);
    const quote: any = await yf.quote(ticker);

    const price = quote.regularMarketPrice ?? 0;
    const prevClose = quote.regularMarketPreviousClose ?? 0;
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    return {
      code,
      name: meta.name,
      nameEn: meta.nameEn,
      sector: meta.sector,
      price,
      prevClose,
      change: Math.round(change * 10) / 10,
      changePct: Math.round(changePct * 100) / 100,
      open: quote.regularMarketOpen ?? 0,
      high: quote.regularMarketDayHigh ?? 0,
      low: quote.regularMarketDayLow ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      marketCap: quote.marketCap ?? 0,
      per: quote.trailingPE ?? null,
      pbr: quote.priceToBook ?? null,
      dividendYield: quote.dividendYield
        ? Math.round(quote.dividendYield * 100) / 100
        : null,
      eps: quote.epsTrailingTwelveMonths ?? null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
    };
  } catch (err) {
    console.error(`Failed to fetch quote for ${code}:`, err);
    return null;
  }
}

export async function fetchAllQuotes(): Promise<StockQuote[]> {
  const results = await Promise.allSettled(
    WATCHED_STOCKS.map((s) => fetchStockQuote(s.code))
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<StockQuote | null> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value as StockQuote);
}

export async function fetchHistory(
  code: string,
  period: "1mo" | "3mo" | "6mo" | "1y" = "3mo"
): Promise<HistoryPoint[]> {
  try {
    const ticker = toTicker(code);
    const result: any[] = await yf.historical(ticker, {
      period1: getStartDate(period),
      period2: new Date(),
      interval: "1d",
    });

    return result.map((row) => ({
      date: formatDate(row.date),
      price: Math.round(row.close * 10) / 10,
      open: Math.round(row.open * 10) / 10,
      high: Math.round(row.high * 10) / 10,
      low: Math.round(row.low * 10) / 10,
      volume: row.volume,
    }));
  } catch (err) {
    console.error(`Failed to fetch history for ${code}:`, err);
    return [];
  }
}

function getStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "1mo":
      return new Date(now.setMonth(now.getMonth() - 1));
    case "3mo":
      return new Date(now.setMonth(now.getMonth() - 3));
    case "6mo":
      return new Date(now.setMonth(now.getMonth() - 6));
    case "1y":
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setMonth(now.getMonth() - 3));
  }
}

function formatDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

// Compute moving averages from history
export function computeMA(
  history: HistoryPoint[],
  window: number
): (number | null)[] {
  return history.map((_, i) => {
    if (i < window - 1) return null;
    const slice = history.slice(i - window + 1, i + 1);
    const avg = slice.reduce((s, p) => s + p.price, 0) / window;
    return Math.round(avg * 10) / 10;
  });
}

// --- Phase 2: Technical Indicators ---

// Bollinger Bands (20-day, ±1σ, ±2σ)
export function computeBollingerBands(
  history: HistoryPoint[],
  window = 20
): { upper2: (number | null)[]; upper1: (number | null)[]; mid: (number | null)[]; lower1: (number | null)[]; lower2: (number | null)[] } {
  const upper2: (number | null)[] = [];
  const upper1: (number | null)[] = [];
  const mid: (number | null)[] = [];
  const lower1: (number | null)[] = [];
  const lower2: (number | null)[] = [];

  for (let i = 0; i < history.length; i++) {
    if (i < window - 1) {
      upper2.push(null); upper1.push(null); mid.push(null);
      lower1.push(null); lower2.push(null);
      continue;
    }
    const slice = history.slice(i - window + 1, i + 1).map((h) => h.price);
    const avg = slice.reduce((s, v) => s + v, 0) / window;
    const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / window;
    const sd = Math.sqrt(variance);

    mid.push(Math.round(avg * 10) / 10);
    upper1.push(Math.round((avg + sd) * 10) / 10);
    upper2.push(Math.round((avg + 2 * sd) * 10) / 10);
    lower1.push(Math.round((avg - sd) * 10) / 10);
    lower2.push(Math.round((avg - 2 * sd) * 10) / 10);
  }
  return { upper2, upper1, mid, lower1, lower2 };
}

// RSI (14-day)
export function computeRSI(
  history: HistoryPoint[],
  period = 14
): (number | null)[] {
  const rsi: (number | null)[] = [];

  if (history.length < period + 1) {
    return history.map(() => null);
  }

  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < history.length; i++) {
    changes.push(history[i].price - history[i - 1].price);
  }

  // First RSI: simple average
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  rsi.push(null); // index 0 has no change
  for (let i = 0; i < period; i++) rsi.push(null);

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(Math.round((100 - 100 / (1 + rs)) * 10) / 10);

  // Subsequent RSI: smoothed average
  for (let i = period + 1; i < changes.length; i++) {
    const gain = changes[i] >= 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(Math.round((100 - 100 / (1 + rs2)) * 10) / 10);
  }

  return rsi;
}

// MACD (12, 26, 9)
export function computeMACD(
  history: HistoryPoint[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const prices = history.map((h) => h.price);

  function ema(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < slow - 1) {
      macdLine.push(null);
    } else {
      macdLine.push(Math.round((emaFast[i] - emaSlow[i]) * 10) / 10);
    }
  }

  // Signal line: EMA of MACD
  const validMacd = macdLine.filter((v): v is number => v !== null);
  const signalEma = ema(validMacd, signal);

  const signalLine: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  let validIdx = 0;

  for (let i = 0; i < prices.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null);
      histogram.push(null);
    } else {
      if (validIdx < signal - 1) {
        signalLine.push(null);
        histogram.push(null);
      } else {
        const sig = Math.round(signalEma[validIdx] * 10) / 10;
        signalLine.push(sig);
        histogram.push(Math.round((macdLine[i]! - sig) * 10) / 10);
      }
      validIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// --- Target Price Range ---
export interface TargetRange {
  label: string;
  period: string;
  low: number;
  mid: number;
  high: number;
  currentPrice: number;
  positionPct: number; // 0-100, where current price sits in range
}

export function computeTargetRanges(
  history: HistoryPoint[],
  currentPrice: number,
  per: number | null,
  eps: number | null
): TargetRange[] {
  const ranges: TargetRange[] = [];

  // Helper: annualized volatility from a slice
  function calcVolatility(slice: HistoryPoint[]): number {
    if (slice.length < 2) return 0;
    const returns: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      returns.push(Math.log(slice[i].price / slice[i - 1].price));
    }
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(252); // annualize
  }

  // Short-term (1 month): last 30 days volatility
  const short = history.slice(-30);
  const shortVol = calcVolatility(short);
  const shortFactor = shortVol * Math.sqrt(1 / 12); // 1 month
  const shortLow = Math.round(currentPrice * (1 - shortFactor * 1.5));
  const shortHigh = Math.round(currentPrice * (1 + shortFactor * 1.5));
  ranges.push({
    label: "短期",
    period: "1ヶ月",
    low: shortLow,
    mid: currentPrice,
    high: shortHigh,
    currentPrice,
    positionPct: calcPosition(currentPrice, shortLow, shortHigh),
  });

  // Mid-term (3-6 months): last 6 months volatility + PER-based fair value
  const midSlice = history.slice(-120);
  const midVol = calcVolatility(midSlice);
  const midFactor = midVol * Math.sqrt(4.5 / 12); // ~4.5 months
  let midTarget = currentPrice;
  if (per && eps && per > 0) {
    // Use sector-average PER as a rough guide (mean reversion)
    const fairPER = per * 0.95; // slight mean reversion
    midTarget = Math.round(fairPER * eps);
  }
  const midLow = Math.round(Math.min(currentPrice, midTarget) * (1 - midFactor));
  const midHigh = Math.round(Math.max(currentPrice, midTarget) * (1 + midFactor));
  ranges.push({
    label: "中期",
    period: "3〜6ヶ月",
    low: midLow,
    mid: midTarget,
    high: midHigh,
    currentPrice,
    positionPct: calcPosition(currentPrice, midLow, midHigh),
  });

  // Long-term (1 year): full history volatility + trend
  const longVol = calcVolatility(history);
  const longFactor = longVol * Math.sqrt(1); // 1 year
  // Trend: linear regression slope
  const trend = calcTrend(history);
  const trendTarget = Math.round(currentPrice * (1 + trend));
  const longLow = Math.round(Math.min(currentPrice, trendTarget) * (1 - longFactor * 0.8));
  const longHigh = Math.round(Math.max(currentPrice, trendTarget) * (1 + longFactor * 0.8));
  ranges.push({
    label: "長期",
    period: "1年",
    low: longLow,
    mid: trendTarget,
    high: longHigh,
    currentPrice,
    positionPct: calcPosition(currentPrice, longLow, longHigh),
  });

  return ranges;
}

function calcPosition(current: number, low: number, high: number): number {
  if (high === low) return 50;
  return Math.round(((current - low) / (high - low)) * 100);
}

function calcTrend(history: HistoryPoint[]): number {
  if (history.length < 10) return 0;
  const n = history.length;
  const prices = history.map((h) => h.price);
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((s, p) => s + p, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (prices[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = num / den;
  // Annualized return based on daily slope
  const dailyReturn = slope / yMean;
  return dailyReturn * 252;
}
