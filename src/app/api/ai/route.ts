import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { code, name, price, action } = body;

    if (action === "analyze_consensus") {
      // Analyze manually entered analyst data
      const { consensus } = body;
      const prompt = `あなたは日本株のアナリストです。以下の銘柄について、入力されたアナリストコンセンサス情報を分析し、投資判断の要点を日本語で簡潔にまとめてください。

銘柄: ${name} (${code})
現在株価: ¥${price}

アナリストコンセンサス:
- 目標株価: ¥${consensus.targetPrice}
- レーティング: ${consensus.rating}
- アナリスト数: ${consensus.analystCount}名
- コメント: ${consensus.comment}

以下の形式でJSON（のみ）で回答してください：
{
  "summary": "2-3文の総合判断",
  "upside": "目標株価までの上昇余地（%）",
  "keyPoints": ["ポイント1", "ポイント2", "ポイント3"],
  "risk": "主なリスク要因"
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Anthropic API error:", err);
        return NextResponse.json(
          { error: "AI分析に失敗しました" },
          { status: 500 }
        );
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || "";

      // Parse JSON from response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ analysis });
        }
      } catch {
        // Return raw text if JSON parse fails
      }
      return NextResponse.json({ analysis: { summary: text, keyPoints: [], risk: "", upside: "" } });
    }

    if (action === "analyze_report") {
      // Analyze pasted report text
      const { reportText } = body;
      const prompt = `あなたは日本株の投資アナリストです。以下は${name} (${code})に関するアナリストレポートの抜粋です。

現在株価: ¥${price}

レポート内容:
${reportText.slice(0, 3000)}

以下の形式でJSON（のみ）で回答してください：
{
  "sentiment": "強気" | "やや強気" | "中立" | "やや弱気" | "弱気",
  "targetPrice": 数値またはnull,
  "summary": "レポートの要点を2-3文で",
  "keyPoints": ["ポイント1", "ポイント2", "ポイント3"],
  "catalysts": ["カタリスト1", "カタリスト2"],
  "risks": ["リスク1", "リスク2"]
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "AI分析に失敗しました" },
          { status: 500 }
        );
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || "";

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ analysis });
        }
      } catch {}
      return NextResponse.json({ analysis: { sentiment: "中立", summary: text, keyPoints: [], catalysts: [], risks: [] } });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
