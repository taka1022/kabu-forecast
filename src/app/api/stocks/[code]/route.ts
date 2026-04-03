import { NextRequest, NextResponse } from "next/server";
import {
  fetchStockQuote,
  fetchHistory,
  computeMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeTargetRanges,
} from "@/lib/stocks";

export const revalidate = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;
  const searchParams = request.nextUrl.searchParams;
  const period = (searchParams.get("period") || "3mo") as
    | "1mo"
    | "3mo"
    | "6mo"
    | "1y";

  try {
    // Fetch display history + 1y history for target range calculation
    const [quote, history, fullHistory] = await Promise.all([
      fetchStockQuote(code),
      fetchHistory(code, period),
      fetchHistory(code, "1y"),
    ]);

    if (!quote) {
      return NextResponse.json(
        { error: "Stock not found" },
        { status: 404 }
      );
    }

    const ma25 = computeMA(history, 25);
    const ma75 = computeMA(history, 75);
    const bb = computeBollingerBands(history);
    const rsi = computeRSI(history);
    const macd = computeMACD(history);

    const chartData = history.map((h, i) => ({
      ...h,
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

    // Target ranges use full 1y history
    const targetRanges = computeTargetRanges(
      fullHistory,
      quote.price,
      quote.per,
      quote.eps
    );

    // Latest RSI/MACD summary
    const latestRsi = rsi.filter((v) => v !== null).pop() ?? null;
    const latestMacd = macd.macd.filter((v) => v !== null).pop() ?? null;
    const latestMacdSignal = macd.signal.filter((v) => v !== null).pop() ?? null;
    const latestMacdHist = macd.histogram.filter((v) => v !== null).pop() ?? null;

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
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Failed to fetch stock ${code}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
