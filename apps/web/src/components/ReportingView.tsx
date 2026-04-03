import { useEffect, useMemo, useState } from 'react';
import {
  LOCAL_STORAGE_KEYS,
  STRATEGY_KINDS,
  type FinancialWorkspaceResponse,
  type ReportingYearFacts,
  type ScenarioCompareDetailResponse,
  type StrategyBenchmark,
} from '@fremont/shared';
import { api } from '../lib/api';
import type { Position } from '../types/models';

type Props = {
  baseNetWorth: number;
  selectedYear: number;
  workspace: FinancialWorkspaceResponse | null;
  positions: Position[];
};

const formatCurrency = (value: number | null) => {
  if (value == null) return '—';
  const absolute = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(absolute);
  return value < 0 ? `(${formatted})` : formatted;
};

const formatPercent = (value: number | null) => {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
};

const STRATEGY_ASSET_CLASS = 'Fremont Strategy';

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

export function ReportingView({ baseNetWorth, selectedYear, workspace, positions }: Props) {
  const [facts, setFacts] = useState<ReportingYearFacts | null>(workspace?.facts ?? null);
  const [factsState, setFactsState] = useState<'idle' | 'error'>('idle');
  const [compare, setCompare] = useState<ScenarioCompareDetailResponse | null>(null);
  const [compareState, setCompareState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [comparisonScenarioId, setComparisonScenarioId] = useState<string | null>(null);

  useEffect(() => {
    if (workspace?.year === selectedYear && workspace.facts) {
      setFacts(workspace.facts);
    }
  }, [workspace, selectedYear]);

  useEffect(() => {
    let active = true;
    void api
      .reportingFacts(selectedYear)
      .then((resp) => {
        if (!active) return;
        setFacts(resp);
        setFactsState('idle');
      })
      .catch(() => {
        if (!active) return;
        setFactsState('error');
      });
    return () => {
      active = false;
    };
  }, [selectedYear]);

  const fallbackFacts = useMemo<ReportingYearFacts>(() => {
    const currentPositions = (positions || []).filter((position) => {
      const year = toYear(position.year);
      return year === null || year <= selectedYear;
    });

    const actualNetWorth = currentPositions.reduce((sum, position) => sum + (Number(position.value) || 0), 0);
    const actualLiquidity = currentPositions.reduce(
      (sum, position) => sum + (position.liquid ? Number(position.value) || 0 : 0),
      0,
    );

    let benchmarkRaw: StrategyBenchmark[] = [];
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEYS.strategyBenchmarks);
        benchmarkRaw = normalizeBenchmarks(raw ? JSON.parse(raw) : []);
      } catch {
        benchmarkRaw = [];
      }
    }

    const strategyRows = STRATEGY_KINDS.map((strategy) => {
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

    const totalReturnVariance = strategyRows.reduce((sum, row) => sum + row.returnVariance, 0);
    const totalLiquidityVariance = strategyRows.reduce((sum, row) => sum + row.liquidityVariance, 0);

    return {
      year: selectedYear,
      strategyRows,
      totalReturnVariance,
      totalLiquidityVariance,
      returnImpactPct: actualNetWorth > 0 ? totalReturnVariance / actualNetWorth : 0,
      baselineScenarioId: null,
      baselineScenarioName: null,
      plannedNetWorth: null,
      plannedLiquidity: null,
      actualNetWorth,
      actualLiquidity,
      netWorthVariance: null,
      liquidityVariance: null,
      transactionNetFlow: 0,
      warnings: [],
    };
  }, [positions, selectedYear]);

  const effectiveFacts = facts ?? fallbackFacts;
  const usingFallbackFacts = !facts;
  const hasLocalStrategyData = (effectiveFacts?.strategyRows ?? []).some((row) => row.capital > 0);
  const showFallbackWarning = usingFallbackFacts && !hasLocalStrategyData && factsState === 'error';

  const scenarios = workspace?.scenarios ?? [];
  const baselineScenarioId = effectiveFacts?.baselineScenarioId ?? null;

  useEffect(() => {
    if (!baselineScenarioId || scenarios.length === 0) {
      setComparisonScenarioId(null);
      return;
    }

    const hasCurrent = comparisonScenarioId && scenarios.some((scenario) => scenario.id === comparisonScenarioId);
    if (hasCurrent) return;

    const fallback = scenarios.find((scenario) => scenario.id !== baselineScenarioId);
    setComparisonScenarioId(fallback?.id ?? null);
  }, [baselineScenarioId, comparisonScenarioId, scenarios]);

  useEffect(() => {
    if (!baselineScenarioId || !comparisonScenarioId || baselineScenarioId === comparisonScenarioId) {
      setCompare(null);
      return;
    }

    let active = true;
    setCompareState('loading');
    void api
      .compareScenarios(baselineScenarioId, comparisonScenarioId)
      .then((resp) => {
        if (!active) return;
        setCompare(resp);
        setCompareState('idle');
      })
      .catch(() => {
        if (!active) return;
        setCompare(null);
        setCompareState('error');
      });

    return () => {
      active = false;
    };
  }, [baselineScenarioId, comparisonScenarioId]);

  const comparisonScenarioLabel = useMemo(() => {
    return scenarios.find((scenario) => scenario.id === comparisonScenarioId)?.name ?? 'Scenario';
  }, [comparisonScenarioId, scenarios]);

  const returnImpactPct =
    effectiveFacts?.returnImpactPct ??
    (baseNetWorth > 0 && effectiveFacts ? effectiveFacts.totalReturnVariance / baseNetWorth : 0);
  const strategyTotals = useMemo(() => {
    const rows = effectiveFacts?.strategyRows ?? [];
    const capital = rows.reduce((sum, row) => sum + row.capital, 0);
    const targetReturnValue = rows.reduce((sum, row) => sum + row.targetReturnValue, 0);
    const actualReturnValue = rows.reduce((sum, row) => sum + row.actualReturnValue, 0);
    const plannedLiquidityValue = rows.reduce((sum, row) => sum + row.plannedLiquidityValue, 0);
    const actualLiquidityValue = rows.reduce((sum, row) => sum + row.actualLiquidityValue, 0);
    const returnVariance = rows.reduce((sum, row) => sum + row.returnVariance, 0);
    const liquidityVariance = rows.reduce((sum, row) => sum + row.liquidityVariance, 0);

    return {
      capital,
      targetReturnRate: capital > 0 ? targetReturnValue / capital : 0,
      actualReturnRate: capital > 0 ? actualReturnValue / capital : 0,
      targetReturnValue,
      actualReturnValue,
      plannedLiquidityRate: capital > 0 ? plannedLiquidityValue / capital : 0,
      actualLiquidityRate: capital > 0 ? actualLiquidityValue / capital : 0,
      plannedLiquidityValue,
      actualLiquidityValue,
      returnVariance,
      liquidityVariance,
    };
  }, [effectiveFacts?.strategyRows]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Integrated Reporting ({selectedYear})</h3>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Reporting now uses one canonical model: Positions + Cashflows + Scenarios + Strategy Benchmarks.
        </div>
        {showFallbackWarning && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Using local reporting fallback. API facts were unavailable.
          </div>
        )}
        {(effectiveFacts?.warnings?.length ?? 0) > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-800">Data Quality Warnings</div>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
              {effectiveFacts?.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Plan vs Actual Net Worth</div>
          <div className={`mt-1 text-2xl font-semibold ${(effectiveFacts?.netWorthVariance ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatCurrency(effectiveFacts?.netWorthVariance ?? null)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Plan {formatCurrency(effectiveFacts?.plannedNetWorth ?? null)} vs Actual {formatCurrency(effectiveFacts?.actualNetWorth ?? null)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Plan vs Actual Liquidity</div>
          <div className={`mt-1 text-2xl font-semibold ${(effectiveFacts?.liquidityVariance ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatCurrency(effectiveFacts?.liquidityVariance ?? null)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Plan {formatCurrency(effectiveFacts?.plannedLiquidity ?? null)} vs Actual {formatCurrency(effectiveFacts?.actualLiquidity ?? null)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Return Impact</div>
          <div className={`mt-1 text-2xl font-semibold ${returnImpactPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatPercent(returnImpactPct)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Strategy return variance {formatCurrency(effectiveFacts?.totalReturnVariance ?? null)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Strategy Plan vs Outcome ({selectedYear})</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Strategy</th>
                <th className="px-3 py-2 text-right font-medium">Capital</th>
                <th className="px-3 py-2 text-right font-medium">Capital Year</th>
                <th className="px-3 py-2 text-right font-medium">Target Return %</th>
                <th className="px-3 py-2 text-right font-medium">Actual Return %</th>
                <th className="px-3 py-2 text-right font-medium">Target Return Value</th>
                <th className="px-3 py-2 text-right font-medium">Actual Return Value</th>
                <th className="px-3 py-2 text-right font-medium">Planned Liquidity %</th>
                <th className="px-3 py-2 text-right font-medium">Actual Liquidity %</th>
                <th className="px-3 py-2 text-right font-medium">Planned Liquidity Value</th>
                <th className="px-3 py-2 text-right font-medium">Actual Liquidity Value</th>
                <th className="px-3 py-2 text-right font-medium">Return Variance</th>
                <th className="px-3 py-2 text-right font-medium">Liquidity Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(effectiveFacts?.strategyRows ?? []).map((row) => (
                <tr key={row.strategy}>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.strategy}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.capital)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{row.capitalYear ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatPercent(row.targetReturnRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatPercent(row.actualReturnRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.targetReturnValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.actualReturnValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatPercent(row.plannedLiquidityRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatPercent(row.actualLiquidityRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.plannedLiquidityValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.actualLiquidityValue)}</td>
                  <td className={`px-3 py-2 text-right ${row.returnVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(row.returnVariance)}
                  </td>
                  <td className={`px-3 py-2 text-right ${row.liquidityVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(row.liquidityVariance)}
                  </td>
                </tr>
              ))}
              {(effectiveFacts?.strategyRows?.length ?? 0) > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-2 text-slate-800">Total</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(strategyTotals.capital)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">—</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatPercent(strategyTotals.targetReturnRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatPercent(strategyTotals.actualReturnRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(strategyTotals.targetReturnValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(strategyTotals.actualReturnValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatPercent(strategyTotals.plannedLiquidityRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatPercent(strategyTotals.actualLiquidityRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(strategyTotals.plannedLiquidityValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(strategyTotals.actualLiquidityValue)}</td>
                  <td className={`px-3 py-2 text-right ${strategyTotals.returnVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(strategyTotals.returnVariance)}
                  </td>
                  <td className={`px-3 py-2 text-right ${strategyTotals.liquidityVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(strategyTotals.liquidityVariance)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(effectiveFacts?.strategyRows?.length ?? 0) === 0 && (
          <div className="mt-3 text-xs text-slate-500">No strategy rows available yet. Add Fremont Strategy positions first.</div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Baseline vs Scenario Compare</h4>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-slate-500">Compare Against</label>
            <select
              value={comparisonScenarioId ?? ''}
              onChange={(event) => setComparisonScenarioId(event.target.value || null)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              <option value="">Select scenario</option>
              {scenarios
                .filter((scenario) => scenario.id !== baselineScenarioId)
                .map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {compareState === 'loading' && <div className="text-xs text-slate-500">Loading scenario comparison…</div>}
        {compareState === 'error' && <div className="text-xs text-rose-700">Scenario comparison failed.</div>}
        {compare && (
          <div className="space-y-2 text-sm text-slate-700">
            <div>
              Comparing <strong>{effectiveFacts?.baselineScenarioName ?? 'Base Case'}</strong> to <strong>{comparisonScenarioLabel}</strong>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <div>
                Horizon Net Worth Delta:{' '}
                <span className={compare.deltaNetWorthAtHorizon >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {formatCurrency(compare.deltaNetWorthAtHorizon)}
                </span>
              </div>
              <div>
                Horizon Liquidity Delta:{' '}
                <span className={compare.deltaLiquidityAtHorizon >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {formatCurrency(compare.deltaLiquidityAtHorizon)}
                </span>
              </div>
              <div>
                Negative Liquidity Years: {compare.negativeLiquidityYears.length === 0 ? 'None' : compare.negativeLiquidityYears.join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
