import { useMemo, useState, useEffect } from 'react';
import type { PlanningCashflowStore } from '@fremont/shared';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { Position, Transaction } from '../types/models';
import { safeLocalGet, safeLocalSet } from '../utils/storage';

type Props = {
  positions: Position[];
  transactions?: Transaction[];
  onUpdatePosition?: (p: Position) => void;
  onDeletePosition?: (id: string) => void;
};

export function RawDataView({ positions, transactions = [], onUpdatePosition, onDeletePosition }: Props) {
  // Load modifiable sources into local state (CRUD)
  const [assets, setAssets] = useState<any[]>(() => safeLocalGet<any[]>(LOCAL_STORAGE_KEYS.assets, []));
  const [cashflows, setCashflows] = useState<Partial<PlanningCashflowStore>>(() => safeLocalGet(LOCAL_STORAGE_KEYS.planningCashflows, {}));
  const scenarios = safeLocalGet<any[]>(LOCAL_STORAGE_KEYS.planningScenarios, []);

  useEffect(() => { safeLocalSet(LOCAL_STORAGE_KEYS.assets, assets); }, [assets]);
  useEffect(() => { safeLocalSet(LOCAL_STORAGE_KEYS.planningCashflows, cashflows); }, [cashflows]);

  // Normalize all entities into one unified row model
  const rows = useMemo(() => {
    const out: Record<string, any>[] = [];

    positions.forEach((p) => {
      out.push({
        Kind: 'Position',
        Name: p.name,
        AssetClass: p.assetClass,
        Year: p.year ?? '',
        Value: p.value,
        Liquid: p.liquid ? 'Yes' : 'No',
        CostBasis: p.costBasis ?? '',
        IRR: p.irr ?? '',
        Tags: (p.tags || []).join(', '),
        Id: p.id,
      });
    });

    assets.forEach((a) => {
      out.push({
        Kind: 'Asset',
        Name: a.name ?? '—',
        Category: a.category ?? '—',
        Value: Number(a.value) || 0,
        Owner: a.owner ?? '—',
        Note: a.note ?? '—',
        Id: a.id ?? '',
      });
    });

    (cashflows.income || []).forEach((i) => {
      out.push({
        Kind: 'Income',
        Name: i.name ?? '—',
        Amount: Number(i.amount) || 0,
        Start: i.start ?? '',
        End: i.end ?? '',
        Id: i.id ?? '',
      });
    });

    (cashflows.outflow || []).forEach((i) => {
      out.push({
        Kind: 'Outflow',
        Name: i.name ?? '—',
        Amount: Number(i.amount) || 0,
        Start: i.start ?? '',
        End: i.end ?? '',
        Id: i.id ?? '',
      });
    });

    scenarios.forEach((s) => {
      out.push({
        Kind: 'Scenario',
        Name: s.name ?? '—',
        StartYear: s.startYear ?? '',
        HorizonYears: s.horizonYears ?? '',
        BaseNetWorth: s.baseNetWorth ?? '',
        BaseLiquidity: s.baseLiquidity ?? '',
        EventsCount: Array.isArray(s.events) ? s.events.length : 0,
        Id: s.id ?? '',
      });
    });

    transactions.forEach((t) => {
      out.push({
        Kind: 'Transaction',
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        Category: t.category,
        Tags: (t.tags || []).join(', '),
        Id: t.id,
      });
    });

    return out;
  }, [positions, assets, cashflows, scenarios, transactions]);

  // Filtering & search
  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.Kind))), [rows]);
  const [query, setQuery] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const toggleKind = (k: string) =>
    setSelectedKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedKinds.length && !selectedKinds.includes(r.Kind)) return false;
      if (!q) return true;
      return Object.values(r).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, selectedKinds]);

  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    // Ensure Kind and Name appear first
    const all = Array.from(set);
    all.sort((a, b) => {
      const order = ['Kind', 'Name'];
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
    return all;
  }, [rows]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="text-base font-semibold text-slate-800">Unified Raw Data <span className="text-sm font-normal text-slate-500">({filtered.length}/{rows.length})</span></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Add controls */}
          <select id="add-kind" className="rounded-md border border-slate-200 px-2 py-1 text-sm">
            <option value="Asset">Asset</option>
            <option value="Income">Income</option>
            <option value="Outflow">Outflow</option>
          </select>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={() => {
              const sel = (document.getElementById('add-kind') as HTMLSelectElement).value;
              const id = Math.random().toString(36).slice(2,8);
              if (sel === 'Asset') {
                setAssets((prev) => [{ id, name: 'New Asset', category: 'Uncategorized', value: 0 }, ...prev]);
              } else if (sel === 'Income') {
                setCashflows((prev) => ({ ...prev, income: [{ id, name: 'New Income', amount: 1000, start: new Date().getFullYear(), end: new Date().getFullYear() }, ...((prev.income)||[]) ] }));
              } else if (sel === 'Outflow') {
                setCashflows((prev) => ({ ...prev, outflow: [{ id, name: 'New Outflow', amount: 500, start: new Date().getFullYear(), end: new Date().getFullYear() }, ...((prev.outflow)||[]) ] }));
              }
            }}
          >
            Add
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all fields"
            className="w-56 rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap items-center gap-1">
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={
                  'rounded-full px-2 py-0.5 text-xs ' +
                  (selectedKinds.includes(k)
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                }
                title={`Filter Kind: ${k}`}
              >
                {k}
              </button>
            ))}
            {selectedKinds.length > 0 && (
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => setSelectedKinds([])}
              >
                Clear Kinds
              </button>
            )}
          </div>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(filtered, null, 2))}
          >
            Copy JSON
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r, idx) => {
              const deleteRow = () => {
                if (r.Kind === 'Asset') setAssets((prev) => prev.filter((a) => a.id === r.Id ? false : true));
                if (r.Kind === 'Income') setCashflows((prev) => ({ ...prev, income: (prev.income || []).filter((i) => i.id !== r.Id) }));
                if (r.Kind === 'Outflow') setCashflows((prev) => ({ ...prev, outflow: (prev.outflow || []).filter((i) => i.id !== r.Id) }));
                if (r.Kind === 'Position' && onDeletePosition) onDeletePosition(r.Id);
              };
              const beginEdit = () => {
                const name = prompt('Name', String(r.Name ?? ''));
                if (name == null) return;
                if (r.Kind === 'Asset') setAssets((prev) => prev.map((a) => a.id === r.Id ? { ...a, name } : a));
                if (r.Kind === 'Income') setCashflows((prev) => ({ ...prev, income: (prev.income || []).map((i) => i.id === r.Id ? { ...i, name } : i) }));
                if (r.Kind === 'Outflow') setCashflows((prev) => ({ ...prev, outflow: (prev.outflow || []).map((i) => i.id === r.Id ? { ...i, name } : i) }));
                if (r.Kind === 'Position' && onUpdatePosition) {
                  onUpdatePosition({
                    id: r.Id,
                    name,
                    assetClass: r.AssetClass || 'Unclassified',
                    year: r.Year !== '' && r.Year != null ? Number(r.Year) : undefined,
                    value: Number(r.Value) || 0,
                    liquid: String(r.Liquid).toLowerCase() === 'yes',
                    tags: String(r.Tags || '').split(',').map((s)=>s.trim()).filter(Boolean),
                  } as Position);
                }
              };
              return (
                <tr key={idx}>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-slate-700 align-top">
                      {typeof r[c] === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(r[c]) : String(r[c])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={beginEdit}>Edit</button>
                      <button className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={deleteRow}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={columns.length}>No data matches your filter</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
