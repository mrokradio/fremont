import { formatCurrency } from '../utils/format';

type Item = { label: string; amount: number };
type Props = { items: Item[]; startValue: number; startLabel?: string; endLabel?: string; showConnectors?: boolean };

// SVG waterfall with cumulative connectors and start/end columns
export function WaterfallChart({ items, startValue, startLabel = 'Start', endLabel = 'Total', showConnectors = false }: Props) {
  // cumulative values
  const points: { label: string; type: 'start' | 'delta' | 'end'; delta: number; cum: number }[] = [];
  let cum = startValue;
  points.push({ label: startLabel, type: 'start', delta: startValue, cum });
  for (const it of items) {
    cum += it.amount;
    points.push({ label: it.label, type: 'delta', delta: it.amount, cum });
  }
  const endCum = cum;
  points.push({ label: endLabel, type: 'end', delta: endCum, cum: endCum });

  const allCum = [0, startValue];
  let rc = startValue;
  for (const it of items) { rc += it.amount; allCum.push(rc); }
  allCum.push(endCum);
  const minV = Math.min(...allCum, 0);
  const maxV = Math.max(...allCum, 0);

  const CH = 260; // drawable height
  const TOP = 40; // top padding for value labels
  const BOTTOM = 70; // space for category labels
  const CW = points.length * 110 + 60;
  const y = (v: number) => TOP + (CH - ((v - minV) / (maxV - minV || 1)) * CH);

  return (
    <div className="overflow-x-auto">
      <svg width={CW} height={TOP + CH + BOTTOM} role="img" aria-label="Waterfall chart">
        {/* baseline */}
        <line x1={40} y1={y(0)} x2={CW - 20} y2={y(0)} stroke="#cbd5e1" strokeDasharray="4 4" />
        {points.map((p, i) => {
          const x = 60 + i * 110;
          const w = 60;
          if (p.type === 'start') {
            const y0 = y(0), y1 = y(startValue); const h = Math.abs(y1 - y0);
            return (
              <g key={i}>
                <rect x={x} y={Math.min(y0, y1)} width={w} height={h} rx={4} fill="#94a3b8" />
                <text x={x + w/2} y={Math.min(y0, y1) - 6} textAnchor="middle" fontSize={12} fill="#334155">{formatCurrency(startValue)}</text>
                <text x={x + w/2} y={TOP + CH + 40} textAnchor="middle" fontSize={12} fill="#475569">{p.label}</text>
              </g>
            );
          }
          if (p.type === 'delta') {
            const prevCum = points[i - 1].cum;
            const yPrev = y(prevCum);
            const yNew = y(p.cum);
            const h = Math.max(2, Math.abs(yNew - yPrev));
            const yTop = Math.min(yPrev, yNew);
            const color = p.delta >= 0 ? '#10b981' : '#ef4444';
            return (
              <g key={i}>
                {showConnectors && (
                  <line x1={x - 25} y1={yPrev} x2={x} y2={yPrev} stroke="#94a3b8" strokeWidth={2} />
                )}
                <rect x={x} y={yTop} width={w} height={h} rx={4} fill={color} />
                <text x={x + w/2} y={yTop - 6} textAnchor="middle" fontSize={12} fill="#334155">{p.delta >= 0 ? '+' : ''}{formatCurrency(p.delta)}</text>
                <text x={x + w/2} y={TOP + CH + 40} textAnchor="middle" fontSize={12} fill="#475569">{p.label}</text>
              </g>
            );
          }
          const y0 = y(0), y1 = y(endCum); const h = Math.abs(y1 - y0);
          return (
            <g key={i}>
              {showConnectors && (
                <line x1={x - 25} y1={y(points[i - 1].cum)} x2={x} y2={y(points[i - 1].cum)} stroke="#94a3b8" strokeWidth={2} />
              )}
              <rect x={x} y={Math.min(y0, y1)} width={w} height={h} rx={4} fill="#64748b" />
              <text x={x + w/2} y={Math.min(y0, y1) - 6} textAnchor="middle" fontSize={12} fill="#334155">{formatCurrency(endCum)}</text>
              <text x={x + w/2} y={TOP + CH + 40} textAnchor="middle" fontSize={12} fill="#475569">{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
