import { NextRequest, NextResponse } from "next/server";

const MODEL = "claude-sonnet-5";

// 日次キャッシュ（サーバーレスインスタンス単位）。
// 同じ日のうちはAPIコストをかけずに再利用する
let cache: { key: string; briefing: any; generatedAt: string } | null = null;

function jstDateKey(): string {
  return new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export async function GET() {
  const key = jstDateKey();
  if (cache && cache.key === key) {
    return NextResponse.json({ briefing: cache.briefing, generatedAt: cache.generatedAt, cached: true });
  }
  return NextResponse.json({ briefing: null, cached: false });
}

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
    const { stocks, macro, force } = body;

    const key = jstDateKey();
    if (!force && cache && cache.key === key) {
      return NextResponse.json({ briefing: cache.briefing, generatedAt: cache.generatedAt, cached: true });
    }

    const macroLines = (macro?.indicators ?? [])
      .map(
        (m: any) =>
          `- ${m.nameJa}: ${m.value}${m.unit}（前日比 ${m.changePct > 0 ? "+" : ""}${m.changePct}% / 5日 ${m.changePct5d > 0 ? "+" : ""}${m.changePct5d}%）`
      )
      .join("\n");

    const stockLines = (stocks ?? [])
      .map((s: any) => {
        const sig = (s.signals ?? []).map((x: any) => x.label).join("、") || "なし";
        return `- ${s.name}(${s.code}): ¥${s.price?.toLocaleString()} 前日比${s.changePct > 0 ? "+" : ""}${s.changePct}% 5日${s.changePct5d > 0 ? "+" : ""}${s.changePct5d ?? "?"}% / RSI ${s.rsi?.toFixed?.(0) ?? "?"} / ${s.macdTrend} / MA${s.maSignal} / ${s.perIsForward ? "予想" : ""}PER ${s.per ?? "?"}倍 / 52週高値比 ${s.pctFrom52wHigh ?? "?"}% / シグナル: ${sig}`;
      })
      .join("\n");

    const macroScoreLines = (macro?.scores ?? [])
      .map((s: any) => `- ${s.name}: ${s.normalizedScore > 0 ? "+" : ""}${s.normalizedScore}（${s.signal}）`)
      .join("\n");

    const prompt = `あなたは日本株の運用チームに毎朝ブリーフィングを行うシニアストラテジストです。以下のウォッチリスト10銘柄とマクロ環境のデータに基づき、今日のブリーフィングを作成してください。データにない事実の断定は避け、データから読み取れる示唆に集中してください。

【マクロ指標】
${macroLines || "データなし"}

【ウォッチリスト】
${stockLines || "データなし"}

【銘柄別マクロ感応度スコア（-100〜+100）】
${macroScoreLines || "データなし"}

以下の形式でJSON（のみ）で回答してください：
{
  "headline": "今日の市場を一言で表すキャッチコピー（20字以内）",
  "marketView": "マクロ環境と全体観の解説（2-3文）",
  "highlights": [
    {"code": "銘柄コード", "name": "銘柄名", "stance": "強気" | "中立" | "弱気", "comment": "注目理由を1-2文（テクニカルシグナルやマクロ感応度に言及）"}
  ],
  "watchPoints": ["今日〜今週注意すべきポイント1", "ポイント2", "ポイント3"]
}

highlightsはシグナルが出ている・動きが大きいなど、今日特に注目すべき銘柄を3〜5個選んでください。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "ブリーフィング生成に失敗しました" }, { status: 500 });
    }

    const data = await response.json();
    const blocks: any[] = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    let briefing: any = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) briefing = JSON.parse(jsonMatch[0]);
    } catch {}
    if (!briefing) {
      briefing = { headline: "ブリーフィング", marketView: text, highlights: [], watchPoints: [] };
    }

    const generatedAt = new Date().toISOString();
    cache = { key, briefing, generatedAt };

    return NextResponse.json({ briefing, generatedAt, cached: false });
  } catch (error) {
    console.error("Briefing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
