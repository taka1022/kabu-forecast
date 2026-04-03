import { NextResponse } from "next/server";
import { fetchMacroIndicators, computeMacroScores } from "@/lib/macro";

export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const indicators = await fetchMacroIndicators();
    const scores = computeMacroScores(indicators);

    return NextResponse.json({
      indicators,
      scores,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch macro data:", error);
    return NextResponse.json(
      { error: "Failed to fetch macro data" },
      { status: 500 }
    );
  }
}
