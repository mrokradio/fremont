'use client';

import { useState, useEffect, useMemo } from 'react';
import { LOCAL_STORAGE_KEYS, type FinancialWorkspaceResponse } from '@fremont/shared';
import type { PortfolioSnapshot, Position, Transaction } from '../types/models';
import { api } from '../lib/api';
import type { AuthStatus } from './useAuth';

type AssetValueItem = {
  id: string;
  value: number;
  liquid?: boolean;
};

const DEMO_POSITION_IDS = 'p1,p2,p3,p4,p5,p6';

function isFallbackDemoPositions(rows: Position[]): boolean {
  if (rows.length !== 6) return false;
  return rows.map((r) => r.id).sort().join(',') === DEMO_POSITION_IDS;
}

function toPositionWriteInput(position: Position) {
  return {
    name: position.name,
    assetClass: position.assetClass,
    year: position.year,
    value: Number(position.value) || 0,
    costBasis: position.costBasis,
    irr: position.irr,
    tags: position.tags ?? [],
    liquid: !!position.liquid,
  };
}

function readAssetsFromStorage(): AssetValueItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.assets);
    const parsed = raw ? (JSON.parse(raw) as AssetValueItem[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: String(item?.id ?? Math.random().toString(36).slice(2, 8)),
      value: Number(item?.value) || 0,
      liquid: !!item?.liquid,
    }));
  } catch {
    return [];
  }
}

const DEMO_SNAPSHOT: PortfolioSnapshot = {
  asOf: new Date().toISOString().slice(0, 10),
  netWorth: 128_450_000,
  liquidity: 7_200_000,
  allocation: [
    { assetClass: 'Public Equity', percent: 0.38 },
    { assetClass: 'Private Equity', percent: 0.24 },
    { assetClass: 'Real Assets', percent: 0.18 },
    { assetClass: 'Fixed Income', percent: 0.12 },
    { assetClass: 'Cash', percent: 0.08 },
  ],
  upcomingCashflows: [
    { date: '2025-01-15', amount: -450000, description: 'Capital Call — PE Fund VI' },
    { date: '2025-03-01', amount: 300000, description: 'Distribution — RE Fund II' },
    { date: '2025-04-10', amount: -125000, description: 'Tax Estimate — Q1' },
  ],
};

export type UsePortfolioDataReturn = {
  snapshot: PortfolioSnapshot;
  positions: Position[];
  transactions: Transaction[];
  assets: AssetValueItem[];
  workspace: FinancialWorkspaceResponse | null;
  apiConnected: boolean;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  baseNetWorth: number;
  baseLiquidity: number;
  addPosition: () => Position;
  createPositionFromInput: (input: Omit<Position, 'id'>) => Position;
  updatePosition: (pos: Position) => void;
  deletePosition: (id: string) => void;
  toggleLiquid: (id: string, value: boolean) => void;
  resetData: () => void;
};

export function usePortfolioData(authStatus: AuthStatus): UsePortfolioDataReturn {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot>(DEMO_SNAPSHOT);
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assets, setAssets] = useState<AssetValueItem[]>([]);
  const [workspace, setWorkspace] = useState<FinancialWorkspaceResponse | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  // Incremented on any position/transaction mutation to trigger workspace refresh.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpVersion = () => setDataVersion((v) => v + 1);

  const persistPosition = async (position: Position) => {
    try {
      const saved = position.id.startsWith('tmp-')
        ? await api.createPosition(toPositionWriteInput(position))
        : await api.updatePosition(position.id, toPositionWriteInput(position));
      setPositions((prev) => prev.map((p) => (p.id === position.id ? saved : p)));
      setApiConnected(true);
      bumpVersion();
    } catch {
      setApiConnected(false);
    }
  };

  const addPosition = (): Position => {
    const id = 'tmp-' + Math.random().toString(36).slice(2, 8);
    const pos: Position = { id, name: 'New Position', assetClass: 'Unclassified', value: 0, tags: [], liquid: false };
    setPositions((prev) => [pos, ...prev]);
    return pos;
  };

  const createPositionFromInput = (input: Omit<Position, 'id'>): Position => {
    const id = 'tmp-' + Math.random().toString(36).slice(2, 8);
    const pos: Position = { id, ...input };
    setPositions((prev) => [pos, ...prev]);
    void persistPosition(pos);
    return pos;
  };

  const updatePosition = (pos: Position) => {
    setPositions((prev) => prev.map((p) => (p.id === pos.id ? { ...p, ...pos } : p)));
    void persistPosition(pos);
  };

  const deletePosition = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    if (id.startsWith('tmp-')) return;
    void api
      .deletePosition(id)
      .then(() => { setApiConnected(true); bumpVersion(); })
      .catch(() => setApiConnected(false));
  };

  const toggleLiquid = (id: string, value: boolean) => {
    setPositions((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, liquid: value } : p));
      const changed = next.find((p) => p.id === id);
      if (changed) void persistPosition(changed);
      return next;
    });
  };

  const resetData = () => {
    setSnapshot(DEMO_SNAPSHOT);
    setPositions([]);
    setTransactions([]);
    setAssets([]);
    setWorkspace(null);
    setApiConnected(false);
  };

  // Load dashboard data on auth
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    api
      .dashboard()
      .then((dashboard) => {
        if (!active) return;
        setSnapshot(dashboard.snapshot);
        if (!isFallbackDemoPositions(dashboard.positions)) {
          setPositions(dashboard.positions);
        }
        setTransactions(dashboard.transactions);
        setApiConnected(true);
      })
      .catch(() => {
        if (!active) return;
        setApiConnected(false);
      });
    return () => { active = false; };
  }, [authStatus]);

  // Load assets on auth, sync with localStorage
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    const syncFromStorage = () => setAssets(readAssetsFromStorage());

    const loadAssets = async () => {
      syncFromStorage();
      try {
        const remote = await api.assets();
        const mapped = remote.map((item) => ({
          id: item.id,
          value: Number(item.value) || 0,
          liquid: !!item.liquid,
        }));
        setAssets(mapped);
        localStorage.setItem(LOCAL_STORAGE_KEYS.assets, JSON.stringify(mapped));
        window.dispatchEvent(new CustomEvent('fremont.assets.updated'));
      } catch {
        // Fallback stays local-only when API is unavailable.
      }
    };

    void loadAssets();
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('fremont.assets.updated', syncFromStorage as EventListener);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('fremont.assets.updated', syncFromStorage as EventListener);
    };
  }, [authStatus]);

  // Reload workspace when year changes or data is mutated
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setWorkspace(null);
      return;
    }
    let active = true;
    void api
      .financialWorkspace(selectedYear)
      .then((resp) => { if (active) setWorkspace(resp); })
      .catch(() => { if (active) setWorkspace(null); });
    return () => { active = false; };
  }, [authStatus, selectedYear, dataVersion]);

  const assetsNetWorth = useMemo(
    () => assets.reduce((sum, a) => sum + (Number(a.value) || 0), 0),
    [assets],
  );
  const assetsLiquidity = useMemo(
    () => assets.reduce((sum, a) => sum + (a.liquid ? Number(a.value) || 0 : 0), 0),
    [assets],
  );
  const baseNetWorth = useMemo(
    () => positions.reduce((sum, p) => sum + (Number(p.value) || 0), 0) + assetsNetWorth,
    [positions, assetsNetWorth],
  );
  const baseLiquidity = useMemo(
    () => positions.reduce((sum, p) => sum + (p.liquid ? Number(p.value) || 0 : 0), 0) + assetsLiquidity,
    [positions, assetsLiquidity],
  );

  return {
    snapshot,
    positions,
    transactions,
    assets,
    workspace,
    apiConnected,
    selectedYear,
    setSelectedYear,
    baseNetWorth,
    baseLiquidity,
    addPosition,
    createPositionFromInput,
    updatePosition,
    deletePosition,
    toggleLiquid,
    resetData,
  };
}
