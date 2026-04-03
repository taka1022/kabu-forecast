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
