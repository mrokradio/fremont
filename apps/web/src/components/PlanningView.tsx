import { useMemo, useState, useCallback, useEffect, type SetStateAction } from 'react';
import type {
  FinancialProfile,
  FinancialWorkspaceResponse,
  PlanningCashflowStore,
  PlanningScenario,
  PlanningScenarioWriteInput,
  Position,
  StrategyBenchmark,
} from '@fremont/shared';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { PlanEvent, PlanningAsset, PlanningAssetKind } from '../types/models';
import { appendActivity } from '../utils/activityLog';
import { api } from '../lib/api';

type Props = {
  startYear?: number;
  selectedYear?: number;
  horizonYears?: number;
  baseNetWorth: number; // starting total net worth
  baseLiquidity: number; // starting liquidity (subset of net worth)
  workspace?: FinancialWorkspaceResponse | null;
  positions?: Position[];
};

const ASSETS: Record<PlanningAssetKind, PlanningAsset> = {
  'Real Estate': { kind: 'Real Estate', behavior: 'capital' },
  Car: { kind: 'Car', behavior: 'capital' },
  Boat: { kind: 'Boat', behavior: 'capital' },
  Airplane: { kind: 'Airplane', behavior: 'capital' },
  Travel: { kind: 'Travel', behavior: 'expense' },
  School: { kind: 'School', behavior: 'expense' },
  OpCos: { kind: 'OpCos', behavior: 'capital' },
};

const ASSET_ICONS: Record<PlanningAssetKind, string> = {
  'Real Estate': 'real_estate_agent',
  Car: 'directions_car',
  Boat: 'sailing',
  Airplane: 'flight',
  Travel: 'travel_explore',
  School: 'school',
  OpCos: 'domain',
};

const ASSET_COLORS: Record<PlanningAssetKind, string> = {
  'Real Estate': '#fde68a',
  Car: '#bfdbfe',
  Boat: '#c4b5fd',
  Airplane: '#fca5a5',
  Travel: '#bbf7d0',
  School: '#fecdd3',
  OpCos: '#e0f2fe',
};

const ZOOM_STEPS = [1, 3, 5, 10] as const;
type ZoomStep = (typeof ZOOM_STEPS)[number];
const TIMELINE_COL_REM = 8;
const TIMELINE_COL_GAP_REM = 0.5; // matches Tailwind gap-2
type TaxBasis = 'gross_income' | 'net_income';

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtNullableCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return fmtCurrency(n);
}

function fmtCompactCurrency(n: number) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    // Fallback if compact currency not supported
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return fmtCurrency(n);
  }
}

export function PlanningView({
  startYear = new Date().getFullYear(),
  selectedYear = new Date().getFullYear(),
  horizonYears = 20,
  baseNetWorth,
  baseLiquidity,
  workspace = null,
  positions = [],
}: Props) {
  const [zoomStep, setZoomStep] = useState<ZoomStep>(1);
  const [strategyBenchmarks, setStrategyBenchmarks] = useState<StrategyBenchmark[]>([]);
  const [dragMode, setDragMode] = useState<'asset' | 'event' | null>(null);
  type CashItem = { id: string; name: string; amount: number; start: number; end: number };
  type ModalState = {
    open: boolean;
    year: number | null;
    kind: PlanningAssetKind | null;
    value: string;
    label: string;
    editId?: string | null;
    duration: string;
    color: string;
    cost: string;
    recurring: string;
    recurringInc: string;
    lifeYears: string;
    residualPct: string;
    opAction: 'buy' | 'sell';
    opAmount: string;
  };
  const CF_KEY = LOCAL_STORAGE_KEYS.planningCashflows;
  const [incomeItems, setIncomeItems] = useState<CashItem[]>(() => {
    try {
      const raw = localStorage.getItem(CF_KEY);
      if (raw) return ((JSON.parse(raw) as Partial<PlanningCashflowStore>).income || []) as CashItem[];
    } catch {}
    return [];
  });
  const [outflowItems, setOutflowItems] = useState<CashItem[]>(() => {
    try {
      const raw = localStorage.getItem(CF_KEY);
      if (raw) return ((JSON.parse(raw) as Partial<PlanningCashflowStore>).outflow || []) as CashItem[];
    } catch {}
    return [];
  });
  useEffect(() => { localStorage.setItem(CF_KEY, JSON.stringify({ income: incomeItems, outflow: outflowItems })); }, [incomeItems, outflowItems]);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    year: null,
    kind: null,
    value: '',
    label: '',
    editId: null,
    duration: '1',
    color: '#bfdbfe',
    cost: '',
    recurring: '',
    recurringInc: '',
    lifeYears: '',
    residualPct: '',
    opAction: 'buy',
    opAmount: '',
  });
  const [affordabilityError, setAffordabilityError] = useState<string | null>(null);
  // Asset defaults (persisted)
  type AssetDefaults = {
    cost?: string;
    recurring?: string;
    duration?: string;
    color?: string;
    recurringInc?: string;
    lifeYears?: string;
    residualPct?: string;
    opAction?: 'buy' | 'sell';
    opAmount?: string;
  };
  const DEFAULTS_KEY = LOCAL_STORAGE_KEYS.planningDefaults;
  const defaultByKind: Record<PlanningAssetKind, AssetDefaults> = {
    'Real Estate': { cost: '$1,500,000', recurring: '$25,000', duration: '10', color: ASSET_COLORS['Real Estate'] },
    Car: { cost: '$50,000', duration: '5', color: ASSET_COLORS.Car },
    Boat: { cost: '$250,000', duration: '10', color: ASSET_COLORS.Boat },
    Airplane: { cost: '$2,000,000', recurring: '$500,000', duration: '10', lifeYears: '10', residualPct: '20', color: ASSET_COLORS.Airplane },
    Travel: { cost: '$5,000', duration: '1', color: ASSET_COLORS.Travel },
    School: { cost: '$50,000', recurring: '$50,000', recurringInc: '5.0', duration: '3', color: ASSET_COLORS.School },
    OpCos: { opAction: 'buy', opAmount: '$100,000', color: ASSET_COLORS.OpCos },
  };
  const [assetDefaults, setAssetDefaults] = useState<Record<PlanningAssetKind, AssetDefaults>>(() => {
    try {
      const raw = localStorage.getItem(DEFAULTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<PlanningAssetKind, AssetDefaults>>;
        const merged = {} as Record<PlanningAssetKind, AssetDefaults>;
        (Object.keys(defaultByKind) as PlanningAssetKind[]).forEach((kind) => {
          merged[kind] = { ...defaultByKind[kind], ...(parsed[kind] || {}) };
        });
        return merged;
      }
    } catch {}
    return defaultByKind;
  });
  useEffect(() => {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(assetDefaults));
  }, [assetDefaults]);
  useEffect(() => {
    const clearDrag = () => setDragMode(null);
    window.addEventListener('dragend', clearDrag);
    window.addEventListener('drop', clearDrag);
    return () => {
      window.removeEventListener('dragend', clearDrag);
      window.removeEventListener('drop', clearDrag);
    };
  }, []);

  // Scenario management
  type PlanScenario = {
    id: string;
    name: string;
    startYear: number;
    horizonYears: number;
    baseNetWorth: number;
    baseLiquidity: number;
    taxRate?: number; // 0..1
    taxBasis?: TaxBasis;
    returnRate?: number; // 0..1 annual portfolio return (used when strategy benchmarks are unavailable)
    events: PlanEvent[];
  };

  const STORAGE_KEY = LOCAL_STORAGE_KEYS.planningScenarios;
  const genId = () => Math.random().toString(36).slice(2, 10);

  const loadScenarios = (): PlanScenario[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as PlanScenario[];
      if (!Array.isArray(arr)) return [];
      return arr.map((scenario) => ({
        ...scenario,
        taxRate: Math.max(0, Math.min(1, typeof scenario.taxRate === 'number' ? scenario.taxRate : 0)),
        taxBasis: scenario.taxBasis === 'net_income' ? 'net_income' : 'gross_income',
        returnRate: typeof scenario.returnRate === 'number' ? Math.max(0, Math.min(1, scenario.returnRate)) : 0,
      }));
    } catch {
      return [];
    }
  };

  const persistScenarios = (arr: PlanScenario[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  };

  const parseScenarioInputs = (inputs: Record<string, unknown> | undefined) => {
    const taxRateRaw = Number(inputs?.taxRate ?? 0);
    const taxRate = Number.isFinite(taxRateRaw) ? Math.max(0, Math.min(1, taxRateRaw)) : 0;
    const taxBasis: TaxBasis = inputs?.taxBasis === 'net_income' ? 'net_income' : 'gross_income';
    const returnRateRaw = Number(inputs?.returnRate ?? 0);
    const returnRate = Number.isFinite(returnRateRaw) ? Math.max(0, Math.min(1, returnRateRaw)) : 0;
    return { taxRate, taxBasis, returnRate };
  };

  const toScenarioWriteInput = (scenario: PlanScenario): PlanningScenarioWriteInput => ({
    name: scenario.name,
    startYear: scenario.startYear,
    horizonYears: scenario.horizonYears,
    baseNetWorth: scenario.baseNetWorth,
    baseLiquidity: scenario.baseLiquidity,
    inputs: {
      taxRate: Math.max(0, Math.min(1, scenario.taxRate ?? 0)),
      taxBasis: scenario.taxBasis === 'net_income' ? 'net_income' : 'gross_income',
      returnRate: Math.max(0, Math.min(1, scenario.returnRate ?? 0)),
    },
    events: (scenario.events || []) as unknown as Record<string, unknown>[],
  });

  const fromApiScenario = (scenario: PlanningScenario): PlanScenario => {
    const parsed = parseScenarioInputs((scenario.inputs || {}) as Record<string, unknown>);
    return {
      id: scenario.id,
      name: scenario.name,
      startYear: scenario.startYear,
      horizonYears: scenario.horizonYears,
      baseNetWorth: scenario.baseNetWorth,
      baseLiquidity: scenario.baseLiquidity,
      taxRate: parsed.taxRate,
      taxBasis: parsed.taxBasis,
      returnRate: parsed.returnRate,
      events: Array.isArray(scenario.events) ? (scenario.events as unknown as PlanEvent[]) : [],
    };
  };

  const [scenarios, setScenarios] = useState<PlanScenario[]>(() => {
    const existing = loadScenarios();
    if (existing.length) return existing;
    const base: PlanScenario = {
      id: genId(),
      name: 'Base Case',
      startYear,
      horizonYears,
      baseNetWorth,
      baseLiquidity,
      taxRate: 0,
      taxBasis: 'gross_income',
      returnRate: 0,
      events: [],
    };
    persistScenarios([base]);
    return [base];
  });

  const [currentId, setCurrentId] = useState<string>(() => scenarios[0]?.id);
  const [remoteSyncEnabled, setRemoteSyncEnabled] = useState(false);
  const currentScenario = useMemo(() => scenarios.find((scenario) => scenario.id === currentId), [scenarios, currentId]);
  const scenarioStartYear = currentScenario?.startYear ?? startYear;
  const scenarioHorizonYears = currentScenario?.horizonYears ?? horizonYears;
  const scenarioBaseNetWorth = currentScenario?.baseNetWorth ?? baseNetWorth;
  const scenarioBaseLiquidity = currentScenario?.baseLiquidity ?? baseLiquidity;
  const scenarioTaxRate = Math.max(0, Math.min(1, currentScenario?.taxRate ?? 0));
  const scenarioTaxBasis: TaxBasis = currentScenario?.taxBasis === 'net_income' ? 'net_income' : 'gross_income';
  const scenarioReturnRate = Math.max(0, Math.min(1, currentScenario?.returnRate ?? 0));
  const events = currentScenario?.events ?? [];
  const canonicalFacts = workspace?.year === selectedYear ? workspace.facts : null;
  const [taxRateText, setTaxRateText] = useState<string>('0.0');
  const [returnRateText, setReturnRateText] = useState<string>('0.0');

  const replaceScenarioId = useCallback((previousId: string, nextScenario: PlanScenario) => {
    setScenarios((prev) => {
      const next = prev.map((scenario) => (scenario.id === previousId ? nextScenario : scenario));
      persistScenarios(next);
      return next;
    });
    setCurrentId((prev) => (prev === previousId ? nextScenario.id : prev));
  }, []);

  const upsertScenarioRemote = useCallback(async (scenario: PlanScenario) => {
    if (!remoteSyncEnabled) return;
    const payload = toScenarioWriteInput(scenario);
    try {
      await api.updateScenario(scenario.id, payload);
      return;
    } catch {}
    try {
      const created = await api.createScenario(payload);
      replaceScenarioId(scenario.id, fromApiScenario(created));
    } catch {}
  }, [remoteSyncEnabled, replaceScenarioId]);

  useEffect(() => {
    api.strategyBenchmarks().then(setStrategyBenchmarks).catch(() => {});
  }, []);

  useEffect(() => {
    setTaxRateText((scenarioTaxRate * 100).toFixed(1));
  }, [scenarioTaxRate, currentId]);

  useEffect(() => {
    setReturnRateText((scenarioReturnRate * 100).toFixed(1));
  }, [scenarioReturnRate, currentId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [scenarioRes, cashflowRes, profileRes] = await Promise.allSettled([
        api.scenarios(),
        workspace ? Promise.resolve(workspace.cashflows) : api.cashflows(),
        workspace ? Promise.resolve(workspace.profile) : api.financialProfile(),
      ]);

      if (!active) return;

      const hasAnyRemote =
        scenarioRes.status === 'fulfilled' ||
        cashflowRes.status === 'fulfilled' ||
        profileRes.status === 'fulfilled';

      if (hasAnyRemote) setRemoteSyncEnabled(true);

      if (cashflowRes.status === 'fulfilled') {
        setIncomeItems(cashflowRes.value.income || []);
        setOutflowItems(cashflowRes.value.outflow || []);
      }

      if (scenarioRes.status === 'fulfilled' && scenarioRes.value.length > 0) {
        const mapped = scenarioRes.value.map((remote) => {
          const s = fromApiScenario(remote);
          // Backfill portfolio values into scenarios that were saved before positions/assets were entered.
          // Use baseNetWorth for both fields so the full portfolio value drives the forecast,
          // regardless of which positions are individually marked liquid.
          if (s.baseNetWorth === 0 && s.baseLiquidity === 0 && baseNetWorth > 0) {
            return { ...s, baseNetWorth, baseLiquidity: baseNetWorth };
          }
          return s;
        });
        // Sync any patched scenarios back to the server
        mapped.forEach((s, i) => {
          if (s.baseNetWorth !== scenarioRes.value[i].baseNetWorth || s.baseLiquidity !== scenarioRes.value[i].baseLiquidity) {
            void api.updateScenario(s.id, toScenarioWriteInput(s)).catch(() => {});
          }
        });
        setScenarios(mapped);
        persistScenarios(mapped);
        setCurrentId((prev) => (mapped.some((scenario) => scenario.id === prev) ? prev : mapped[0].id));
      } else if (profileRes.status === 'fulfilled') {
        const profile = profileRes.value as FinancialProfile;
        setScenarios((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const idx = next.findIndex((scenario) => scenario.name === 'Base Case');
          const target = idx === -1 ? 0 : idx;
          next[target] = {
            ...next[target],
            baseNetWorth: baseNetWorth > 0 ? baseNetWorth : profile.baseNetWorth,
            baseLiquidity: baseNetWorth > 0 ? baseNetWorth : profile.baseLiquidity,
            taxRate: Math.max(0, Math.min(1, Number(profile.assumptions?.taxRate ?? 0))),
            taxBasis: profile.assumptions?.taxBasis === 'net_income' ? 'net_income' : 'gross_income',
            returnRate: Math.max(0, Math.min(1, Number(profile.assumptions?.returnRate ?? 0))),
          };
          persistScenarios(next);
          return next;
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [workspace, baseNetWorth, baseLiquidity]);

  useEffect(() => {
    if (!workspace) return;

    setIncomeItems(workspace.cashflows.income || []);
    setOutflowItems(workspace.cashflows.outflow || []);

    const profile = workspace.profile as FinancialProfile;
    const seedNetWorth = Number.isFinite(baseNetWorth) ? baseNetWorth : profile.baseNetWorth;
    const seedLiquidity = Number.isFinite(baseLiquidity) ? baseLiquidity : profile.baseLiquidity;
    setScenarios((prev) => {
      if (prev.length === 0) return prev;

      const next = [...prev];
      const baseIdx = next.findIndex((scenario) => scenario.name === 'Base Case');
      const target = baseIdx === -1 ? 0 : baseIdx;
      const current = next[target];
      if (!current) return prev;

      const normalizedTaxRate = Math.max(0, Math.min(1, Number(profile.assumptions?.taxRate ?? 0)));
      const normalizedTaxBasis = profile.assumptions?.taxBasis === 'net_income' ? 'net_income' : 'gross_income';
      const normalizedReturnRate = Math.max(0, Math.min(1, Number(profile.assumptions?.returnRate ?? 0)));

      const unchanged =
        current.baseNetWorth === seedNetWorth &&
        current.baseLiquidity === seedLiquidity &&
        (current.taxRate ?? 0) === normalizedTaxRate &&
        (current.taxBasis ?? 'gross_income') === normalizedTaxBasis &&
        (current.returnRate ?? 0) === normalizedReturnRate;

      if (unchanged) return prev;

      next[target] = {
        ...current,
        baseNetWorth: seedNetWorth,
        baseLiquidity: seedLiquidity,
        taxRate: normalizedTaxRate,
        taxBasis: normalizedTaxBasis,
        returnRate: normalizedReturnRate,
      };
      persistScenarios(next);
      return next;
    });
  }, [workspace?.year, workspace?.profile.updatedAt, baseNetWorth, baseLiquidity]);

  useEffect(() => {
    if (workspace) return;
    setScenarios((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const baseIdx = next.findIndex((scenario) => scenario.name === 'Base Case');
      const target = baseIdx === -1 ? 0 : baseIdx;
      const current = next[target];
      if (!current) return prev;
      if (current.baseNetWorth === baseNetWorth && current.baseLiquidity === baseLiquidity) return prev;
      next[target] = {
        ...current,
        baseNetWorth,
        baseLiquidity,
      };
      persistScenarios(next);
      return next;
    });
  }, [workspace, baseNetWorth, baseLiquidity]);

  useEffect(() => {
    if (!remoteSyncEnabled) return;
    void api
      .upsertCashflows({
        income: incomeItems,
        outflow: outflowItems,
      })
      .catch(() => {});
  }, [remoteSyncEnabled, incomeItems, outflowItems]);

  useEffect(() => {
    if (!remoteSyncEnabled || !currentScenario) return;
    void api
      .upsertFinancialProfile({
        baseNetWorth: currentScenario.baseNetWorth,
        baseLiquidity: currentScenario.baseLiquidity,
        assumptions: {
          taxRate: Math.max(0, Math.min(1, currentScenario.taxRate ?? 0)),
          taxBasis: currentScenario.taxBasis === 'net_income' ? 'net_income' : 'gross_income',
          returnRate: Math.max(0, Math.min(1, currentScenario.returnRate ?? 0)),
        },
      })
      .catch(() => {});
  }, [remoteSyncEnabled, currentScenario?.id, currentScenario?.baseNetWorth, currentScenario?.baseLiquidity, currentScenario?.taxRate, currentScenario?.taxBasis, currentScenario?.returnRate]);

  const setEvents = useCallback((updater: SetStateAction<PlanEvent[]>) => {
    setScenarios((prev) => {
      const idx = prev.findIndex((p) => p.id === currentId);
      const targetIdx = idx === -1 ? 0 : idx;
      if (targetIdx === -1) return prev;
      const currentEvents = prev[targetIdx].events ?? [];
      const nextEvents =
        typeof updater === 'function' ? (updater as (value: PlanEvent[]) => PlanEvent[])(currentEvents) : updater;
      const next = [...prev];
      next[targetIdx] = {
        ...next[targetIdx],
        events: nextEvents,
      };
      persistScenarios(next);
      void upsertScenarioRemote(next[targetIdx]);
      return next;
    });
  }, [currentId, upsertScenarioRemote]);

  const updateCurrentScenario = useCallback((mutator: (scenario: PlanScenario) => PlanScenario) => {
    setScenarios((prev) => {
      const idx = prev.findIndex((scenario) => scenario.id === currentId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = mutator(next[idx]);
      persistScenarios(next);
      void upsertScenarioRemote(next[idx]);
      return next;
    });
  }, [currentId, upsertScenarioRemote]);

  const logActivity = useCallback((action: string, details?: Record<string, unknown>) => {
    try {
      appendActivity(action, details);
    } catch {
      // Keep planning actions functional even if localStorage logging fails.
    }
  }, []);

  const newScenario = () => {
    const name = window.prompt('New scenario name', 'Scenario ' + (scenarios.length + 1));
    if (!name) return;
    const s: PlanScenario = {
      id: genId(),
      name: name.trim(),
      startYear: scenarioStartYear,
      horizonYears: scenarioHorizonYears,
      baseNetWorth: scenarioBaseNetWorth,
      baseLiquidity: scenarioBaseLiquidity,
      taxRate: scenarioTaxRate,
      taxBasis: scenarioTaxBasis,
      returnRate: scenarioReturnRate,
      events: [],
    };
    const arr = [...scenarios, s];
    setScenarios(arr);
    persistScenarios(arr);
    const previous = currentId;
    setCurrentId(s.id);
    void upsertScenarioRemote(s);
    logActivity('Planning scenario created', { scenarioId: s.id, name: s.name });
    logActivity('Planning scenario selected', { from: previous, to: s.id, reason: 'auto' });
  };

  const saveAsScenario = () => {
    const name = window.prompt('Save as scenario name', 'Copy of ' + (scenarios.find(s => s.id === currentId)?.name || 'Scenario'));
    if (!name) return;
    const s: PlanScenario = {
      id: genId(),
      name: name.trim(),
      startYear: scenarioStartYear,
      horizonYears: scenarioHorizonYears,
      baseNetWorth: scenarioBaseNetWorth,
      baseLiquidity: scenarioBaseLiquidity,
      taxRate: scenarioTaxRate,
      taxBasis: scenarioTaxBasis,
      returnRate: scenarioReturnRate,
      events,
    };
    const arr = [...scenarios, s];
    setScenarios(arr);
    persistScenarios(arr);
    const previous = currentId;
    setCurrentId(s.id);
    void upsertScenarioRemote(s);
    logActivity('Planning scenario saved as', { scenarioId: s.id, name: s.name, sourceScenarioId: previous });
    logActivity('Planning scenario selected', { from: previous, to: s.id, reason: 'save-as' });
  };

  const renameScenario = () => {
    const current = scenarios.find((x) => x.id === currentId);
    if (!current) return;
    const name = window.prompt('Rename scenario', current.name);
    if (!name) return;
    const arr = scenarios.map((s) => (s.id === currentId ? { ...s, name: name.trim() } : s));
    const renamed = arr.find((s) => s.id === currentId);
    setScenarios(arr);
    persistScenarios(arr);
    if (renamed) void upsertScenarioRemote(renamed);
    logActivity('Planning scenario renamed', { scenarioId: currentId, previous: current.name, next: name.trim() });
  };

  const deleteScenario = () => {
    const current = scenarios.find((x) => x.id === currentId);
    if (!current) return;
    if (!window.confirm(`Delete scenario "${current.name}"? This cannot be undone.`)) return;
    const arr = scenarios.filter((s) => s.id !== currentId);
    if (arr.length === 0) {
      // Recreate base if none remain
      const base: PlanScenario = {
        id: genId(),
        name: 'Base Case',
        startYear: scenarioStartYear,
        horizonYears: scenarioHorizonYears,
        baseNetWorth: scenarioBaseNetWorth,
        baseLiquidity: scenarioBaseLiquidity,
        taxRate: 0,
        taxBasis: 'gross_income',
        returnRate: 0,
        events: [],
      };
      persistScenarios([base]);
      setScenarios([base]);
      setCurrentId(base.id);
      if (remoteSyncEnabled) {
        void api.deleteScenario(current.id).catch(() => {});
        void upsertScenarioRemote(base);
      }
      logActivity('Planning scenario deleted', { scenarioId: currentId, name: current.name });
      logActivity('Planning scenario created', { scenarioId: base.id, name: base.name, reason: 'auto' });
      logActivity('Planning scenario selected', { from: currentId, to: base.id, reason: 'auto' });
    } else {
      persistScenarios(arr);
      setScenarios(arr);
      const nextId = arr[0].id;
      setCurrentId(nextId);
      if (remoteSyncEnabled) {
        void api.deleteScenario(current.id).catch(() => {});
      }
      logActivity('Planning scenario deleted', { scenarioId: currentId, name: current.name });
      logActivity('Planning scenario selected', { from: currentId, to: nextId, reason: 'post-delete' });
    }
  };

  const years = useMemo(
    () => Array.from({ length: scenarioHorizonYears }, (_, i) => scenarioStartYear + i),
    [scenarioStartYear, scenarioHorizonYears],
  );

  const timeBuckets = useMemo(() => {
    const buckets: { start: number; end: number; label: string }[] = [];
    for (let i = 0; i < years.length; i += zoomStep) {
      const start = years[i];
      const end = years[Math.min(years.length - 1, i + zoomStep - 1)];
      buckets.push({
        start,
        end,
        label: start === end ? String(start) : `${start}-${end}`,
      });
    }
    return buckets;
  }, [years, zoomStep]);

  const bucketIndexForYear = useCallback((year: number) => {
    if (timeBuckets.length === 0) return 0;
    const idx = Math.floor((year - scenarioStartYear) / zoomStep);
    return Math.max(0, Math.min(timeBuckets.length - 1, idx));
  }, [timeBuckets.length, scenarioStartYear, zoomStep]);

  const eventBucketRanges = useMemo(() => {
    const ranges = new Map<string, { start: number; end: number }>();
    for (const event of events) {
      const durationYears = Math.max(1, event.duration ?? 1);
      const start = bucketIndexForYear(event.year);
      const end = bucketIndexForYear(event.year + durationYears - 1);
      ranges.set(event.id, { start, end });
    }
    return ranges;
  }, [events, bucketIndexForYear]);

  // Compute stable lane assignments for events to avoid overlaps when long-running
  const eventLanes = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const aStart = eventBucketRanges.get(a.id)?.start ?? 0;
      const bStart = eventBucketRanges.get(b.id)?.start ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      // longer durations first to reserve lanes consistently
      return (b.duration ?? 1) - (a.duration ?? 1);
    });
    const laneMap = new Map<string, number>();
    for (const event of sorted) {
      const current = eventBucketRanges.get(event.id);
      if (!current) continue;
      const used = new Set<number>();
      for (const [id, lane] of laneMap) {
        const other = eventBucketRanges.get(id);
        if (!other) continue;
        const overlaps = other.start <= current.end && current.start <= other.end;
        if (overlaps) used.add(lane);
      }
      let lane = 0;
      while (used.has(lane)) lane++;
      laneMap.set(event.id, lane);
    }
    return laneMap;
  }, [events, eventBucketRanges]);

  type ForecastPoint = {
    year: number;
    income: number;
    outflow: number;
    eventOutflow: number; // cash cost of asset events this year (capex + opex)
    taxes: number;
    baseDelta: number;
    eventImpactNetWorth: number;
    eventImpactLiquidity: number;
    netWorth: number;
    liquidity: number;
    nonLiquid: number;
    netChangeNetWorth: number;
    netChangeLiquidity: number;
    events: PlanEvent[];
  };

  // Per-year compounded dollar growth from strategy positions using benchmark return rates.
  // For years with actual data, uses actualReturnRate; beyond that, falls back to the
  // strategy's most recent targetReturnRate.
  const strategyGrowthByYear = useMemo<Map<number, number>>(() => {
    const stratPositions = positions.filter((p) => p.tags?.includes('fremont-strategy') && (p.value ?? 0) > 0);
    if (stratPositions.length === 0 || strategyBenchmarks.length === 0) return new Map();

    // Latest known target rate per strategy for years beyond the benchmark data
    const latestTarget = new Map<string, { rate: number; year: number }>();
    for (const b of strategyBenchmarks) {
      const prev = latestTarget.get(b.strategy);
      if (prev === undefined || b.year >= prev.year) {
        latestTarget.set(b.strategy, { rate: b.targetReturnRate, year: b.year });
      }
    }

    const bmMap = new Map(strategyBenchmarks.map((b) => [`${b.strategy}|${b.year}`, b]));

    // Track each strategy's accumulated value through the forecast years (compounding)
    const accumulated = new Map(stratPositions.map((p) => [p.name, p.value ?? 0]));

    const result = new Map<number, number>();
    for (const year of years) {
      let totalGrowth = 0;
      for (const pos of stratPositions) {
        const bm = bmMap.get(`${pos.name}|${year}`);
        const rate = bm
          ? year <= selectedYear ? bm.actualReturnRate : bm.targetReturnRate
          : (latestTarget.get(pos.name)?.rate ?? 0);
        const current = accumulated.get(pos.name) ?? 0;
        const growth = current * rate;
        accumulated.set(pos.name, current + growth);
        totalGrowth += growth;
      }
      result.set(year, totalGrowth);
    }
    return result;
  }, [positions, strategyBenchmarks, years, selectedYear]);

  // Aggregate position values for use in the simple-return-rate forecast path.
  // These are stable memos so they don't cause unnecessary recomputation.
  const totalPositionsValue = useMemo(
    () => positions.reduce((sum, p) => sum + (Number(p.value) || 0), 0),
    [positions],
  );
  const liquidPositionsValue = useMemo(
    () => positions.filter((p) => p.liquid).reduce((sum, p) => sum + (Number(p.value) || 0), 0),
    [positions],
  );

  const computeForecastYearly = useCallback((
    seedNetWorth: number,
    seedLiquidity: number,
    taxRateAssumption: number,
    taxBasisAssumption: TaxBasis,
    plannedEvents: PlanEvent[],
    returnRateAssumption: number = 0,
    seedPositionsTotal: number = 0,
    seedPositionsLiquid: number = 0,
  ) => {
    const points: ForecastPoint[] = [];
    let netWorth = seedNetWorth;
    let liquidity = seedLiquidity;

    // Track the investable position pool separately so the return rate compounds
    // on actual positions rather than the whole net worth (which includes physical assets).
    let posPool = seedPositionsTotal;
    // Liquid fraction of positions — used to split growth between NW and liquidity.
    const liquidFraction = seedPositionsTotal > 0
      ? Math.min(1, seedPositionsLiquid / seedPositionsTotal)
      : 1;

    for (const year of years) {
      // Strategy benchmark growth takes precedence when configured.
      // Otherwise compound the position pool at the scenario's simple return rate.
      const rate = Math.max(0, returnRateAssumption);
      let portfolioReturn: number;
      let nonLiquidPositionGrowth: number;
      if (strategyGrowthByYear.has(year)) {
        portfolioReturn = strategyGrowthByYear.get(year) ?? 0;
        nonLiquidPositionGrowth = 0; // existing strategy behavior: all growth applied to both NW and liquidity
      } else {
        portfolioReturn = posPool * rate;
        nonLiquidPositionGrowth = portfolioReturn * (1 - liquidFraction);
        posPool += portfolioReturn;
      }
      const income = incomeItems.reduce((sum, item) => (year >= item.start && year <= item.end ? sum + item.amount : sum), 0);
      const outflow = outflowItems.reduce((sum, item) => (year >= item.start && year <= item.end ? sum + item.amount : sum), 0);
      const taxRate = Math.max(0, Math.min(1, taxRateAssumption));
      const taxableIncome = taxBasisAssumption === 'net_income'
        ? Math.max(0, income - outflow)
        : Math.max(0, income);
      const taxes = taxableIncome * taxRate;
      const baseDelta = income - outflow - taxes + portfolioReturn;

      let eventImpactNetWorth = 0;
      let eventImpactLiquidity = 0;
      let eventOutflow = 0;
      const activeEvents = plannedEvents.filter((event) => year >= event.year && year < event.year + (event.duration ?? 1));

      for (const event of activeEvents) {
        const assetMeta = ASSETS[event.asset];
        const oneTime = Math.max(0, event.cost ?? 0);
        const recurringBase = Math.max(0, event.recurring ?? 0);
        const recurringGrowth = event.asset === 'School' ? Math.max(0, event.recurringGrowth ?? 0) : 0;
        const yearsSinceStart = year - event.year;
        const recurring = recurringBase > 0 ? recurringBase * Math.pow(1 + recurringGrowth, Math.max(0, yearsSinceStart)) : 0;

        if (event.asset === 'OpCos') {
          if (year === event.year) {
            const transfer = Math.max(0, event.transfer ?? 0);
            eventImpactLiquidity += event.action === 'sell' ? transfer : -transfer;
          }
          continue;
        }

        if (assetMeta.behavior === 'capital') {
          if (year === event.year && oneTime > 0) {
            eventImpactLiquidity -= oneTime;
            eventOutflow += oneTime; // capex: cash out
          }
          if (recurring > 0) {
            eventImpactLiquidity -= recurring;
            eventImpactNetWorth -= recurring;
            eventOutflow += recurring; // opex: cash out
          }
          if (event.asset === 'Airplane' && event.usefulLifeYears && event.usefulLifeYears > 0) {
            const residual = (event.residualPct ?? 0) * oneTime;
            const depreciable = Math.max(0, oneTime - residual);
            const annualDepreciation = depreciable / event.usefulLifeYears;
            if (yearsSinceStart >= 0 && yearsSinceStart < event.usefulLifeYears) {
              eventImpactNetWorth -= annualDepreciation;
              // depreciation is non-cash; not added to eventOutflow
            }
          }
        } else {
          if (year === event.year && oneTime > 0) {
            eventImpactLiquidity -= oneTime;
            eventImpactNetWorth -= oneTime;
            eventOutflow += oneTime; // capex: cash out
          }
          if (recurring > 0) {
            eventImpactLiquidity -= recurring;
            eventImpactNetWorth -= recurring;
            eventOutflow += recurring; // opex: cash out
          }
        }
      }

      const netChangeNetWorth = baseDelta + eventImpactNetWorth;
      const netChangeLiquidity = baseDelta - nonLiquidPositionGrowth + eventImpactLiquidity;

      netWorth += netChangeNetWorth;
      liquidity += netChangeLiquidity;
      const liquidityDisplay = Math.max(0, liquidity);
      const nonLiquid = Math.max(0, netWorth - liquidityDisplay);

      points.push({
        year,
        income,
        outflow,
        eventOutflow,
        taxes,
        baseDelta,
        eventImpactNetWorth,
        eventImpactLiquidity,
        netWorth,
        liquidity,
        nonLiquid,
        netChangeNetWorth,
        netChangeLiquidity,
        events: activeEvents,
      });
    }

    return points;
  }, [years, incomeItems, outflowItems, strategyGrowthByYear]);

  const forecastYearly = useMemo(() => {
    return computeForecastYearly(
      scenarioBaseNetWorth,
      scenarioBaseLiquidity,
      scenarioTaxRate,
      scenarioTaxBasis,
      events,
      scenarioReturnRate,
      totalPositionsValue,
      liquidPositionsValue,
    );
  }, [
    computeForecastYearly,
    scenarioBaseNetWorth,
    scenarioBaseLiquidity,
    scenarioTaxRate,
    scenarioTaxBasis,
    events,
    scenarioReturnRate,
    totalPositionsValue,
    liquidPositionsValue,
  ]);
  const baseScenario = useMemo(
    () => scenarios.find((scenario) => scenario.name === 'Base Case') ?? scenarios[0],
    [scenarios],
  );
  const baseForecastYearly = useMemo(() => {
    if (!baseScenario) return [] as ForecastPoint[];
    return computeForecastYearly(
      baseScenario.baseNetWorth,
      baseScenario.baseLiquidity,
      baseScenario.taxRate ?? 0,
      baseScenario.taxBasis === 'net_income' ? 'net_income' : 'gross_income',
      baseScenario.events ?? [],
      baseScenario.returnRate ?? 0,
      totalPositionsValue,
      liquidPositionsValue,
    );
  }, [computeForecastYearly, baseScenario]);
  const baseForecastByYear = useMemo(
    () => new Map(baseForecastYearly.map((point) => [point.year, point])),
    [baseForecastYearly],
  );

  const forecast = useMemo(() => {
    if (forecastYearly.length === 0) return [] as Array<ForecastPoint & {
      bucketStart: number;
      bucketEnd: number;
      label: string;
      deltaVsBaseNetWorth: number;
      deltaVsBaseLiquidity: number;
    }>;

    return timeBuckets.map((bucket) => {
      const endOffset = Math.max(0, Math.min(forecastYearly.length - 1, bucket.end - scenarioStartYear));
      const point = forecastYearly[endOffset];
      const basePoint = baseForecastByYear.get(point.year);
      // Sum event outflows across all years in the bucket for the tooltip
      const bucketEventOutflow = forecastYearly
        .filter((p) => p.year >= bucket.start && p.year <= bucket.end)
        .reduce((sum, p) => sum + p.eventOutflow, 0);
      return {
        ...point,
        eventOutflow: bucketEventOutflow,
        bucketStart: bucket.start,
        bucketEnd: bucket.end,
        label: bucket.label,
        deltaVsBaseNetWorth: basePoint ? point.netWorth - basePoint.netWorth : 0,
        deltaVsBaseLiquidity: basePoint ? point.liquidity - basePoint.liquidity : 0,
      };
    });
  }, [forecastYearly, timeBuckets, scenarioStartYear, baseForecastByYear]);

  const onDragStart = (e: React.DragEvent<HTMLButtonElement>, kind: PlanningAssetKind) => {
    setDragMode('asset');
    e.dataTransfer.setData('application/x-plan-asset', kind);
    e.dataTransfer.setData('text/plain', kind);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getDraggedAssetKind = (dataTransfer: DataTransfer): PlanningAssetKind | null => {
    const raw = dataTransfer.getData('application/x-plan-asset') || dataTransfer.getData('text/plain');
    const kind = raw as PlanningAssetKind;
    return ASSETS[kind] ? kind : null;
  };

  const onDropYear = (year: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragMode(null);
    setAffordabilityError(null);
    // If dragging an existing event, move it
    const eventId = e.dataTransfer.getData('application/x-plan-event');
    if (eventId) {
      setEvents((prev) => {
        const existing = prev.find((ev) => ev.id === eventId);
        if (!existing || existing.year === year) return prev;
        const updated = { ...existing, year };
        logActivity('Planning event moved', { scenarioId: currentId, eventId, previousYear: existing.year, nextYear: year });
        return prev.map((ev) => (ev.id === eventId ? updated : ev));
      });
      return;
    }
    // Otherwise, treat it as adding a new asset from the palette
    const k = getDraggedAssetKind(e.dataTransfer);
    if (!k) return;
    const defs = assetDefaults[k] || {};
    setModal({
      open: true,
      year,
      kind: k,
      value: '',
      label: k,
      editId: null,
      duration: defs.duration ?? '1',
      color: defs.color ?? ASSET_COLORS[k],
      cost: defs.cost ?? '',
      recurring: defs.recurring ?? '',
      recurringInc: defs.recurringInc ?? '',
      lifeYears: defs.lifeYears ?? '',
      residualPct: defs.residualPct ?? '',
      opAction: defs.opAction ?? 'buy',
      opAmount: defs.opAmount ?? '',
    });
  };

  const parseAmount = (txt: string) => {
    const n = Number(String(txt).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const confirmModal = useCallback(() => {
    if (!modal.open || modal.year == null || !modal.kind) return;
    const label = modal.label && modal.label.trim() ? modal.label.trim() : undefined;
    const year = modal.year;
    const kind = modal.kind;
    const duration = Math.max(1, Math.round(Number(modal.duration) || 1));
    const color = modal.color || ASSET_COLORS[kind];
    const cost = Math.max(0, parseAmount(modal.cost || '0') || 0);
    const recurringBase = modal.kind === 'Travel' ? 0 : Math.max(0, parseAmount(modal.recurring || '0') || 0);
    const recurringGrowth = modal.kind === 'School' ? Math.max(0, (Number(modal.recurringInc) || 0) / 100) : 0;
    const usefulLifeYears = modal.kind === 'Airplane' ? Math.max(1, Math.round(Number(modal.lifeYears) || 10)) : undefined;
    const residualPct = modal.kind === 'Airplane' ? Math.max(0, Math.min(1, (Number(modal.residualPct) || 0) / 100)) : undefined;
    let nextEvent: PlanEvent | null = null;
    if (kind === 'OpCos') {
      const action = modal.opAction;
      const transfer = Math.max(0, parseAmount(modal.opAmount || '0') || 0);
      if (!action || !(transfer > 0)) return;
      nextEvent = {
        id: modal.editId ?? `${kind}-${year}-${Math.random().toString(36).slice(2, 6)}`,
        year,
        asset: kind,
        label,
        duration: 1,
        color,
        action,
        transfer,
        value: 0,
      } as PlanEvent;
    } else {
      nextEvent = {
        id: modal.editId ?? `${kind}-${year}-${Math.random().toString(36).slice(2, 6)}`,
        year,
        asset: kind,
        label,
        duration,
        color,
        cost,
        recurring: recurringBase,
        recurringGrowth: modal.kind === 'School' ? recurringGrowth : undefined,
        usefulLifeYears,
        residualPct,
        value: 0,
      };
    }

    const eventsWithoutEdited = modal.editId ? events.filter((event) => event.id !== modal.editId) : [...events];
    const candidateEvents = [...eventsWithoutEdited, nextEvent];
    const baselineForecast = computeForecastYearly(
      scenarioBaseNetWorth,
      scenarioBaseLiquidity,
      scenarioTaxRate,
      scenarioTaxBasis,
      eventsWithoutEdited,
      scenarioReturnRate,
      totalPositionsValue,
      liquidPositionsValue,
    );
    const candidateForecast = computeForecastYearly(
      scenarioBaseNetWorth,
      scenarioBaseLiquidity,
      scenarioTaxRate,
      scenarioTaxBasis,
      candidateEvents,
      scenarioReturnRate,
      totalPositionsValue,
      liquidPositionsValue,
    );

    const yearOffset = Math.max(0, Math.min(years.length - 1, year - scenarioStartYear));
    const startLiquidityAtYear =
      yearOffset === 0
        ? scenarioBaseLiquidity
        : (baselineForecast[yearOffset - 1]?.liquidity ?? scenarioBaseLiquidity);

    const upfrontLiquidityRequired =
      nextEvent.asset === 'OpCos'
        ? nextEvent.action === 'buy'
          ? Math.max(0, nextEvent.transfer ?? 0)
          : 0
        : Math.max(0, nextEvent.cost ?? 0);

    if (upfrontLiquidityRequired > Math.max(0, startLiquidityAtYear)) {
      setAffordabilityError(
        `Insufficient initial liquidity for ${year}. Required ${fmtCurrency(upfrontLiquidityRequired)}, available ${fmtCurrency(Math.max(0, startLiquidityAtYear))}.`,
      );
      return;
    }

    const firstNegative = candidateForecast.find((point) => point.liquidity < 0);
    if (firstNegative) {
      setAffordabilityError(
        `This item drives liquidity negative in ${firstNegative.year} (${fmtCurrency(firstNegative.liquidity)}).`,
      );
      return;
    }

    setAffordabilityError(null);
    if (modal.editId) {
      const eventId = modal.editId;
      setEvents((prev) => {
        const existing = prev.find((ev) => ev.id === eventId);
        if (!existing) return prev;
        logActivity('Planning event updated', { scenarioId: currentId, eventId, previous: existing, next: nextEvent });
        return prev.map((ev) => (ev.id === eventId ? nextEvent : ev));
      });
    } else {
      setEvents((prev) => {
        logActivity('Planning event added', { scenarioId: currentId, event: nextEvent });
        return [...prev, nextEvent];
      });
    }
    setModal({
      open: false,
      year: null,
      kind: null,
      value: '',
      label: '',
      editId: null,
      duration: '1',
      color: '#bfdbfe',
      cost: '',
      recurring: '',
      recurringInc: '',
      lifeYears: '',
      residualPct: '',
      opAction: 'buy',
      opAmount: '',
    });
  }, [
    modal,
    setEvents,
    currentId,
    logActivity,
    events,
    years.length,
    scenarioStartYear,
    scenarioBaseNetWorth,
    scenarioBaseLiquidity,
    scenarioTaxRate,
    scenarioTaxBasis,
    scenarioReturnRate,
    totalPositionsValue,
    liquidPositionsValue,
    computeForecastYearly,
  ]);

  const cancelModal = () => {
    setAffordabilityError(null);
    setModal({
      open: false,
      year: null,
      kind: null,
      value: '',
      label: '',
      editId: null,
      duration: '1',
      color: '#bfdbfe',
      cost: '',
      recurring: '',
      recurringInc: '',
      lifeYears: '',
      residualPct: '',
      opAction: 'buy',
      opAmount: '',
    });
  };

  const removeEvent = (id: string) => setEvents((prev) => {
    const target = prev.find((e) => e.id === id);
    if (!target) return prev;
    logActivity('Planning event removed', { scenarioId: currentId, event: target });
    return prev.filter((e) => e.id !== id);
  });

  const endingPoint = forecastYearly[forecastYearly.length - 1];
  const minLiquidity = forecastYearly.length > 0 ? Math.min(scenarioBaseLiquidity, ...forecastYearly.map((point) => point.liquidity)) : scenarioBaseLiquidity;
  const negativeLiquidityYears = forecastYearly.filter((point) => point.liquidity < 0).map((point) => point.year);
  const deltaVsBaseAtHorizon = endingPoint ? baseForecastByYear.get(endingPoint.year)?.netWorth : undefined;
  // Axis scaling for simple stacked bar chart (NW split into liquidity + non-liquid)
  const maxNW = Math.max(...forecast.map((point) => point.netWorth), scenarioBaseNetWorth) || 1;

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-800">Scenario</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              value={currentId}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== currentId) {
                  logActivity('Planning scenario selected', { from: currentId, to: next });
                }
                setCurrentId(next);
              }}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50" onClick={newScenario}>New</button>
            <button className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50" onClick={saveAsScenario}>Save As</button>
            <button className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50" onClick={renameScenario}>Rename</button>
            <button className="rounded-md border border-rose-200 px-2 py-1 text-sm text-rose-700 hover:bg-rose-50" onClick={deleteScenario}>Delete</button>
          </div>
        </div>
        {canonicalFacts && (
          <div className="mb-3 rounded-md border border-brand-200 bg-brand-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-800">
              Canonical Snapshot ({selectedYear})
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-brand-100">
                Plan Net Worth: <strong>{fmtNullableCurrency(canonicalFacts.plannedNetWorth)}</strong>
              </div>
              <div className="rounded bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-brand-100">
                Actual Net Worth: <strong>{fmtCurrency(canonicalFacts.actualNetWorth)}</strong>
              </div>
              <div className="rounded bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-brand-100">
                Plan Liquidity: <strong>{fmtNullableCurrency(canonicalFacts.plannedLiquidity)}</strong>
              </div>
              <div className="rounded bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-brand-100">
                Actual Liquidity: <strong>{fmtCurrency(canonicalFacts.actualLiquidity)}</strong>
              </div>
            </div>
            {(canonicalFacts.warnings?.length ?? 0) > 0 && (
              <div className="mt-2 text-xs text-amber-800">
                Data warnings: {canonicalFacts.warnings.map((warning) => warning.message).join(' • ')}
              </div>
            )}
          </div>
        )}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current Net Worth</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{fmtCurrency(scenarioBaseNetWorth)}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current Liquidity</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{fmtCurrency(scenarioBaseLiquidity)}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Projected Net Worth</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{fmtCurrency(endingPoint?.netWorth ?? scenarioBaseNetWorth)}</div>
            <div className="text-xs text-slate-500">{scenarioStartYear + scenarioHorizonYears - 1}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Projected Liquidity</div>
            <div className={`mt-1 text-base font-semibold ${(endingPoint?.liquidity ?? 0) < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{fmtCurrency(endingPoint?.liquidity ?? scenarioBaseLiquidity)}</div>
            <div className="text-xs text-slate-500">{scenarioStartYear + scenarioHorizonYears - 1}</div>
          </div>
        </div>
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="block text-xs uppercase tracking-wide text-slate-500">Tax Rate</span>
                <span className="text-slate-400">%</span>
              </div>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-right"
                value={taxRateText}
                onChange={(e) => setTaxRateText(e.target.value)}
                onBlur={() => {
                  const next = Number(taxRateText);
                  if (!Number.isFinite(next)) {
                    setTaxRateText((scenarioTaxRate * 100).toFixed(1));
                    return;
                  }
                  const normalized = Math.max(0, Math.min(100, next)) / 100;
                  updateCurrentScenario((scenario) => ({ ...scenario, taxRate: normalized }));
                  setTaxRateText((normalized * 100).toFixed(1));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') setTaxRateText((scenarioTaxRate * 100).toFixed(1));
                }}
              />
              <div className="mt-1 inline-flex items-center rounded border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  className={
                    'rounded px-2 py-0.5 ' +
                    (scenarioTaxBasis === 'gross_income' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')
                  }
                  onClick={() => updateCurrentScenario((scenario) => ({ ...scenario, taxBasis: 'gross_income' }))}
                >
                  Gross Income
                </button>
                <button
                  type="button"
                  className={
                    'rounded px-2 py-0.5 ' +
                    (scenarioTaxBasis === 'net_income' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')
                  }
                  onClick={() => updateCurrentScenario((scenario) => ({ ...scenario, taxBasis: 'net_income' }))}
                >
                  Net Income
                </button>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="block text-xs uppercase tracking-wide text-slate-500">Return Rate</span>
                <span className="text-slate-400">%</span>
              </div>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-right"
                value={returnRateText}
                onChange={(e) => setReturnRateText(e.target.value)}
                onBlur={() => {
                  const next = Number(returnRateText);
                  if (!Number.isFinite(next)) {
                    setReturnRateText((scenarioReturnRate * 100).toFixed(1));
                    return;
                  }
                  const normalized = Math.max(0, Math.min(100, next)) / 100;
                  updateCurrentScenario((scenario) => ({ ...scenario, returnRate: normalized }));
                  setReturnRateText((normalized * 100).toFixed(1));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') setReturnRateText((scenarioReturnRate * 100).toFixed(1));
                }}
              />
              <div className="mt-1 text-xs text-slate-400">
                {strategyBenchmarks.length > 0 ? 'Fallback (benchmarks active)' : totalPositionsValue > 0 ? `On ${fmtCompactCurrency(totalPositionsValue)} positions` : 'No positions entered'}
              </div>
            </div>
            <label className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-700">
              <span className="block text-xs uppercase tracking-wide text-slate-500">Start Year</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-right"
                value={scenarioStartYear}
                onChange={(e) => {
                  const next = Math.round(Number(e.target.value));
                  if (!Number.isFinite(next)) return;
                  updateCurrentScenario((scenario) => ({ ...scenario, startYear: next }));
                }}
              />
            </label>
            <label className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-700">
              <span className="block text-xs uppercase tracking-wide text-slate-500">Horizon (Years)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-right"
                value={scenarioHorizonYears}
                onChange={(e) => {
                  const next = Math.max(1, Math.round(Number(e.target.value)));
                  if (!Number.isFinite(next)) return;
                  updateCurrentScenario((scenario) => ({ ...scenario, horizonYears: next }));
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
              Min Liquidity: <strong className={minLiquidity < 0 ? 'text-rose-700' : 'text-slate-800'}>{fmtCurrency(minLiquidity)}</strong>
            </span>
            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
              Negative Liquidity Years: <strong className={negativeLiquidityYears.length > 0 ? 'text-rose-700' : 'text-slate-800'}>{negativeLiquidityYears.length}</strong>
            </span>
            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
              Delta vs Base: <strong className={(endingPoint && deltaVsBaseAtHorizon != null && endingPoint.netWorth - deltaVsBaseAtHorizon >= 0) ? 'text-emerald-700' : 'text-rose-700'}>
                {fmtCurrency((endingPoint && deltaVsBaseAtHorizon != null) ? endingPoint.netWorth - deltaVsBaseAtHorizon : 0)}
              </strong>
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Start Net Worth and Liquidity are derived from your Positions + Assets. The Return Rate compounds annually on your position values ({fmtCompactCurrency(totalPositionsValue)} total, {fmtCompactCurrency(liquidPositionsValue)} liquid) — liquid position growth increases both net worth and liquidity; non-liquid position growth increases net worth only. Strategy Benchmarks take precedence when configured.
        </div>
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        {/* Asset palette */}
        <div className="min-w-0">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-800">Assets</h3>
            <div className="flex flex-col gap-2">
              {(Object.keys(ASSETS) as PlanningAssetKind[]).map((k) => (
                <button
                  key={k}
                  draggable
                  onDragStart={(e) => onDragStart(e, k)}
                  onDragEnd={() => setDragMode(null)}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  title={`Drag onto a year to add a ${k}`}
                >
                  <span className="material-symbols-outlined text-base text-slate-600">{ASSET_ICONS[k]}</span>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline + chart */}
        <div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">Timeline & Forecast</h3>
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
                {ZOOM_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setZoomStep(step)}
                    className={
                      'rounded px-2 py-1 text-xs font-medium ' +
                      (zoomStep === step ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')
                    }
                    title={`Group timeline by ${step} year${step === 1 ? '' : 's'}`}
                  >
                    {step}y
                  </button>
                ))}
              </div>
            </div>

            {/* Shared horizontal scroller for forecast + timeline */}
            <div className="max-w-full overflow-x-auto">
              <div className="min-w-max">
                <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded bg-brand-500" />
                    Liquidity
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded bg-brand-200" />
                    Non-liquid
                  </span>
                </div>
                {/* Simple stacked bars (non-liquid + liquidity) */}
                <div className="mb-4 flex w-max items-end gap-2" style={{ height: 160 }}>
                  {forecast.map((p) => {
                    const totalH = Math.max(4, Math.round((p.netWorth / maxNW) * 140));
                    const liqH = Math.max(2, Math.round((Math.max(0, p.liquidity) / maxNW) * 140));
                    const nonLiqH = Math.max(2, totalH - liqH);
                    return (
                      <div
                        key={`${p.bucketStart}-${p.bucketEnd}`}
                        className="relative flex flex-col items-center justify-end snap-start"
                        style={{ width: `${TIMELINE_COL_REM}rem` }}
                      >
                        <div className="relative w-full">
                          <div className="pointer-events-none absolute left-1 -top-6 rounded bg-slate-800 px-1 py-0.5 text-[10px] font-semibold text-white">
                            NW {fmtCompactCurrency(p.netWorth)}
                          </div>
                          <div className="w-full rounded-t bg-brand-200" style={{ height: nonLiqH }} title={`Non-liquid: ${fmtCurrency(p.nonLiquid)}`} />
                          <div className="w-full rounded-b bg-brand-500" style={{ height: liqH }} title={`Liquidity: ${fmtCurrency(p.liquidity)}`} />
                          <div className="pointer-events-none absolute left-1 top-1 rounded bg-white/90 px-1 py-0.5 text-[10px] font-semibold text-slate-700">
                            Non-Liq {fmtCompactCurrency(p.nonLiquid)}
                          </div>
                          <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-brand-700/85 px-1 py-0.5 text-[10px] font-semibold text-white">
                            Liq {fmtCompactCurrency(p.liquidity)}
                          </div>
                        </div>
                        <div
                          className="mt-1 text-center text-[12px] text-slate-600"
                          title={[
                            `Total NW: ${fmtCurrency(p.netWorth)}`,
                            `Non-liquid: ${fmtCurrency(p.nonLiquid)}`,
                            `Liquid: ${fmtCurrency(p.liquidity)}`,
                            p.eventOutflow > 0 ? `Asset costs: ${fmtCurrency(p.eventOutflow)} (capex + opex)` : '',
                          ].filter(Boolean).join('  •  ')}
                        >
                          {p.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Timeline grid: droppable years with event chips */}
                <div className="grid w-max grid-flow-col gap-2" style={{ gridAutoColumns: `${TIMELINE_COL_REM}rem` }}>
                {timeBuckets.map((bucket, bucketIndex) => {
                  const startingHere = events.filter((event) => (eventBucketRanges.get(event.id)?.start ?? -1) === bucketIndex);
                  const laneBasePx = 44; // approximate chip height; keep row gap minimal
                  const rowGapPx = 8; // gap between lanes
                  const laneStepPx = laneBasePx + rowGapPx; // per-row offset
                  // Lanes already occupied in this bucket by events that started in an earlier bucket.
                  const activeEarlier = events.filter((event) => {
                    const range = eventBucketRanges.get(event.id);
                    return !!range && range.start < bucketIndex && bucketIndex <= range.end;
                  });
                  const occupied = new Set<number>(activeEarlier.map((event) => eventLanes.get(event.id) ?? 0));
                  // Pre-assign lanes for items starting in this bucket, bumping if needed.
                  const assigned = startingHere.map((event) => {
                    let lane = eventLanes.get(event.id) ?? 0;
                    while (occupied.has(lane)) lane++;
                    occupied.add(lane);
                    return { event, lane };
                  });
                  const maxLaneUsed = occupied.size ? Math.max(...occupied) : -1;
                  return (
                  <div key={`${bucket.start}-${bucket.end}`} className="rounded-lg border border-dashed border-slate-300 p-2"
                    onDragOver={(e) => {
                      const types = Array.from((e.dataTransfer && (e.dataTransfer as any).types) || []);
                      const hasEvent = types.includes('application/x-plan-event');
                      const hasAsset = types.includes('application/x-plan-asset') || types.includes('text/plain');
                      if (!hasEvent && !hasAsset) return;
                      e.preventDefault();
                      // Indicate copy when dragging from palette, move when dragging existing event
                      e.dataTransfer.dropEffect = hasEvent ? 'move' : 'copy';
                    }}
                    onDrop={(e) => onDropYear(bucket.start, e)}
                  >
                    <div className="mb-2 text-xs font-medium text-slate-500">{bucket.label}</div>
                    <div className="flex flex-col gap-1" style={{ minHeight: maxLaneUsed >= 0 ? `${(maxLaneUsed + 1) * laneBasePx + Math.max(0, maxLaneUsed) * rowGapPx}px` : undefined }}>
                    {assigned.map(({ event, lane }) => {
                      const bg = event.color || ASSET_COLORS[event.asset];
                      const dur = Math.max(1, event.duration ?? 1);
                      const eventRange = eventBucketRanges.get(event.id);
                      const spanBuckets = Math.max(1, (eventRange?.end ?? bucketIndex) - bucketIndex + 1);
                      // Span inner content from first cell's inner-left to last cell's inner-right:
                      // N*col + (N-1)*gap - 2*0.5rem (subtract both cells' inner padding)
                      const width = `calc(${TIMELINE_COL_REM * spanBuckets}rem + ${TIMELINE_COL_GAP_REM * (spanBuckets - 1)}rem - 1rem)`;
                        return (
                          <div
                            key={event.id}
                            draggable
                            onDragStart={(e) => {
                              setDragMode('event');
                              e.dataTransfer.setData('application/x-plan-event', event.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragMode(null)}
                            className={
                              'relative z-10 box-border flex cursor-grab items-center justify-between rounded-md px-2 py-1 text-xs text-slate-800 active:cursor-grabbing' +
                              (dragMode === 'asset' ? ' pointer-events-none opacity-80' : '')
                            }
                            onDragOver={(e) => {
                              const types = Array.from((e.dataTransfer && (e.dataTransfer as any).types) || []);
                              const hasAsset = types.includes('application/x-plan-asset') || types.includes('text/plain');
                              if (!hasAsset) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'copy';
                            }}
                            onDrop={(e) => {
                              const types = Array.from((e.dataTransfer && (e.dataTransfer as any).types) || []);
                              const hasAsset = types.includes('application/x-plan-asset') || types.includes('text/plain');
                              if (!hasAsset) return;
                              onDropYear(bucket.start, e as React.DragEvent<HTMLDivElement>);
                            }}
                            style={{ backgroundColor: bg, width, marginTop: lane > 0 ? `${lane * laneStepPx}px` : undefined }}
                            title={'Drag to another year'}
                          >
                            <span
                              className="flex items-start gap-2 cursor-pointer"
                            onClick={() =>
                                  setModal({
                                  open: true,
                                      year: event.year,
                                      kind: event.asset,
                                      value: '',
                                      label: event.label || event.asset,
                                      editId: event.id,
                                      duration: String(event.duration ?? 1),
                                      color: event.color || bg,
                                      cost: event.cost != null ? fmtCurrency(event.cost) : '',
                                      recurring: event.recurring != null ? fmtCurrency(event.recurring) : '',
                                      recurringInc: event.asset === 'School' && event.recurringGrowth != null ? String((event.recurringGrowth * 100).toFixed(1)) : '',
                                      lifeYears: event.asset === 'Airplane' && event.usefulLifeYears != null ? String(event.usefulLifeYears) : '',
                                      residualPct: event.asset === 'Airplane' && event.residualPct != null ? String((event.residualPct * 100).toFixed(1)) : '',
                                      opAction: event.action ?? 'buy',
                                      opAmount: event.transfer != null ? fmtCurrency(event.transfer) : '',
                                    })
                                  }
                                >
                              <span className="material-symbols-outlined mt-0.5 text-sm text-slate-700">{ASSET_ICONS[event.asset]}</span>
                                  <span className="flex flex-col leading-tight">
                                    <span className="font-medium">{event.label || event.asset}</span>
                                    <span>
                                      {(() => {
                                        const cost = Math.max(0, event.cost ?? 0);
                                        const rec = Math.max(0, event.recurring ?? 0);
                                        const parts: string[] = [];
                                        if (cost > 0) parts.push(`${fmtCurrency(cost)}`);
                                        if (rec > 0) parts.push(`${fmtCurrency(rec)}/yr`);
                                        const left = parts.length ? parts.join(' + ') : '$0';
                                        return `${left} · ${dur}y`;
                                      })()}
                                    </span>
                                  </span>
                            </span>
                            <button className="text-slate-700 hover:text-rose-700" title="Remove" onClick={() => removeEvent(event.id)}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );})}
              </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-800">Year Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Year</th>
                <th className="px-3 py-2 text-right font-medium">Income</th>
                <th className="px-3 py-2 text-right font-medium">Outflows (incl. asset costs)</th>
                <th className="px-3 py-2 text-right font-medium">
                  Taxes ({(scenarioTaxRate * 100).toFixed(1)}%, {scenarioTaxBasis === 'gross_income' ? 'Gross' : 'Net'})
                </th>
                <th className="px-3 py-2 text-right font-medium">Base Delta</th>
                <th className="px-3 py-2 text-right font-medium">Event NW Impact</th>
                <th className="px-3 py-2 text-right font-medium">Event Liq Impact</th>
                <th className="px-3 py-2 text-right font-medium">End Net Worth</th>
                <th className="px-3 py-2 text-right font-medium">End Liquidity</th>
                <th className="px-3 py-2 text-right font-medium">Delta vs Base NW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {forecastYearly.map((point) => {
                const basePoint = baseForecastByYear.get(point.year);
                const deltaVsBase = basePoint ? point.netWorth - basePoint.netWorth : 0;
                return (
                  <tr key={point.year} className={point.liquidity < 0 ? 'bg-rose-50/60' : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-700">{point.year}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{fmtCurrency(point.income)}</td>
                    <td className="px-3 py-2 text-right text-rose-700" title={point.eventOutflow > 0 ? `Cashflows: ${fmtCurrency(point.outflow)}  •  Asset costs: ${fmtCurrency(point.eventOutflow)}` : undefined}>
                      {fmtCurrency(point.outflow + point.eventOutflow)}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-700">{fmtCurrency(point.taxes)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtCurrency(point.baseDelta)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtCurrency(point.eventImpactNetWorth)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtCurrency(point.eventImpactLiquidity)}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{fmtCurrency(point.netWorth)}</td>
                    <td className={`px-3 py-2 text-right ${point.liquidity < 0 ? 'font-semibold text-rose-700' : 'text-slate-900'}`}>
                      {fmtCurrency(point.liquidity)}
                    </td>
                    <td className={`px-3 py-2 text-right ${deltaVsBase >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {fmtCurrency(deltaVsBase)}
                    </td>
                  </tr>
                );
              })}
              {forecastYearly.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={10}>No forecast data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Income and Outflow tables */}
      <div className="mt-8 grid grid-cols-1 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Income Items</h3>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
              onClick={() => setIncomeItems((prev) => [{ id: Math.random().toString(36).slice(2,8), name: 'New Income', amount: 10000, start: scenarioStartYear, end: scenarioStartYear }, ...prev])}
            >
              Add
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Amount (USD/yr)</th>
                <th className="px-3 py-2 text-center font-medium">Start</th>
                <th className="px-3 py-2 text-center font-medium">End</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incomeItems.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2"><input className="w-full rounded border border-slate-200 px-2 py-1" value={it.name} onChange={(e)=> setIncomeItems(prev => prev.map(x=> x.id===it.id? {...x, name: e.target.value}: x))} /></td>
                  <td className="px-3 py-2 text-right"><input className="w-full rounded border border-slate-200 px-2 py-1 text-right" value={it.amount} type="number" onChange={(e)=> setIncomeItems(prev => prev.map(x=> x.id===it.id? {...x, amount: Number(e.target.value)||0}: x))} /></td>
                  <td className="px-3 py-2 text-center"><input className="w-24 rounded border border-slate-200 px-2 py-1 text-center" type="number" value={it.start} onChange={(e)=> setIncomeItems(prev => prev.map(x=> x.id===it.id? {...x, start: Number(e.target.value)||scenarioStartYear}: x))} /></td>
                  <td className="px-3 py-2 text-center"><input className="w-24 rounded border border-slate-200 px-2 py-1 text-center" type="number" value={it.end} onChange={(e)=> setIncomeItems(prev => prev.map(x=> x.id===it.id? {...x, end: Number(e.target.value)||it.start}: x))} /></td>
                  <td className="px-3 py-2 text-right"><button className="rounded p-1 text-slate-600 hover:bg-rose-50 hover:text-rose-700" onClick={()=> setIncomeItems(prev => prev.filter(x=> x.id!==it.id))}>Delete</button></td>
                </tr>
              ))}
              {incomeItems.length===0 && (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No income items</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-slate-700">
                <td className="px-3 py-2 font-medium">Total</td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmtCurrency(incomeItems.reduce((s, it) => s + (Number(it.amount) || 0), 0))}
                </td>
                <td className="px-3 py-2 text-center text-slate-400">—</td>
                <td className="px-3 py-2 text-center text-slate-400">—</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Outflows</h3>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
              onClick={() => setOutflowItems((prev) => [{ id: Math.random().toString(36).slice(2,8), name: 'New Outflow', amount: 5000, start: scenarioStartYear, end: scenarioStartYear }, ...prev])}
            >
              Add
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Amount (USD/yr)</th>
                <th className="px-3 py-2 text-center font-medium">Start</th>
                <th className="px-3 py-2 text-center font-medium">End</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outflowItems.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2"><input className="w-full rounded border border-slate-200 px-2 py-1" value={it.name} onChange={(e)=> setOutflowItems(prev => prev.map(x=> x.id===it.id? {...x, name: e.target.value}: x))} /></td>
                  <td className="px-3 py-2 text-right"><input className="w-full rounded border border-slate-200 px-2 py-1 text-right" value={it.amount} type="number" onChange={(e)=> setOutflowItems(prev => prev.map(x=> x.id===it.id? {...x, amount: Number(e.target.value)||0}: x))} /></td>
                  <td className="px-3 py-2 text-center"><input className="w-24 rounded border border-slate-200 px-2 py-1 text-center" type="number" value={it.start} onChange={(e)=> setOutflowItems(prev => prev.map(x=> x.id===it.id? {...x, start: Number(e.target.value)||scenarioStartYear}: x))} /></td>
                  <td className="px-3 py-2 text-center"><input className="w-24 rounded border border-slate-200 px-2 py-1 text-center" type="number" value={it.end} onChange={(e)=> setOutflowItems(prev => prev.map(x=> x.id===it.id? {...x, end: Number(e.target.value)||it.start}: x))} /></td>
                  <td className="px-3 py-2 text-right"><button className="rounded p-1 text-slate-600 hover:bg-rose-50 hover:text-rose-700" onClick={()=> setOutflowItems(prev => prev.filter(x=> x.id!==it.id))}>Delete</button></td>
                </tr>
              ))}
              {outflowItems.length===0 && (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No outflows</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-slate-700">
                <td className="px-3 py-2 font-medium">Total</td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmtCurrency(outflowItems.reduce((s, it) => s + (Number(it.amount) || 0), 0))}
                </td>
                <td className="px-3 py-2 text-center text-slate-400">—</td>
                <td className="px-3 py-2 text-center text-slate-400">—</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40" onClick={cancelModal} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h4 className="mb-3 text-base font-semibold text-slate-800">{modal.editId ? 'Edit' : 'Add'} {modal.kind} — {modal.year}</h4>
            <div className="space-y-3">
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-slate-500">Name (optional)</span>
                <input
                  value={modal.label}
                  onChange={(e) => setModal((m) => ({ ...m, label: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder={modal.kind || 'Name'}
                />
              </label>
              
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-slate-500">Cost (USD)</span>
                  <input
                    value={modal.cost}
                    onChange={(e) => setModal((m) => ({ ...m, cost: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder="$10,000"
                    inputMode="decimal"
                  />
                </label>
                {modal.kind !== 'Travel' && (
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Recurring (USD / year)</span>
                    <input
                      value={modal.recurring}
                      onChange={(e) => setModal((m) => ({ ...m, recurring: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="$5,000"
                      inputMode="decimal"
                    />
                  </label>
                )}
              </div>
              {modal.kind === 'School' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Annual Increase (%)</span>
                    <input
                      value={modal.recurringInc}
                      onChange={(e) => setModal((m) => ({ ...m, recurringInc: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="5.0"
                      inputMode="decimal"
                    />
                  </label>
                </div>
              )}
              {modal.kind === 'Airplane' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Useful Life (years)</span>
                    <input
                      value={modal.lifeYears}
                      onChange={(e) => setModal((m) => ({ ...m, lifeYears: e.target.value, duration: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="10"
                      type="number"
                      min={1}
                      step={1}
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Residual Value (%)</span>
                    <input
                      value={modal.residualPct}
                      onChange={(e) => setModal((m) => ({ ...m, residualPct: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="20"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                    />
                  </label>
                </div>
              )}
              {modal.kind === 'OpCos' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Action</span>
                    <select
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={modal.opAction}
                      onChange={(e) => setModal((m) => ({ ...m, opAction: e.target.value as 'buy' | 'sell' }))}
                    >
                      <option value="buy">Buy (use cash)</option>
                      <option value="sell">Sell (generate cash)</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-slate-500">Amount (USD)</span>
                    <input
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="$100,000"
                      inputMode="decimal"
                      value={modal.opAmount}
                      onChange={(e) => setModal((m) => ({ ...m, opAmount: e.target.value }))}
                    />
                  </label>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-slate-500">Duration (years)</span>
                  <input
                    value={modal.duration}
                    onChange={(e) => setModal((m) => ({ ...m, duration: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    step="1"
                    min={1}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-slate-500">Color</span>
                  <input
                    type="color"
                    value={modal.color}
                    onChange={(e) => setModal((m) => ({ ...m, color: e.target.value }))}
                    className="h-9 w-16 cursor-pointer rounded border border-slate-200 bg-white p-0"
                    title="Choose background color"
                  />
                </label>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                {modal.editId && (
                  <button
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    onClick={() => {
                      if (!modal.editId) return;
                      removeEvent(modal.editId);
                      setAffordabilityError(null);
                      setModal({
                        open: false,
                        year: null,
                        kind: null,
                        value: '',
                        label: '',
                        editId: null,
                        duration: '1',
                        color: '#bfdbfe',
                        cost: '',
                        recurring: '',
                        recurringInc: '',
                        lifeYears: '',
                        residualPct: '',
                        opAction: 'buy',
                        opAmount: '',
                      });
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {affordabilityError && (
                  <div className="max-w-xs text-right text-xs font-medium text-rose-700">{affordabilityError}</div>
                )}
                <div className="flex gap-2">
                  <button className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={cancelModal}>Cancel</button>
                  <button
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    disabled={
                      modal.kind === 'OpCos'
                        ? !(parseAmount(modal.opAmount || '0') > 0)
                        : !((parseAmount(modal.cost || '0') > 0) || (parseAmount(modal.recurring || '0') > 0))
                    }
                    onClick={confirmModal}
                  >
                    {modal.editId ? 'Save' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
