import { useMemo } from 'react';
import {
  LOCAL_STORAGE_KEYS,
  STRATEGY_KINDS,
  type ReportingYearFacts,
  type StrategyBenchmark,
} from '@fremont/shared';
import type { Position } from '../types/models';
import { formatCurrency, formatPercent } from '../utils/format';

type Props = {
  facts: ReportingYearFacts | null;
  selectedYear: number;
  positions: Position[];
};

const STRATEGY_COLORS: Record<string, string> = {
  'Liquidity Program': '#3b82f6',
  OpCos: '#0ea5e9',
  'BF Global': '#22c55e',
  'Opportunities Fund': '#f59e0b',
};

const DEFAULT_COLOR = '#94a3b8';
const STRATEGY_ASSET_CLASS = 'Fremont Strategy';

const barHeight = (value: number, maxValue: number): number => {
  if (!Number.isFinite(value) || value <= 0 || maxValue <= 0) return 0;
  return Math.max(2, Math.min(100, (value / maxValue) * 100));
};

const percentOfTotal = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return value / total;
};

const toYear = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
};

const normalizeBenchmarks = (raw: unknown): StrategyBenchmark[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is StrategyBenchmark => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Partial<StrategyBenchmark>;
      return Boolean(row.strategy && typeof row.year === 'number');
    })
    .map((row) => ({
      ...row,
      targetReturnRate: Number(row.targetReturnRate) || 0,
      actualReturnRate: Number(row.actualReturnRate) || 0,
      plannedLiquidityRate: Number(row.plannedLiquidityRate) || 0,
      actualLiquidityRate: Number(row.actualLiquidityRate) || 0,
    }));
};

export function StrategyProgressOverview({ facts, selectedYear, positions }: Props) {
  const fallbackRows = useMemo(() => {
    const currentPositions = (positions || []).filter((position) => {
      const year = toYear(position.year);
      return year === null || year <= selectedYear;
    });

    let benchmarkRaw: StrategyBenchmark[] = [];
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEYS.strategyBenchmarks);
        benchmarkRaw = normalizeBenchmarks(raw ? JSON.parse(raw) : []);
      } catch {
        benchmarkRaw = [];
      }
    }

    return STRATEGY_KINDS.map((strategy) => {
      const rows = currentPositions
        .filter((position) => position.assetClass === STRATEGY_ASSET_CLASS && position.name === strategy)
        .map((position) => ({
          ...position,
          normalizedYear: toYear(position.year),
        }))
        .sort((a, b) => (b.normalizedYear ?? -Infinity) - (a.normalizedYear ?? -Infinity));

      const dated = rows.filter((row) => row.normalizedYear !== null);
      const latestApplicable = dated.find((row) => (row.normalizedYear as number) <= selectedYear);
      const undated = rows.find((row) => row.normalizedYear === null);
      const capitalSource = latestApplicable ?? undated;
      const capital = Number(capitalSource?.value) || 0;
      const capitalYear = latestApplicable?.normalizedYear ?? null;

      const benchmarkRows = benchmarkRaw
        .filter((row) => row.strategy === strategy)
        .sort((a, b) => b.year - a.year);
      const benchmark =
        benchmarkRows.find((row) => row.year === selectedYear) ??
        benchmarkRows.find((row) => row.year <= selectedYear) ??
        benchmarkRows[0];

      const targetReturnRate = benchmark?.targetReturnRate ?? 0;
      const actualReturnRate = benchmark?.actualReturnRate ?? 0;
      const plannedLiquidityRate = benchmark?.plannedLiquidityRate ?? 0;
      const actualLiquidityRate = benchmark?.actualLiquidityRate ?? 0;
      const targetReturnValue = capital * targetReturnRate;
      const actualReturnValue = capital * actualReturnRate;
      const plannedLiquidityValue = capital * plannedLiquidityRate;
      const actualLiquidityValue = capital * actualLiquidityRate;

      return {
        strategy,
        capital,
        capitalYear,
        targetReturnRate,
        actualReturnRate,
        plannedLiquidityRate,
        actualLiquidityRate,
        targetReturnValue,
        actualReturnValue,
        plannedLiquidityValue,
        actualLiquidityValue,
        returnVariance: actualReturnValue - targetReturnValue,
        liquidityVariance: actualLiquidityValue - plannedLiquidityValue,
      };
    });
  }, [positions, selectedYear]);

  const factsRows = facts?.strategyRows ?? [];
  const factsCapital = factsRows.reduce((sum, row) => sum + row.capital, 0);
  const fallbackCapital = fallbackRows.reduce((sum, row) => sum + row.capital, 0);
  const useFallbackRows = factsRows.length === 0 || (factsCapital <= 0 && fallbackCapital > 0);
  const rows = useFallbackRows ? fallbackRows : factsRows;
  const totalCapital = rows.reduce((sum, row) => sum + row.capital, 0);

  const maxReturnRate = Math.max(0.01, ...rows.map((row) => Math.max(row.targetReturnRate, row.actualReturnRate)));
  const maxLiquidityRate = Math.max(0.01, ...rows.map((row) => Math.max(row.plannedLiquidityRate, row.actualLiquidityRate)));

  const totalTargetReturn = rows.reduce((sum, row) => sum + row.targetReturnValue, 0);
  const totalActualReturn = rows.reduce((sum, row) => sum + row.actualReturnValue, 0);
  const totalPlannedLiquidity = rows.reduce((sum, row) => sum + row.plannedLiquidityValue, 0);
  const totalActualLiquidity = rows.reduce((sum, row) => sum + row.actualLiquidityValue, 0);
  const returnImpactFallback = totalCapital > 0 ? rows.reduce((sum, row) => sum + row.returnVariance, 0) / totalCapital : 0;
  const returnImpactPct = useFallbackRows ? returnImpactFallback : (facts?.returnImpactPct ?? returnImpactFallback);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Strategy Benchmark Progress ({selectedYear})</h2>
        <div className="text-xs text-slate-500">Target vs actual outcome rates and dollar impact</div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          No strategy data yet. Add Fremont Strategy positions and benchmark rates to see progress.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div>Total Capital</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(totalCapital)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div>Return Value</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                {formatCurrency(totalActualReturn)} / {formatCurrency(totalTargetReturn)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div>Liquidity Value</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                {formatCurrency(totalActualLiquidity)} / {formatCurrency(totalPlannedLiquidity)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div>Return Impact</div>
              <div className={`mt-1 text-sm font-semibold ${returnImpactPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatPercent(returnImpactPct)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Return % Progress</h3>
                <div className="text-xs text-slate-500">Target Return % vs Actual Return %</div>
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[620px]">
                  <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />Target %</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Actual %</span>
                    <span>Scale max {formatPercent(maxReturnRate)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {rows.map((row) => {
                      const fill = STRATEGY_COLORS[row.strategy] ?? DEFAULT_COLOR;
                      const delta = row.actualReturnRate - row.targetReturnRate;
                      return (
                        <div key={`${row.strategy}-return`} className="rounded-md border border-slate-100 p-2">
                          <div className="mb-2 text-center text-xs font-medium text-slate-700">{row.strategy}</div>
                          <div className="flex h-36 items-end justify-center gap-2 rounded bg-slate-50 px-2 pb-2">
                            <div className="w-5 rounded-t bg-slate-400" style={{ height: `${barHeight(row.targetReturnRate, maxReturnRate)}%` }} title={`Target ${formatPercent(row.targetReturnRate)}`} />
                            <div className="w-5 rounded-t" style={{ height: `${barHeight(row.actualReturnRate, maxReturnRate)}%`, backgroundColor: fill }} title={`Actual ${formatPercent(row.actualReturnRate)}`} />
                          </div>
                          <div className="mt-2 space-y-0.5 text-center text-xs text-slate-600">
                            <div>{formatPercent(row.actualReturnRate)} / {formatPercent(row.targetReturnRate)}</div>
                            <div className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>Delta {formatPercent(delta)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Liquidity Yield % Progress</h3>
                <div className="text-xs text-slate-500">Planned Yield % vs Actual Yield %</div>
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[620px]">
                  <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />Planned %</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Actual %</span>
                    <span>Scale max {formatPercent(maxLiquidityRate)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {rows.map((row) => {
                      const fill = STRATEGY_COLORS[row.strategy] ?? DEFAULT_COLOR;
                      const delta = row.actualLiquidityRate - row.plannedLiquidityRate;
                      return (
                        <div key={`${row.strategy}-liquidity`} className="rounded-md border border-slate-100 p-2">
                          <div className="mb-2 text-center text-xs font-medium text-slate-700">{row.strategy}</div>
                          <div className="flex h-36 items-end justify-center gap-2 rounded bg-slate-50 px-2 pb-2">
                            <div className="w-5 rounded-t bg-slate-400" style={{ height: `${barHeight(row.plannedLiquidityRate, maxLiquidityRate)}%` }} title={`Planned ${formatPercent(row.plannedLiquidityRate)}`} />
                            <div className="w-5 rounded-t" style={{ height: `${barHeight(row.actualLiquidityRate, maxLiquidityRate)}%`, backgroundColor: fill }} title={`Actual ${formatPercent(row.actualLiquidityRate)}`} />
                          </div>
                          <div className="mt-2 space-y-0.5 text-center text-xs text-slate-600">
                            <div>{formatPercent(row.actualLiquidityRate)} / {formatPercent(row.plannedLiquidityRate)}</div>
                            <div className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>Delta {formatPercent(delta)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {rows.map((row) => (
              <div key={`${row.strategy}-alloc`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {row.strategy}: {formatCurrency(row.capital)} ({formatPercent(percentOfTotal(row.capital, totalCapital))})
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
