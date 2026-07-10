import { NextRequest, NextResponse } from "next/server";
import {
  fetchStockQuote,
  fetchHistory,
  computeMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeTargetRanges,
  fetchFinancials,
} from "@/lib/stocks";

export const revalidate = 60;

// 表示期間ごとの営業日数（指標は常に1年分で計算し、表示分だけスライスする）
const DISPLAY_DAYS: Record<string, number> = {
  "1mo": 22,
  "3mo": 64,
  "6mo": 128,
  "1y": 9999,
};

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") || "3mo";

  try {
    const [quote, fullHistory, financials] = await Promise.all([
      fetchStockQuote(code),
      fetchHistory(code, "1y"),
      fetchFinancials(code),
    ]);

    if (!quote) {
      return NextResponse.json(
        { error: "Stock not found" },
        { status: 404 }
      );
    }

    // 全指標を1年分の履歴で計算。これにより1M/3M表示でも
    // MA75やRSIが欠損せず、統合スコアも表示期間に依存しない
    const ma5 = computeMA(fullHistory, 5);
    const ma25 = computeMA(fullHistory, 25);
    const ma75 = computeMA(fullHistory, 75);
    const bb = computeBollingerBands(fullHistory);
    const rsi = computeRSI(fullHistory);
    const macd = computeMACD(fullHistory);

    const chartAll = fullHistory.map((h, i) => ({
      ...h,
      ma5: ma5[i],
      ma25: ma25[i],
      ma75: ma75[i],
      bbUpper2: bb.upper2[i],
      bbUpper1: bb.upper1[i],
      bbMid: bb.mid[i],
      bbLower1: bb.lower1[i],
      bbLower2: bb.lower2[i],
      rsi: rsi[i],
      macd: macd.macd[i],
      macdSignal: macd.signal[i],
      macdHist: macd.histogram[i],
    }));

    const days = DISPLAY_DAYS[period] ?? 64;
    const chartData = chartAll.slice(-days);

    const targetRanges = computeTargetRanges(
      fullHistory,
      quote.price,
      quote.per,
      quote.eps
    );

    // Latest indicator summary (always from full 1y history)
    const latestRsi = rsi.filter((v) => v !== null).pop() ?? null;
    const latestMacd = macd.macd.filter((v) => v !== null).pop() ?? null;
    const latestMacdSignal = macd.signal.filter((v) => v !== null).pop() ?? null;
    const latestMacdHist = macd.histogram.filter((v) => v !== null).pop() ?? null;
    const latestMa25 = ma25.filter((v) => v !== null).pop() ?? null;
    const latestMa75 = ma75.filter((v) => v !== null).pop() ?? null;
    const latestBbUpper = bb.upper2.filter((v) => v !== null).pop() ?? null;
    const latestBbLower = bb.lower2.filter((v) => v !== null).pop() ?? null;

    let rsiSignal = "中立";
    if (latestRsi !== null) {
      if (latestRsi >= 70) rsiSignal = "買われすぎ";
      else if (latestRsi <= 30) rsiSignal = "売られすぎ";
    }

    let macdTrend = "中立";
    if (latestMacdHist !== null) {
      if (latestMacdHist > 0) macdTrend = "上昇トレンド";
      else if (latestMacdHist < 0) macdTrend = "下降トレンド";
    }

    // 移動平均の配列: 価格 > MA25 > MA75 なら上昇配列（パーフェクトオーダー）
    let maSignal = "中立";
    if (latestMa25 !== null && latestMa75 !== null && quote.price > 0) {
      if (quote.price > latestMa25 && latestMa25 > latestMa75) maSignal = "上昇配列";
      else if (quote.price < latestMa25 && latestMa25 < latestMa75) maSignal = "下降配列";
    }

    // ボリンジャーバンド内での現在値の位置（0=下限-2σ, 100=上限+2σ）
    let bbPct: number | null = null;
    if (
      latestBbUpper !== null &&
      latestBbLower !== null &&
      latestBbUpper > latestBbLower
    ) {
      bbPct = Math.round(
        ((quote.price - latestBbLower) / (latestBbUpper - latestBbLower)) * 100
      );
    }

    return NextResponse.json({
      quote,
      history: chartData,
      targetRanges,
      indicators: {
        rsi: latestRsi,
        rsiSignal,
        macd: latestMacd,
        macdSignal: latestMacdSignal,
        macdHistogram: latestMacdHist,
        macdTrend,
        maSignal,
        bbPct,
      },
      updatedAt: new Date().toISOString(),
      financials,
    });
  } catch (error) {
    console.error(`Failed to fetch stock ${code}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
