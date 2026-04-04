import { useMemo, useState } from 'react';
import type { StrategyKind } from '@fremont/shared';
import { STRATEGY_KINDS, TOP_LEVEL_ASSET_CATEGORIES, FREMONT_SUB_CATEGORIES } from '@fremont/shared';
import type { Position } from '../types/models';
import { formatCurrency, formatPercent } from '../utils/format';

// Flat list of asset class suggestions for the dropdown/datalist
const ASSET_CLASS_SUGGESTIONS: string[] = [
  ...TOP_LEVEL_ASSET_CATEGORIES,
  ...FREMONT_SUB_CATEGORIES.map((sub) => `Fremont Holdings / ${sub}`),
];

type CreatePositionInput = Pick<
  Position,
  'name' | 'assetClass' | 'year' | 'value' | 'costBasis' | 'irr' | 'tags' | 'liquid' | 'owner'
>;

type Props = {
  positions: Position[];
  onToggleLiquid?: (id: string, value: boolean) => void;
  onAddPosition?: () => Position | null | undefined;
  onCreatePosition?: (input: CreatePositionInput) => Position | null | undefined;
  onDeletePosition?: (id: string) => void;
  onUpdatePosition?: (pos: Position) => void;
};

type SortKey = 'name' | 'assetClass' | 'value' | 'irr';

type DisplayPosition = Position & {
  isStrategyRow?: boolean;
  isVirtualStrategyRow?: boolean;
  strategyKind?: StrategyKind;
};

const STRATEGIES: StrategyKind[] = [...STRATEGY_KINDS];
const STRATEGY_ASSET_CLASS = 'Fremont Strategy';
const STRATEGY_TAG = 'fremont-strategy';

const isStrategyKind = (value: string): value is StrategyKind =>
  (STRATEGIES as readonly string[]).includes(value);

const ensureStrategyTags = (tags: string[] | undefined): string[] =>
  Array.from(new Set([...(tags || []), STRATEGY_TAG]));

export function PositionsView({
  positions,
  onToggleLiquid,
  onUpdatePosition,
  onAddPosition,
  onCreatePosition,
  onDeletePosition,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DisplayPosition | null>(null);

  const allRows = useMemo<DisplayPosition[]>(() => {
    const mappedPositions = positions.map<DisplayPosition>((position) => {
      const strategyKind =
        position.assetClass === STRATEGY_ASSET_CLASS && isStrategyKind(position.name)
          ? position.name
          : undefined;

      return {
        ...position,
        isStrategyRow: !!strategyKind,
        isVirtualStrategyRow: false,
        strategyKind,
      };
    });

    const existingStrategies = new Set(
      mappedPositions
        .filter((position): position is DisplayPosition & { strategyKind: StrategyKind } =>
          Boolean(position.isStrategyRow && position.strategyKind),
        )
        .map((position) => position.strategyKind),
    );

    const virtualRows: DisplayPosition[] = STRATEGIES.filter((strategy) => !existingStrategies.has(strategy)).map(
      (strategy) => ({
        id: `virtual-strategy-${strategy.replace(/\s+/g, '-').toLowerCase()}`,
        name: strategy,
        assetClass: STRATEGY_ASSET_CLASS,
        value: 0,
        tags: [STRATEGY_TAG],
        liquid: false,
        isStrategyRow: true,
        isVirtualStrategyRow: true,
        strategyKind: strategy,
      }),
    );

    return [...mappedPositions, ...virtualRows];
  }, [positions]);

  const allTags = useMemo(() => Array.from(new Set(allRows.flatMap((p) => p.tags || []))).sort(), [allRows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byText = term
      ? allRows.filter((p) => [p.name, p.assetClass].some((f) => f.toLowerCase().includes(term)))
      : allRows;
    const byTags = selectedTags.length
      ? byText.filter((p) => selectedTags.every((t) => (p.tags || []).includes(t)))
      : byText;

    const sorted = [...byTags].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'assetClass':
          return a.assetClass.localeCompare(b.assetClass);
        case 'irr':
          return (b.irr ?? -Infinity) - (a.irr ?? -Infinity);
        case 'value':
        default:
          return b.value - a.value;
      }
    });
    return sorted;
  }, [allRows, q, selectedTags, sortKey]);

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const beginEdit = (p: DisplayPosition) => {
    setEditingId(p.id);
    setDraft({ ...p, tags: [...(p.tags || [])] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const commitEdit = () => {
    if (!editingId || !draft) return;

    if (draft.isStrategyRow) {
      const nextValue = Number(draft.value) || 0;

      if (draft.isVirtualStrategyRow) {
        if (onCreatePosition) {
          onCreatePosition({
            name: draft.strategyKind ?? draft.name,
            assetClass: STRATEGY_ASSET_CLASS,
            year: draft.year != null ? Number(draft.year) : undefined,
            value: nextValue,
            tags: [STRATEGY_TAG],
            liquid: false,
          });
        }
        setEditingId(null);
        setDraft(null);
        return;
      }

      const normalized: Position = {
        id: draft.id,
        name: draft.strategyKind ?? draft.name,
        assetClass: STRATEGY_ASSET_CLASS,
        year: draft.year != null ? Number(draft.year) : undefined,
        value: nextValue,
        tags: ensureStrategyTags(draft.tags),
        liquid: false,
      };

      onUpdatePosition && onUpdatePosition(normalized);
      setEditingId(null);
      setDraft(null);
      return;
    }

    const normalized: Position = {
      id: draft.id,
      name: draft.name,
      assetClass: draft.assetClass,
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

  return (
    <div>
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
          placeholder="Search positions"
          className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
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
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          <span className="text-sm text-slate-500">Sort by:</span>
          {(
            [
              ['value', 'Value'],
              ['irr', 'IRR'],
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
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[900px] bg-white">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-600">
              <th className="px-3 py-2 text-center font-medium">Actions</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Asset Class</th>
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
            {filtered.map((p) => {
              const isStrategyRow = !!p.isStrategyRow;
              return (
                <tr key={p.id} className="text-sm">
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
                  <td className="px-4 py-2 text-slate-800">
                    {editingId === p.id && !isStrategyRow ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        value={draft?.name || ''}
                        onChange={(e) => setDraft((d) => ({ ...(d as DisplayPosition), name: e.target.value }))}
                      />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {editingId === p.id && !isStrategyRow ? (
                      <>
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          list="asset-class-suggestions"
                          value={draft?.assetClass || ''}
                          onChange={(e) =>
                            setDraft((d) => ({ ...(d as DisplayPosition), assetClass: e.target.value }))
                          }
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
                  <td className="px-4 py-2 text-slate-600">
                    {editingId === p.id && !isStrategyRow ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        placeholder="e.g. Smith Family Trust"
                        value={draft?.owner || ''}
                        onChange={(e) =>
                          setDraft((d) => ({ ...(d as DisplayPosition), owner: e.target.value || undefined }))
                        }
                      />
                    ) : (
                      <span className={p.owner ? 'text-slate-800' : 'text-slate-400'}>
                        {p.owner || '—'}
                      </span>
                    )}
                  </td>
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
                          setDraft((d) => ({
                            ...(d as DisplayPosition),
                            year: e.target.value === '' ? undefined : Number(e.target.value),
                          }))
                        }
                      />
                    ) : p.year != null ? (
                      p.year
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-900">
                    {editingId === p.id ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right"
                        value={draft?.value ?? 0}
                        type="number"
                        onChange={(e) =>
                          setDraft((d) => ({ ...(d as DisplayPosition), value: Number(e.target.value) }))
                        }
                      />
                    ) : (
                      formatCurrency(p.value)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    {isStrategyRow ? (
                      '—'
                    ) : editingId === p.id ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right"
                        value={draft?.costBasis ?? ''}
                        type="number"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...(d as DisplayPosition),
                            costBasis: e.target.value === '' ? undefined : Number(e.target.value),
                          }))
                        }
                      />
                    ) : p.costBasis != null ? (
                      formatCurrency(p.costBasis)
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    {isStrategyRow ? (
                      '—'
                    ) : editingId === p.id ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right"
                        value={draft?.irr != null ? (Number(draft.irr) * 100).toString() : ''}
                        type="number"
                        step="0.1"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...(d as DisplayPosition),
                            irr: e.target.value === '' ? undefined : Number(e.target.value) / 100,
                          }))
                        }
                      />
                    ) : (
                      formatPercent(p.irr)
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isStrategyRow ? (
                      <span className="text-slate-400">—</span>
                    ) : editingId === p.id ? (
                      <input
                        type="checkbox"
                        checked={!!draft?.liquid}
                        onChange={(e) =>
                          setDraft((d) => ({ ...(d as DisplayPosition), liquid: e.target.checked }))
                        }
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
                  <td className="px-4 py-2">
                    {isStrategyRow ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        #fremont-strategy
                      </span>
                    ) : editingId === p.id ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        value={(draft?.tags || []).join(', ')}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...(d as DisplayPosition),
                            tags: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          }))
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
                  <td className="px-4 py-2 text-right">
                    {!p.isVirtualStrategyRow && editingId !== p.id && (
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
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={11}>
                  No positions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
