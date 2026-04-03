import { useEffect, useMemo, useState } from 'react';
import type { PlanningCashflowStore, PlanningScenario, ProjectionResponse, TaxBasis } from '@fremont/shared';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import { WaterfallChart } from './WaterfallChart';
import { formatCurrency } from '../utils/format';
import { safeLocalGet } from '../utils/storage';
import { api } from '../lib/api';

type CFStore = Partial<PlanningCashflowStore>;
type PlanScenarioLite = {
  id: string;
  name: string;
  startYear: number;
  horizonYears: number;
  baseLiquidity: number;
  taxRate?: number;
  taxBasis?: TaxBasis;
};

type Props = {
  startLiquidity: number;
  defaultYear?: number;
};

export function CashflowsView({ startLiquidity, defaultYear }: Props) {
  const [store, setStore] = useState<CFStore>(() => safeLocalGet<CFStore>(LOCAL_STORAGE_KEYS.planningCashflows, {}));
  const [scenarios, setScenarios] = useState<PlanScenarioLite[]>(() => safeLocalGet<PlanScenarioLite[]>(LOCAL_STORAGE_KEYS.planningScenarios, []));
  const current = new Date().getFullYear();
  const [startYear, setStartYear] = useState<number>(defaultYear ?? current - 1);
  const [endYear, setEndYear] = useState<number>(defaultYear ?? current - 1);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);

  useEffect(() => {
    if (defaultYear == null) return;
    setStartYear(defaultYear);
    setEndYear(defaultYear);
  }, [defaultYear]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [cashflowsRes, scenariosRes] = await Promise.allSettled([
        api.cashflows(),
        api.scenarios(),
      ]);
      if (!active) return;
      if (cashflowsRes.status === 'fulfilled') {
        setStore(cashflowsRes.value);
      }
      if (scenariosRes.status === 'fulfilled') {
        const mapped = scenariosRes.value.map((scenario: PlanningScenario) => {
          const taxRateRaw = Number((scenario.inputs as Record<string, unknown> | undefined)?.taxRate ?? 0);
          const taxRate = Number.isFinite(taxRateRaw) ? Math.max(0, Math.min(1, taxRateRaw)) : 0;
          const taxBasis: TaxBasis =
            (scenario.inputs as Record<string, unknown> | undefined)?.taxBasis === 'net_income'
              ? 'net_income'
              : 'gross_income';
          return {
            id: scenario.id,
            name: scenario.name,
            startYear: scenario.startYear,
            horizonYears: scenario.horizonYears,
            baseLiquidity: scenario.baseLiquidity,
            taxRate,
            taxBasis,
          };
        });
        setScenarios(mapped);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const income = store.income || [];
  const outflow = store.outflow || [];

  const overlapYears = (a: number, b: number) => {
    const s = Math.max(a, startYear);
    const e = Math.min(b, endYear);
    return e >= s ? e - s + 1 : 0;
  };

  const incomeActive = useMemo(() =>
    (income || [])
      .map((i) => ({ ...i, years: overlapYears(i.start, i.end) }))
      .filter((i) => (i as any).years > 0)
  , [income, startYear, endYear]);

  const outflowActive = useMemo(() =>
    (outflow || [])
      .map((i) => ({ ...i, years: overlapYears(i.start, i.end) }))
      .filter((i) => (i as any).years > 0)
  , [outflow, startYear, endYear]);

  const taxScenario = useMemo(
    () => scenarios.find((scenario) => scenario.name === 'Base Case') ?? scenarios[0],
    [scenarios],
  );

  useEffect(() => {
    if (!taxScenario?.id) {
      setProjection(null);
      return;
    }
    let active = true;
    void api.projectionScenario(taxScenario.id)
      .then((resp) => {
        if (active) setProjection(resp);
      })
      .catch(() => {
        if (active) setProjection(null);
      });
    return () => {
      active = false;
    };
  }, [taxScenario?.id]);

  const localTotalIncome = incomeActive.reduce((s: number, i: any) => s + (Number(i.amount) || 0) * i.years, 0);
  const localTotalOut = outflowActive.reduce((s: number, i: any) => s + (Number(i.amount) || 0) * i.years, 0);
  const taxRate = Math.max(0, Math.min(1, taxScenario?.taxRate ?? 0));
  const taxBasis: TaxBasis = taxScenario?.taxBasis === 'net_income' ? 'net_income' : 'gross_income';
  const localTaxableIncome = taxBasis === 'net_income' ? Math.max(0, localTotalIncome - localTotalOut) : Math.max(0, localTotalIncome);
  const localTotalTaxes = localTaxableIncome * taxRate;
  const localEndLiquidity = startLiquidity + localTotalIncome - localTotalOut - localTotalTaxes;

  const rangePoints = useMemo(() => {
    if (!projection?.points?.length) return [];
    return projection.points
      .filter((point) => point.year >= startYear && point.year <= endYear)
      .sort((a, b) => a.year - b.year);
  }, [projection, startYear, endYear]);

  const projectionStartLiquidity = useMemo(() => {
    if (!projection) return startLiquidity;
    const ordered = [...projection.points].sort((a, b) => a.year - b.year);
    if (ordered.length === 0) return projection.baseLiquidity;
    if (startYear <= projection.startYear) return projection.baseLiquidity;
    const exactPrior = ordered.find((point) => point.year === startYear - 1);
    if (exactPrior) return exactPrior.liquidity;
    const prior = ordered.filter((point) => point.year < startYear).pop();
    return prior ? prior.liquidity : projection.baseLiquidity;
  }, [projection, startYear, startLiquidity]);

  const projectionEndLiquidity = rangePoints.length > 0
    ? rangePoints[rangePoints.length - 1].liquidity
    : projectionStartLiquidity;
  const projectionTotalIncome = rangePoints.reduce((sum, point) => sum + point.income, 0);
  const projectionTotalOut = rangePoints.reduce((sum, point) => sum + point.outflow, 0);
  const projectionTotalTaxes = rangePoints.reduce((sum, point) => sum + point.taxes, 0);
  const projectionTaxableIncome = taxBasis === 'net_income'
    ? Math.max(0, projectionTotalIncome - projectionTotalOut)
    : Math.max(0, projectionTotalIncome);
  const projectionBaseDelta = projectionTotalIncome - projectionTotalOut - projectionTotalTaxes;
  const projectionEventImpact = projectionEndLiquidity - projectionStartLiquidity - projectionBaseDelta;

  const usingProjection = !!projection && rangePoints.length > 0;
  const displayStartLiquidity = usingProjection ? projectionStartLiquidity : startLiquidity;
  const totalIncome = usingProjection ? projectionTotalIncome : localTotalIncome;
  const totalOut = usingProjection ? projectionTotalOut : localTotalOut;
  const taxableIncome = usingProjection ? projectionTaxableIncome : localTaxableIncome;
  const totalTaxes = usingProjection ? projectionTotalTaxes : localTotalTaxes;
  const endLiquidity = usingProjection ? projectionEndLiquidity : localEndLiquidity;

  const waterfallItemsWithTax = useMemo(() => {
    if (usingProjection) {
      const items: { label: string; amount: number }[] = [
        { label: 'Income', amount: projectionTotalIncome },
        { label: 'Outflows', amount: -projectionTotalOut },
      ];
      if (projectionTotalTaxes > 0) {
        items.push({
          label: `Taxes (${(taxRate * 100).toFixed(1)}% ${taxBasis === 'gross_income' ? 'Gross' : 'Net'})`,
          amount: -projectionTotalTaxes,
        });
      }
      if (Math.abs(projectionEventImpact) > 0.5) {
        items.push({
          label: 'Scenario Events',
          amount: projectionEventImpact,
        });
      }
      return items;
    }
    const pos = incomeActive.map((i: any) => ({ label: i.name, amount: Math.abs(Number(i.amount) || 0) * i.years }));
    const neg = outflowActive.map((i: any) => ({ label: i.name, amount: -Math.abs(Number(i.amount) || 0) * i.years }));
    const items = [...pos, ...neg];
    if (totalTaxes > 0) {
      items.push({
        label: `Taxes (${(taxRate * 100).toFixed(1)}% ${taxBasis === 'gross_income' ? 'Gross' : 'Net'})`,
        amount: -totalTaxes,
      });
    }
    return items;
  }, [
    usingProjection,
    projectionTotalIncome,
    projectionTotalOut,
    projectionTotalTaxes,
    projectionEventImpact,
    taxRate,
    taxBasis,
    incomeActive,
    outflowActive,
    totalTaxes,
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Waterfall — {startYear === endYear ? startYear : `${startYear}–${endYear}`}</h2>
          <div className="flex w-full flex-wrap items-center gap-2 text-sm md:ml-auto md:w-auto">
            <label className="text-slate-600">Start</label>
            <input type="number" className="w-24 rounded border border-slate-200 px-2 py-1" value={startYear} onChange={(e)=> setStartYear(Number(e.target.value)||startYear)} />
            <label className="text-slate-600">End</label>
            <input type="number" className="w-24 rounded border border-slate-200 px-2 py-1" value={endYear} onChange={(e)=> setEndYear(Number(e.target.value)||endYear)} />
          </div>
        </div>
        <div className="mb-3 text-xs text-slate-600">
          Tax Impact: {(taxRate * 100).toFixed(1)}% on {taxBasis === 'gross_income' ? 'Gross Income' : 'Net Income'}
          {taxScenario ? ` (${taxScenario.name})` : ''}
        </div>
        <WaterfallChart items={waterfallItemsWithTax} startLabel={`Liquidity ${startYear}`} startValue={displayStartLiquidity} endLabel={`Liquidity ${endYear + 1}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-base font-semibold text-slate-800">Income ({formatCurrency(totalIncome)})</h3>
          <ul className="text-sm text-slate-700">
            {incomeActive.map((i) => (
              <li key={i.id} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span>{i.name}</span>
                <span>{formatCurrency(i.amount || 0)}</span>
              </li>
            ))}
            {incomeActive.length === 0 && <li className="py-2 text-slate-500">No income items for the selected range.</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-base font-semibold text-slate-800">Outflows ({formatCurrency(totalOut)})</h3>
          <ul className="text-sm text-slate-700">
            {outflowActive.map((i) => (
              <li key={i.id} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span>{i.name}</span>
                <span>{formatCurrency(i.amount || 0)}</span>
              </li>
            ))}
            {outflowActive.length === 0 && <li className="py-2 text-slate-500">No outflows for the selected range.</li>}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="flex items-center justify-between">
          <div>Starting Liquidity</div>
          <div>{formatCurrency(displayStartLiquidity)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div>Total Income</div>
          <div>{formatCurrency(totalIncome)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div>Total Outflows</div>
          <div>{formatCurrency(totalOut)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div>Taxable Income ({taxBasis === 'gross_income' ? 'Gross' : 'Net'})</div>
          <div>{formatCurrency(taxableIncome)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div>Total Taxes</div>
          <div className="text-rose-700">-{formatCurrency(totalTaxes)}</div>
        </div>
        {usingProjection && Math.abs(projectionEventImpact) > 0.5 && (
          <div className="flex items-center justify-between">
            <div>Scenario Event Impact</div>
            <div className={projectionEventImpact >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
              {projectionEventImpact >= 0 ? '+' : '-'}
              {formatCurrency(Math.abs(projectionEventImpact))}
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between font-medium text-slate-900">
          <div>Ending Liquidity</div>
          <div>{formatCurrency(endLiquidity)}</div>
        </div>
      </div>
    </div>
  );
}
