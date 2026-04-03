import { useEffect, useMemo, useState } from 'react';
import type { StrategyBenchmark, StrategyKind } from '@fremont/shared';
import { LOCAL_STORAGE_KEYS, STRATEGY_KINDS } from '@fremont/shared';
import { api } from '../lib/api';
import { safeLocalGet, safeLocalSet } from '../utils/storage';

const STRATEGIES: StrategyKind[] = [...STRATEGY_KINDS];

const formatPercentInput = (value: number) => ((Number.isFinite(value) ? value : 0) * 100).toFixed(1);

const parsePercentInput = (value: string) => {
  const cleaned = value.replace(/%/g, '').replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed / 100 : null;
};

type FormattedPercentInputProps = {
  value: number;
  onValueChange: (next: number) => void;
  className: string;
};

function FormattedPercentInput({ value, onValueChange, className }: FormattedPercentInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatPercentInput(value);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={shown}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = parsePercentInput(raw);
        if (parsed !== null) onValueChange(parsed);
      }}
      onBlur={() => {
        const raw = draft ?? '';
        if (raw.trim() === '') {
          onValueChange(0);
        } else {
          const parsed = parsePercentInput(raw);
          if (parsed !== null) onValueChange(parsed);
        }
        setDraft(null);
      }}
    />
  );
}

const makeBenchmarkId = (strategy: StrategyKind, year: number) =>
  `bench-${strategy.replace(/\s+/g, '-').toLowerCase()}-${year}`;

const normalizeBenchmarks = (raw: unknown): StrategyBenchmark[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is StrategyBenchmark => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<StrategyBenchmark>;
    return Boolean(row.strategy && typeof row.year === 'number');
  });
};

export function StrategyBenchmarksAdmin() {
  const [benchmarks, setBenchmarks] = useState<StrategyBenchmark[]>(() =>
    normalizeBenchmarks(safeLocalGet<unknown>(LOCAL_STORAGE_KEYS.strategyBenchmarks, [])),
  );
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'local-only' | 'error'>('idle');
  const [remoteEnabled, setRemoteEnabled] = useState(false);

  useEffect(() => {
    safeLocalSet(LOCAL_STORAGE_KEYS.strategyBenchmarks, benchmarks);
  }, [benchmarks]);

  useEffect(() => {
    let active = true;
    void api
      .strategyBenchmarks()
      .then((resp) => {
        if (!active) return;
        setBenchmarks(resp);
        setRemoteEnabled(true);
      })
      .catch(() => {
        if (!active) return;
        setRemoteEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    benchmarks.forEach((item) => set.add(item.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [benchmarks]);

  useEffect(() => {
    if (!years.includes(selectedYear)) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  const rowsForYear = useMemo(() => {
    return STRATEGIES.map((strategy) => {
      return (
        benchmarks.find((row) => row.year === selectedYear && row.strategy === strategy) ?? {
          id: makeBenchmarkId(strategy, selectedYear),
          strategy,
          year: selectedYear,
          targetReturnRate: 0,
          actualReturnRate: 0,
          plannedLiquidityRate: 0,
          actualLiquidityRate: 0,
        }
      );
    });
  }, [benchmarks, selectedYear]);

  const updateRow = (strategy: StrategyKind, updates: Partial<StrategyBenchmark>) => {
    setBenchmarks((prev) => {
      const existingIndex = prev.findIndex((row) => row.year === selectedYear && row.strategy === strategy);
      if (existingIndex < 0) {
        return [
          ...prev,
          {
            id: makeBenchmarkId(strategy, selectedYear),
            strategy,
            year: selectedYear,
            targetReturnRate: 0,
            actualReturnRate: 0,
            plannedLiquidityRate: 0,
            actualLiquidityRate: 0,
            ...updates,
          },
        ];
      }
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...updates };
      return next;
    });
    setSaveState('idle');
  };

  const addYear = () => {
    const nextYear = (years[years.length - 1] ?? new Date().getFullYear()) + 1;
    setSelectedYear(nextYear);
    setBenchmarks((prev) => {
      const additions = STRATEGIES.filter(
        (strategy) => !prev.some((row) => row.year === nextYear && row.strategy === strategy),
      ).map((strategy) => ({
        id: makeBenchmarkId(strategy, nextYear),
        strategy,
        year: nextYear,
        targetReturnRate: 0,
        actualReturnRate: 0,
        plannedLiquidityRate: 0,
        actualLiquidityRate: 0,
      }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    setSaveState('idle');
  };

  const save = async () => {
    if (!remoteEnabled) {
      setSaveState('local-only');
      return;
    }
    setSaving(true);
    try {
      const resp = await api.upsertStrategyBenchmarks({
        benchmarks: benchmarks.map((row) => ({
          strategy: row.strategy,
          year: row.year,
          targetReturnRate: row.targetReturnRate,
          actualReturnRate: row.actualReturnRate,
          plannedLiquidityRate: row.plannedLiquidityRate,
          actualLiquidityRate: row.actualLiquidityRate,
        })),
      });
      setBenchmarks(resp);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800">Strategy Benchmarks (Global)</h3>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-slate-600">Year</label>
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={addYear}
          >
            Add Year
          </button>
          <button
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        These percentages apply to all users. User-level Reporting uses these rates with each user's strategy capital.
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Strategy</th>
              <th className="px-3 py-2 text-right font-medium">Target Return %</th>
              <th className="px-3 py-2 text-right font-medium">Actual Return %</th>
              <th className="px-3 py-2 text-right font-medium">Planned Liquidity Yield %</th>
              <th className="px-3 py-2 text-right font-medium">Actual Liquidity Yield %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rowsForYear.map((row) => (
              <tr key={`${row.strategy}-${row.year}`}>
                <td className="px-3 py-2 font-medium text-slate-700">{row.strategy}</td>
                <td className="px-3 py-2 text-right">
                  <FormattedPercentInput
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                    value={row.targetReturnRate}
                    onValueChange={(next) => updateRow(row.strategy, { targetReturnRate: next })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <FormattedPercentInput
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                    value={row.actualReturnRate}
                    onValueChange={(next) => updateRow(row.strategy, { actualReturnRate: next })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <FormattedPercentInput
                    className="w-32 rounded border border-slate-200 px-2 py-1 text-right"
                    value={row.plannedLiquidityRate}
                    onValueChange={(next) => updateRow(row.strategy, { plannedLiquidityRate: next })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <FormattedPercentInput
                    className="w-32 rounded border border-slate-200 px-2 py-1 text-right"
                    value={row.actualLiquidityRate}
                    onValueChange={(next) => updateRow(row.strategy, { actualLiquidityRate: next })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {saveState === 'saved' && <div className="mt-2 text-xs text-emerald-700">Saved to API. Reporting will use these values.</div>}
      {saveState === 'local-only' && (
        <div className="mt-2 text-xs text-amber-700">
          Saved locally only (API unavailable). Reporting uses API data, so plan vs outcome will not change until API save succeeds.
        </div>
      )}
      {saveState === 'error' && (
        <div className="mt-2 text-xs text-rose-700">
          Save failed (ADMIN role required). Reporting remains unchanged until this saves successfully.
        </div>
      )}
    </div>
  );
}
