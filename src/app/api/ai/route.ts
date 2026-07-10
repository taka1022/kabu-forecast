import { NextRequest, NextResponse } from "next/server";

const MODEL = "claude-sonnet-5";

async function callClaude(
  apiKey: string,
  prompt: string,
  maxTokens = 1500
): Promise<string | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Anthropic API error:", err);
    return null;
  }

  const data = await response.json();
  // 先頭ブロックがthinkingの場合があるため、textブロックのみ抽出して結合
  const blocks: any[] = Array.isArray(data.content) ? data.content : [];
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

function parseJson(text: string): any | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "不明";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "兆円";
  if (abs >= 1e8) return (n / 1e8).toFixed(0) + "億円";
  return n.toLocaleString();
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
    const { code, name, price, action } = body;

    if (action === "analyze_auto") {
      // アプリが保持する株価・テクニカル・マクロ・業績データから自動分析
      const { data } = body;
      const q = data?.quote ?? {};
      const ind = data?.indicators ?? {};
      const macro = data?.macro;
      const financials: any[] = data?.financials ?? [];
      const targets: any[] = data?.targets ?? [];

      const finLines = financials
        .filter((f) => f.revenue != null)
        .map(
          (f) =>
            `- ${f.fiscalYear}: 売上高 ${fmtNum(f.revenue)} / 純利益 ${fmtNum(f.netIncome)}`
        )
        .join("\n");

      const macroLines = macro
        ? `スコア ${macro.score}（${macro.signal}）\n主要因子:\n` +
          (macro.factors ?? [])
            .filter((f: any) => Math.abs(f.score) >= 1)
            .map((f: any) => `- ${f.name}: ${f.score > 0 ? "+" : ""}${f.score}（${f.reason}）`)
            .join("\n")
        : "データなし";

      const targetLines = targets
        .map(
          (t) =>
            `- ${t.label}（${t.period}）: ¥${t.low?.toLocaleString()} 〜 ¥${t.high?.toLocaleString()}`
        )
        .join("\n");

      const prompt = `あなたは経験豊富な日本株アナリストです。以下のデータのみに基づいて ${q.name ?? name} (${q.code ?? code}) を客観的に分析してください。データにない事実を推測で断定しないでください。

【市場データ】
- 現在株価: ¥${q.price?.toLocaleString()}（前日比 ${q.changePct > 0 ? "+" : ""}${q.changePct}%）
- 52週レンジ: ¥${q.fiftyTwoWeekLow?.toLocaleString() ?? "不明"} 〜 ¥${q.fiftyTwoWeekHigh?.toLocaleString() ?? "不明"}
- PER: ${q.per ?? "不明"}倍 / PBR: ${q.pbr?.toFixed?.(2) ?? "不明"}倍 / 配当利回り: ${q.dividendYield ?? "不明"}%
- 時価総額: ${fmtNum(q.marketCap)}

【テクニカル（1年データから算出）】
- RSI(14): ${ind.rsi?.toFixed?.(1) ?? "不明"}（${ind.rsiSignal ?? "不明"}）
- MACD: ${ind.macdTrend ?? "不明"}
- 移動平均: ${ind.maSignal ?? "不明"}
- ボリンジャーバンド内の位置: ${ind.bbPct != null ? ind.bbPct + "%（0=−2σ, 100=+2σ）" : "不明"}

【マクロ環境（直近5営業日の変化に基づく感応度スコア）】
${macroLines}

【業績（直近年次）】
${finLines || "データなし"}

【ボラティリティベースの目標株価レンジ】
${targetLines || "データなし"}

以下の形式でJSON（のみ）で回答してください：
{
  "sentiment": "強気" | "やや強気" | "中立" | "やや弱気" | "弱気",
  "summary": "総合判断を2-3文で。テクニカル・バリュエーション・マクロの整合/矛盾に言及",
  "keyPoints": ["ポイント1", "ポイント2", "ポイント3"],
  "catalysts": ["株価上昇のカタリスト1", "カタリスト2"],
  "risks": ["リスク1", "リスク2"],
  "techView": "テクニカル面の短評（1文）",
  "valuationView": "バリュエーション面の短評（1文）"
}`;

      const text = await callClaude(apiKey, prompt, 2000);
      if (text === null) {
        return NextResponse.json({ error: "AI分析に失敗しました" }, { status: 500 });
      }
      const analysis = parseJson(text);
      return NextResponse.json({
        analysis: analysis ?? { sentiment: "中立", summary: text, keyPoints: [], catalysts: [], risks: [] },
      });
    }

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

      const text = await callClaude(apiKey, prompt, 1000);
      if (text === null) {
        return NextResponse.json({ error: "AI分析に失敗しました" }, { status: 500 });
      }
      const analysis = parseJson(text);
      return NextResponse.json({
        analysis: analysis ?? { summary: text, keyPoints: [], risk: "", upside: "" },
      });
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

      const text = await callClaude(apiKey, prompt, 1500);
      if (text === null) {
        return NextResponse.json({ error: "AI分析に失敗しました" }, { status: 500 });
      }
      const analysis = parseJson(text);
      return NextResponse.json({
        analysis: analysis ?? { sentiment: "中立", summary: text, keyPoints: [], catalysts: [], risks: [] },
      });
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
