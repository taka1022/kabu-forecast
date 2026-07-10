"use client";

// Recharts Barのカスタムシェイプとして描画するローソク足。
// Bar dataKey="hl"（=[low, high]）でy/heightがそのレンジに対応するため、
// payloadのopen/closeを線形補間して実体を描く。
// 日本の慣行: 陽線=赤、陰線=緑
export function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || payload.high == null || payload.low == null) return <g />;

  const open: number = payload.open;
  const close: number = payload.price;
  const high: number = payload.high;
  const low: number = payload.low;
  const up = close >= open;
  const color = up ? "#E11D48" : "#059669";
  const cx = x + width / 2;

  const range = high - low;
  if (range <= 0 || height <= 0) {
    return (
      <line x1={x} x2={x + width} y1={y} y2={y} stroke={color} strokeWidth={1.2} />
    );
  }

  const scale = height / range;
  const bodyTopVal = Math.max(open, close);
  const bodyBotVal = Math.min(open, close);
  const bodyY = y + (high - bodyTopVal) * scale;
  const bodyH = Math.max(1, (bodyTopVal - bodyBotVal) * scale);

  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect
        x={x}
        y={bodyY}
        width={Math.max(1.5, width)}
        height={bodyH}
        fill={color}
        rx={0.5}
      />
    </g>
  );
}
