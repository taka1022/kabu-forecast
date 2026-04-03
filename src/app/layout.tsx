import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KABUFORECAST — 株価予測ダッシュボード",
  description: "日本株5銘柄の株価予測・分析ダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
