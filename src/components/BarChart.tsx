import { useState } from 'react';

export interface Bar {
  key: string;
  label: string;
  value: number;
  tip: string;
}

/**
 * Single-series bar chart (one hue, so no legend — the card title names it).
 * Thin bars rounded at the data end, recessive grid, optional reference line,
 * per-bar hover/focus tooltip with a hit area taller than the bar.
 */
export function BarChart({ bars, reference, referenceLabel, max: maxIn, height = 220, format = (n: number) => n.toFixed(0) }: {
  bars: Bar[];
  reference?: number;
  referenceLabel?: string;
  max?: number;
  height?: number;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = { l: 36, r: 8, t: 12, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const rawMax = Math.max(maxIn ?? 0, reference ?? 0, ...bars.map((b) => b.value), 1);
  const step = rawMax > 200 ? 50 : rawMax > 50 ? 25 : rawMax > 20 ? 5 : rawMax > 5 ? 2 : 1;
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).filter((_, i, arr) => arr.length <= 6 || i % Math.ceil(arr.length / 5) === 0);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const slot = innerW / Math.max(bars.length, 1);
  const bw = Math.min(28, slot * 0.6);
  const showEvery = Math.ceil(bars.length / 10);

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={bars.map((b) => `${b.label}: ${format(b.value)}`).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2;
          const top = y(b.value);
          const h = Math.max(0, pad.t + innerH - top);
          const r = Math.min(4, h / 2, bw / 2);
          const path = h > 0
            ? `M${x},${pad.t + innerH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + innerH} Z`
            : '';
          return (
            <g key={b.key}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={b.tip}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={innerH} fill="transparent" />
              {path && <path d={path} fill="var(--brand-2)" opacity={hover === null || hover === i ? 1 : 0.55} />}
              {i % showEvery === 0 && (
                <text x={x + bw / 2} y={height - pad.b + 16} textAnchor="middle">{b.label.length > 12 ? b.label.slice(0, 11) + '…' : b.label}</text>
              )}
            </g>
          );
        })}
        {reference !== undefined && (
          <g pointerEvents="none">
            <line x1={pad.l} x2={W - pad.r} y1={y(reference)} y2={y(reference)} stroke="var(--brown)" strokeWidth={1.5} strokeDasharray="4 4" />
            {referenceLabel && <text x={W - pad.r} y={y(reference) - 5} textAnchor="end" style={{ fill: 'var(--brown)' }}>{referenceLabel}</text>}
          </g>
        )}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="var(--border-strong)" />
      </svg>
      {hover !== null && bars[hover] && (
        <div className="tip" style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(bars[hover].value) / height) * 100}%` }}>
          {bars[hover].tip}
        </div>
      )}
    </div>
  );
}
