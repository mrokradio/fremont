import { useMemo, useState } from 'react';
import { TOP_LEVEL_ASSET_CATEGORIES, FREMONT_SUB_CATEGORIES, STRATEGY_KINDS } from '@fremont/shared';
import type { Position, StrategyKind } from '@fremont/shared';
import { formatCurrency, formatPercent } from '../utils/format';

// ── Asset class suggestions ───────────────────────────────────────────────────
const ASSET_CLASS_SUGGESTIONS: string[] = [
  ...TOP_LEVEL_ASSET_CATEGORIES,
  ...FREMONT_SUB_CATEGORIES.map((sub) => `Fremont Holdings / ${sub}`),
];

// ── Strategy styling ──────────────────────────────────────────────────────────
const STRATEGY_BADGE: Record<StrategyKind, string> = {
  'Liquidity Program': 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  OpCos: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'BF Global': 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'Opportunities Fund': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

const STRATEGY_GROUP_BG: Record<StrategyKind, string> = {
  'Liquidity Program': 'bg-sky-50/60 border-sky-200',
  OpCos: 'bg-emerald-50/60 border-emerald-200',
  'BF Global': 'bg-violet-50/60 border-violet-200',
  'Opportunities Fund': 'bg-amber-50/60 border-amber-200',
};

const STRATEGY_GROUP_TEXT: Record<StrategyKind, string> = {
  'Liquidity Program': 'text-sky-800',
  OpCos: 'text-emerald-800',
  'BF Global': 'text-violet-800',
  'Opportunities Fund': 'text-amber-800',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type CreatePositionInput = Pick<
  Position,
  'name' | 'assetClass' | 'strategy' | 'year' | 'value' | 'costBasis' | 'irr' | 'tags' | 'liquid' | 'owner'
>;

type Props = {
  positions: Position[];
  onToggleLiquid?: (id: string, value: boolean) => void;
  onAddPosition?: () => Position | null | undefined;
  onCreatePosition?: (input: CreatePositionInput) => Position | null | undefined;
  onDeletePosition?: (id: string) => void;
  onUpdatePosition?: (pos: Position) => void;
};

type SortKey = 'name' | 'assetClass' | 'strategy' | 'value' | 'irr';

type StrategyGroup = {
  strategy: StrategyKind | null; // null = unassigned
  positions: Position[];
  total: number;
};

// ── Component ─────────────────────────────────────────────────────────────────
export function PositionsView({
  positions,
  onToggleLiquid,
  onUpdatePosition,
  onAddPosition,
  onCreatePosition: _onCreatePosition,
  onDeletePosition,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [groupByStrategy, setGroupByStrategy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Position | null>(null);

  // All distinct tags across all positions
  const allTags = useMemo(
    () => Array.from(new Set(positions.flatMap((p) => p.tags || []))).sort(),
    [positions],
  );

  // Filtered + sorted flat list
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byText = term
      ? positions.filter((p) =>
          [p.name, p.assetClass, p.strategy ?? ''].some((f) => f.toLowerCase().includes(term)),
        )
      : positions;
    const byTags = selectedTags.length
      ? byText.filter((p) => selectedTags.every((t) => (p.tags || []).includes(t)))
      : byText;

    return [...byTags].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'assetClass':
          return a.assetClass.localeCompare(b.assetClass);
        case 'strategy': {
          const sa = a.strategy ?? 'zzz';
          const sb = b.strategy ?? 'zzz';
          return sa.localeCompare(sb);
        }
        case 'irr':
          return (b.irr ?? -Infinity) - (a.irr ?? -Infinity);
        case 'value':
        default:
          return b.value - a.value;
      }
    });
  }, [positions, q, selectedTags, sortKey]);

  // Positions grouped by strategy (in canonical STRATEGY_KINDS order, unassigned last)
  const grouped = useMemo((): StrategyGroup[] => {
    const buckets = new Map<StrategyKind | null, Position[]>();
    for (const k of STRATEGY_KINDS) buckets.set(k, []);
    buckets.set(null, []);

    for (const p of filtered) {
      buckets.get(p.strategy ?? null)!.push(p);
    }

    return Array.from(buckets.entries())
      .filter(([, ps]) => ps.length > 0)
      .map(([strategy, ps]) => ({
        strategy,
        positions: ps,
        total: ps.reduce((s, p) => s + p.value, 0),
      }));
  }, [filtered]);

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const beginEdit = (p: Position) => {
    setEditingId(p.id);
    setDraft({ ...p, tags: [...(p.tags || [])] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const commitEdit = () => {
    if (!editingId || !draft) return;

    const normalized: Position = {
      id: draft.id,
      name: draft.name,
      assetClass: draft.assetClass,
      strategy: draft.strategy,
      year: draft.year != null ? Number(draft.year) : undefined,
      value: Number(draft.value) || 0,
      costBasis: draft.costBasis != null ? Number(draft.costBasis) : undefined,
      irr: draft.irr != null ? Number(draft.irr) : undefined,
      tags: (draft.tags || []).map((t) => t.trim()).filter(Boolean),
      liquid: !!draft.liquid,
      owner: draft.owner?.trim() || undefined,
    };

    onUpdatePosition && onUpdatePosition(normalized);
    setEditingId(null);
    setDraft(null);
  };

  const addRow = () => {
    if (!onAddPosition) return;
    const created = onAddPosition();
    if (created) beginEdit(created);
  };

  // ── Row renderer (shared between flat and grouped views) ──────────────────
  const renderRow = (p: Position) => (
    <tr key={p.id} className="text-sm hover:bg-slate-50/50">
      {/* Actions */}
      <td className="px-3 py-2 text-center">
        {editingId === p.id ? (
          <div className="flex justify-center gap-1">
            <button
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
              title="Cancel"
              onClick={cancelEdit}
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
            <button
              className="rounded bg-brand-600 p-1 text-white hover:bg-brand-700"
              title="Save"
              onClick={commitEdit}
            >
              <span className="material-symbols-outlined text-base">done</span>
            </button>
          </div>
        ) : (
          <button
            className="rounded p-1 text-slate-600 hover:bg-slate-100"
            title="Edit"
            onClick={() => beginEdit(p)}
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
        )}
      </td>

      {/* Name */}
      <td className="px-4 py-2 text-slate-800">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1"
            value={draft?.name || ''}
            onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
          />
        ) : (
          p.name
        )}
      </td>

      {/* Asset Class */}
      <td className="px-4 py-2 text-slate-600">
        {editingId === p.id ? (
          <>
            <input
              className="w-full rounded border border-slate-200 px-2 py-1"
              list="asset-class-suggestions"
              value={draft?.assetClass || ''}
              onChange={(e) => setDraft((d) => d && { ...d, assetClass: e.target.value })}
            />
            <datalist id="asset-class-suggestions">
              {ASSET_CLASS_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        ) : (
          p.assetClass
        )}
      </td>

      {/* Strategy */}
      <td className="px-4 py-2">
        {editingId === p.id ? (
          <select
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={draft?.strategy ?? ''}
            onChange={(e) =>
              setDraft((d) =>
                d && { ...d, strategy: (e.target.value as StrategyKind) || undefined },
              )
            }
          >
            <option value="">— None —</option>
            {STRATEGY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        ) : p.strategy ? (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STRATEGY_BADGE[p.strategy]}`}
          >
            {p.strategy}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>

      {/* Owner */}
      <td className="px-4 py-2 text-slate-600">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1"
            placeholder="e.g. Smith Family Trust"
            value={draft?.owner || ''}
            onChange={(e) =>
              setDraft((d) => d && { ...d, owner: e.target.value || undefined })
            }
          />
        ) : (
          <span className={p.owner ? 'text-slate-800' : 'text-slate-400'}>{p.owner || '—'}</span>
        )}
      </td>

      {/* Year */}
      <td className="px-4 py-2 text-right text-slate-900">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1 text-right"
            value={draft?.year ?? ''}
            type="number"
            min={1900}
            max={3000}
            step={1}
            onChange={(e) =>
              setDraft((d) =>
                d && { ...d, year: e.target.value === '' ? undefined : Number(e.target.value) },
              )
            }
          />
        ) : p.year != null ? (
          p.year
        ) : (
          '—'
        )}
      </td>

      {/* Value */}
      <td className="px-4 py-2 text-right font-medium text-slate-900">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1 text-right"
            value={draft?.value ?? 0}
            type="number"
            onChange={(e) => setDraft((d) => d && { ...d, value: Number(e.target.value) })}
          />
        ) : (
          formatCurrency(p.value)
        )}
      </td>

      {/* Cost Basis */}
      <td className="px-4 py-2 text-right text-slate-700">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1 text-right"
            value={draft?.costBasis ?? ''}
            type="number"
            onChange={(e) =>
              setDraft((d) =>
                d && {
                  ...d,
                  costBasis: e.target.value === '' ? undefined : Number(e.target.value),
                },
              )
            }
          />
        ) : p.costBasis != null ? (
          formatCurrency(p.costBasis)
        ) : (
          '—'
        )}
      </td>

      {/* IRR */}
      <td className="px-4 py-2 text-right text-slate-700">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1 text-right"
            value={draft?.irr != null ? (Number(draft.irr) * 100).toString() : ''}
            type="number"
            step="0.1"
            onChange={(e) =>
              setDraft((d) =>
                d && {
                  ...d,
                  irr: e.target.value === '' ? undefined : Number(e.target.value) / 100,
                },
              )
            }
          />
        ) : (
          formatPercent(p.irr)
        )}
      </td>

      {/* Liquid */}
      <td className="px-4 py-2 text-center">
        {editingId === p.id ? (
          <input
            type="checkbox"
            checked={!!draft?.liquid}
            onChange={(e) => setDraft((d) => d && { ...d, liquid: e.target.checked })}
          />
        ) : (
          <input
            type="checkbox"
            checked={!!p.liquid}
            onChange={(e) => onToggleLiquid && onToggleLiquid(p.id, e.target.checked)}
            aria-label={`Mark ${p.name} as ${p.liquid ? 'illiquid' : 'liquid'}`}
          />
        )}
      </td>

      {/* Tags */}
      <td className="px-4 py-2">
        {editingId === p.id ? (
          <input
            className="w-full rounded border border-slate-200 px-2 py-1"
            value={(draft?.tags || []).join(', ')}
            onChange={(e) =>
              setDraft((d) =>
                d && {
                  ...d,
                  tags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              )
            }
            placeholder="tag1, tag2"
          />
        ) : (
          <div className="flex flex-wrap gap-1">
            {(p.tags || []).map((t) => {
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
        )}
      </td>

      {/* Delete */}
      <td className="px-4 py-2 text-right">
        {editingId !== p.id && (
          <button
            className="rounded p-1 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
            title="Delete"
            onClick={() => onDeletePosition && onDeletePosition(p.id)}
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        )}
      </td>
    </tr>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          onClick={addRow}
          title="Add position"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search positions…"
          className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-slate-500">Tags:</span>
            {allTags.map((t) => {
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
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}
        {selectedTags.length > 0 && (
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => setSelectedTags([])}
          >
            Clear tags
          </button>
        )}

        {/* Right-side controls */}
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          {/* Group by strategy toggle */}
          <button
            onClick={() => setGroupByStrategy((v) => !v)}
            className={
              'flex items-center gap-1 rounded-md border px-2 py-1 text-sm ' +
              (groupByStrategy
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50')
            }
            title="Group positions by strategy"
          >
            <span className="material-symbols-outlined text-base">account_tree</span>
            Group by Strategy
          </button>

          {/* Sort buttons (hidden when grouped — groups are in canonical order) */}
          {!groupByStrategy && (
            <>
              <span className="text-sm text-slate-500">Sort:</span>
              {(
                [
                  ['value', 'Value'],
                  ['irr', 'IRR'],
                  ['strategy', 'Strategy'],
                  ['name', 'Name'],
                  ['assetClass', 'Asset Class'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={
                    'rounded-md border px-2 py-1 text-sm ' +
                    (sortKey === key
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50')
                  }
                  onClick={() => setSortKey(key)}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[1050px] w-full bg-white">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-3 py-2 text-center font-medium">Actions</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Asset Class</th>
              <th className="px-4 py-2 font-medium">Strategy</th>
              <th className="px-4 py-2 font-medium">Owner / Entity</th>
              <th className="px-4 py-2 text-right font-medium">Year</th>
              <th className="px-4 py-2 text-right font-medium">Value</th>
              <th className="px-4 py-2 text-right font-medium">Cost Basis</th>
              <th className="px-4 py-2 text-right font-medium">IRR</th>
              <th className="px-4 py-2 text-center font-medium">Liquid</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 text-right font-medium">Delete</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {groupByStrategy
              ? grouped.flatMap((group) => {
                  const label = group.strategy ?? 'Unassigned';
                  const headerBg = group.strategy
                    ? STRATEGY_GROUP_BG[group.strategy]
                    : 'bg-slate-100/60 border-slate-300';
                  const headerText = group.strategy
                    ? STRATEGY_GROUP_TEXT[group.strategy]
                    : 'text-slate-600';

                  return [
                    // Strategy group header row
                    <tr
                      key={`grp-${label}`}
                      className={`border-t-2 ${headerBg}`}
                    >
                      <td colSpan={12} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${headerText}`}>{label}</span>
                          <div className="flex items-center gap-6 text-sm text-slate-500">
                            <span>
                              {group.positions.length}{' '}
                              {group.positions.length === 1 ? 'position' : 'positions'}
                            </span>
                            <span className={`font-semibold ${headerText}`}>
                              {formatCurrency(group.total)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>,
                    // Position rows within this group
                    ...group.positions.map((p) => renderRow(p)),
                  ];
                })
              : filtered.map((p) => renderRow(p))}

            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={12}>
                  No positions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Strategy summary cards (only in grouped mode) */}
      {groupByStrategy && grouped.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {grouped
            .filter((g) => g.strategy !== null)
            .map((g) => {
              const strategy = g.strategy!;
              const badgeCls = STRATEGY_BADGE[strategy];
              return (
                <div
                  key={strategy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className={`mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
                    {strategy}
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {formatCurrency(g.total)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {g.positions.length} {g.positions.length === 1 ? 'position' : 'positions'}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
