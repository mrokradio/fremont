import { useMemo, useState } from 'react';
import type { Transaction, TransactionCategory } from '../types/models';

type Props = {
  items: Transaction[];
  initialLimit?: number;
};

const categoryStyles: Record<TransactionCategory, string> = {
  'Capital Call': 'bg-rose-50 text-rose-700 ring-rose-200',
  Distribution: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Fee: 'bg-amber-50 text-amber-800 ring-amber-200',
  Interest: 'bg-sky-50 text-sky-700 ring-sky-200',
  Dividend: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Transfer: 'bg-slate-100 text-slate-700 ring-slate-200',
  Expense: 'bg-orange-50 text-orange-800 ring-orange-200',
  Other: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const categoryIcons: Record<TransactionCategory, string> = {
  'Capital Call': 'account_balance',
  Distribution: 'payments',
  Fee: 'receipt_long',
  Interest: 'savings',
  Dividend: 'paid',
  Transfer: 'sync_alt',
  Expense: 'money_off',
  Other: 'label',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

export function TransactionsTable({ items, initialLimit = 8 }: Props) {
  const [filterCategory, setFilterCategory] = useState<TransactionCategory | 'All'>('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [limit, setLimit] = useState(initialLimit);

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))), [items]);

  const filtered = useMemo(() => {
    return items
      .filter(i => (filterCategory === 'All' ? true : i.category === filterCategory))
      .filter(i => (selectedTags.length ? selectedTags.every(t => (i.tags || []).includes(t)) : true))
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [items, filterCategory, selectedTags]);

  const visible = filtered.slice(0, limit);
  const canShowMore = filtered.length > limit;

  const toggleTag = (t: string) =>
    setSelectedTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Filter:</span>
        <button
          className={`rounded-md border px-2 py-1 text-sm ${
            filterCategory === 'All'
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setFilterCategory('All')}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`rounded-md border px-2 py-1 text-sm ${
              filterCategory === cat
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
            <span className="text-sm text-slate-500">Tags:</span>
            {selectedTags.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100"
                title={`Remove #${t}`}
              >
                #{t} ×
              </button>
            ))}
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => setSelectedTags([])}
              title="Clear all tag filters"
            >
              Clear tags
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[640px] bg-white">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((tx) => (
              <tr key={tx.id} className="text-sm">
                <td className="px-4 py-2 text-slate-500">{tx.date}</td>
                <td className="px-4 py-2 text-slate-800">{tx.description}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${categoryStyles[tx.category]}`}>
                    <span className="material-symbols-outlined text-[14px] leading-none">{categoryIcons[tx.category]}</span>
                    {tx.category}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(tx.tags || []).map((t) => {
                      const active = selectedTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleTag(t)}
                          className={
                            'rounded-full px-2 py-0.5 text-xs ' +
                            (active
                              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                          }
                          title={`${active ? 'Remove' : 'Filter by'} #${t}`}
                        >
                          #{t}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                    {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={5}>
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canShowMore && (
        <div className="mt-3 text-center">
          <button
            className="rounded-md bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            onClick={() => setLimit(l => l + initialLimit)}
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
