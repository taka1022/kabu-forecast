import { NextResponse } from "next/server";
import { WATCHED_STOCKS, fetchStockQuote, fetchHistory } from "@/lib/stocks";
import { detectSignals, computeTechSummary, Signal } from "@/lib/signals";

export const revalidate = 300;

export interface OverviewStock {
  code: string;
  name: string;
  nameEn: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  changePct5d: number | null;
  marketCap: number;
  per: number | null;
  perIsForward: boolean;
  dividendYield: number | null;
  rsi: number | null;
  macdTrend: string;
  maSignal: string;
  techScore: number;
  pctFrom52wHigh: number | null;
  spark: number[]; // 直近30営業日の終値
  signals: Signal[];
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      WATCHED_STOCKS.map(async (s) => {
        const [quote, history] = await Promise.all([
          fetchStockQuote(s.code),
          fetchHistory(s.code, "1y"),
        ]);
        if (!quote || history.length === 0) return null;

        const tech = computeTechSummary(history, quote.price, quote.fiftyTwoWeekHigh);
        const signals = detectSignals(
          history,
          quote.price,
          quote.fiftyTwoWeekHigh,
          quote.fiftyTwoWeekLow
        );

        const stock: OverviewStock = {
          code: quote.code,
          name: quote.name,
          nameEn: quote.nameEn,
          sector: quote.sector,
          price: quote.price,
          change: quote.change,
          changePct: quote.changePct,
          changePct5d: tech.changePct5d,
          marketCap: quote.marketCap,
          per: quote.per,
          perIsForward: quote.perIsForward,
          dividendYield: quote.dividendYield,
          rsi: tech.rsi,
          macdTrend: tech.macdTrend,
          maSignal: tech.maSignal,
          techScore: tech.techScore,
          pctFrom52wHigh: tech.pctFrom52wHigh,
          spark: history.slice(-30).map((h) => h.price),
          signals,
        };
        return { stock, history };
      })
    );

    const items = results
      .filter(
        (r): r is PromiseFulfilledResult<{ stock: OverviewStock; history: any[] } | null> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value)
      .filter((v): v is { stock: OverviewStock; history: any[] } => v !== null);

    // 相対パフォーマンス（直近6ヶ月 ≒ 126営業日、起点=100）
    // 基準銘柄の日付列に他銘柄を日付文字列でマッピングして揃える
    const DAYS = 126;
    let relative: Record<string, string | number>[] = [];
    if (items.length > 0) {
      const ref = items.reduce((a, b) =>
        b.history.length > a.history.length ? b : a
      );
      const refDates = ref.history.slice(-DAYS).map((h: any) => h.date);
      const priceMaps = items.map(({ stock, history }) => {
        const m = new Map<string, number>();
        for (const h of history.slice(-(DAYS + 10))) m.set(h.date, h.price);
        return { code: stock.code, map: m };
      });
      const bases = new Map<string, number>();
      relative = refDates.map((date) => {
        const row: Record<string, string | number> = { date };
        for (const { code, map } of priceMaps) {
          const p = map.get(date);
          if (p == null) continue;
          if (!bases.has(code)) bases.set(code, p);
          const base = bases.get(code)!;
          if (base > 0) row[code] = Math.round((p / base) * 1000) / 10;
        }
        return row;
      });
    }

    return NextResponse.json({
      stocks: items.map((i) => i.stock),
      relative,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to build overview:", error);
    return NextResponse.json(
      { error: "Failed to build overview" },
      { status: 500 }
    );
  }
}
