import clsx from 'clsx';

type Props = {
  title: string;
  value: number;
  format?: 'currency' | 'percent' | 'count';
  className?: string;
};

function formatValue(v: number, format: Props['format']) {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(v);
    case 'percent':
      return `${(v * 100).toFixed(1)}%`;
    case 'count':
    default:
      return new Intl.NumberFormat('en-US').format(v);
  }
}

export function SummaryCard({ title, value, format = 'count', className }: Props) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">
        {formatValue(value, format)}
      </div>
    </div>
  );
}

