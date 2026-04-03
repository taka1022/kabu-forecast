import { NextRequest, NextResponse } from "next/server";
import { fetchStockQuote, fetchHistory, computeMA } from "@/lib/stocks";

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
    const [quote, history] = await Promise.all([
      fetchStockQuote(code),
      fetchHistory(code, period),
    ]);

    if (!quote) {
      return NextResponse.json(
        { error: "Stock not found" },
        { status: 404 }
      );
    }

    const ma25 = computeMA(history, 25);
    const ma75 = computeMA(history, 75);

    const chartData = history.map((h, i) => ({
      ...h,
      ma25: ma25[i],
      ma75: ma75[i],
    }));

    return NextResponse.json({
      quote,
      history: chartData,
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
