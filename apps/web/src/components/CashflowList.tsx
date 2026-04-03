import type { Cashflow } from '../types/models';

type Props = { items: Cashflow[] };

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

export function CashflowList({ items }: Props) {
  return (
    <ul className="divide-y divide-slate-200">
      {items.map((cf) => (
        <li key={`${cf.date}-${cf.description}`} className="flex items-center gap-3 py-2">
          <span className="w-24 shrink-0 text-sm text-slate-500 sm:w-28">{cf.date}</span>
          <span className="text-sm text-slate-700">{cf.description}</span>
          <span
            className={
              'ml-auto rounded-md px-2 py-0.5 text-sm ' +
              (cf.amount >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700')
            }
          >
            {cf.amount >= 0 ? '+' : ''}{formatCurrency(cf.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
