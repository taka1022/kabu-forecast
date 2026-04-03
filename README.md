# KABUFORECAST — 株価予測ダッシュボード

日本株5銘柄（日立・ソニー・リクルート・日本製鉄・三菱UFJ）の株価予測・分析ダッシュボード。

## Phase 1: 株価データ表示
- リアルタイム株価取得（yahoo-finance2）
- 株価チャート（1M/3M/6M/1Y）
- 移動平均線（MA25, MA75）
- ファンダメンタルズ指標（PER, PBR, 配当利回り等）
- 5分間隔の自動更新

## 技術スタック
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Recharts
- yahoo-finance2 v3

## デプロイ

```bash
# 依存関係インストール
npm install

# 開発サーバー
npm run dev

# Vercelへデプロイ
npx vercel --prod
```

## 今後のフェーズ
- Phase 2: 定量モデル（ボリンジャーバンド・RSI・目標株価レンジ）
- Phase 3: マクロ環境（FRED API連携・因子スコアリング）
- Phase 4: AI分析（Claude API連携・PDF解析）
- Phase 5: 統合予測ダッシュボード
