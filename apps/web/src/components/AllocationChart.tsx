import type { AllocationSlice } from '../types/models';

type Props = {
  data: AllocationSlice[];
};

const palette = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
];

export function AllocationChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.percent, 0) || 1;
  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg border border-slate-200">
        {data.map((d, i) => {
          const sharePct = (d.percent / total) * 100;
          return (
            <div
              key={`${d.assetClass}-${i}`}
              className={palette[i % palette.length]}
              style={{ width: `${sharePct}%` }}
              title={`${d.assetClass}: ${sharePct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.map((d, i) => {
          const sharePct = (d.percent / total) * 100;
          return (
            <li key={`${d.assetClass}-${i}`} className="flex items-center gap-2 text-sm">
              <span className={`inline-block h-3 w-3 rounded ${palette[i % palette.length]}`} />
              <span className="text-slate-600">{d.assetClass}</span>
              <span className="ml-auto font-medium text-slate-900">{sharePct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
