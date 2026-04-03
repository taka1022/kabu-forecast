import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/stocks";

export const revalidate = 60; // ISR: revalidate every 60 seconds

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    return NextResponse.json({ quotes, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Failed to fetch stocks:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
